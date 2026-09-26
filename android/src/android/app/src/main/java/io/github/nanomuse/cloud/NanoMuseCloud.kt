package io.github.nanomuse.cloud

import android.content.Context
import android.os.Build
import com.openminis.app.BuildConfig
import com.openminis.app.MinisApp
import com.openminis.app.R
import com.openminis.app.data.model.ModelGroup
import com.openminis.app.data.model.ProviderCredential
import com.openminis.app.data.model.ProviderInstance
import com.openminis.app.data.model.ProviderType
import com.openminis.app.data.repository.ProviderRepository
import io.github.nanomuse.avatar.ImageGen
import java.io.IOException
import java.util.UUID
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject

/**
 * nanoMuse Cloud: the "start now" path. A phone number or an e-mail address, a code, and the
 * app has a provider with a starter allowance — no key of one's own needed. The server is the
 * relay in `cloud/` of the repository; anyone can run one, and a debug build can be pointed at
 * a different one.
 *
 * To the rest of the app the relay is an ordinary OpenAI-compatible provider: an API-key
 * [ProviderInstance] on the relay's base URL, whose key is the `nm_…` token the relay issued.
 * Chat, model listing, and the avatar's pictures all go through the paths that already exist
 * for any custom base URL. What this object adds is the sign-in itself, the provisioning of
 * that instance (models fetched, a default group, the image model), and the account meta the
 * settings page shows (how much is left).
 *
 * What the relay keeps about a person is the hashed identifier and token counts; message
 * content is forwarded to the model, not stored. See `docs/cloud.md`.
 */
object NanoMuseCloud {
    const val DEFAULT_BASE = "https://cloud.nanomuse.cn"
    const val LABEL = "nanoMuse Cloud"

    private const val PREFS = "nanomuse"
    private const val KEY_BASE = "cloud.base"
    private const val KEY_INSTANCE = "cloud.instance_id"
    private const val KEY_CHANNEL = "cloud.channel"
    private const val KEY_HINT = "cloud.hint"
    private const val KEY_GRANTED = "cloud.granted"
    private const val KEY_USED = "cloud.used"
    private const val KEY_USED_TODAY = "cloud.used_today"
    private const val KEY_DAILY_CAP = "cloud.daily_cap"
    private const val KEY_CHECKED_AT = "cloud.checked_at"

    class CloudException(val code: String, message: String, val status: Int = 0) : IOException(message)

    /** What the settings page shows. Cached from the last `/v1/me` (or the sign-in itself). */
    data class Account(
        val channel: String,
        val hint: String,
        val granted: Long,
        val used: Long,
        val usedToday: Long,
        val dailyCap: Long,
        val checkedAt: Long,
    ) {
        val remaining: Long get() = (granted - used).coerceAtLeast(0)
        /** 0..1 of the grant still unspent. */
        val fraction: Float get() = if (granted <= 0) 0f else (remaining.toFloat() / granted.toFloat()).coerceIn(0f, 1f)
    }

    private val http: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(20, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .build()
    }
    private val json = "application/json; charset=utf-8".toMediaType()

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /** The relay this build talks to. Debug builds may override it (a laptop on the same Wi-Fi). */
    fun baseUrl(context: Context): String =
        prefs(context).getString(KEY_BASE, null)?.takeIf { BuildConfig.DEBUG && it.isNotBlank() }?.trimEnd('/')
            ?: DEFAULT_BASE

    fun setBaseUrl(context: Context, url: String?) {
        prefs(context).edit().apply {
            if (url.isNullOrBlank()) remove(KEY_BASE) else putString(KEY_BASE, url.trim().trimEnd('/'))
        }.apply()
    }

    fun canOverrideBase(): Boolean = BuildConfig.DEBUG

    /** The provider instance the relay is signed in as, if it still exists. */
    fun instance(context: Context): ProviderInstance? {
        val id = prefs(context).getString(KEY_INSTANCE, null) ?: return null
        return repo(context)?.instance(id)
    }

    fun isSignedIn(context: Context): Boolean {
        val inst = instance(context) ?: return false
        return !repo(context)?.loadApiKey(inst.id).isNullOrBlank()
    }

    /** The account key this phone signed in with — the hub authenticates with it too. */
    fun apiKey(context: Context): String? {
        val inst = instance(context) ?: return null
        return repo(context)?.loadApiKey(inst.id)?.takeIf { it.isNotBlank() }
    }

    fun account(context: Context): Account? {
        val p = prefs(context)
        val hint = p.getString(KEY_HINT, null) ?: return null
        return Account(
            channel = p.getString(KEY_CHANNEL, "") ?: "",
            hint = hint,
            granted = p.getLong(KEY_GRANTED, 0),
            used = p.getLong(KEY_USED, 0),
            usedToday = p.getLong(KEY_USED_TODAY, 0),
            dailyCap = p.getLong(KEY_DAILY_CAP, 0),
            checkedAt = p.getLong(KEY_CHECKED_AT, 0),
        )
    }

    /** Ask the relay to send a code. Throws [CloudException] with the relay's `code`. */
    suspend fun requestCode(context: Context, identifier: String) = withContext(Dispatchers.IO) {
        call(context, "POST", "/v1/auth/code", JSONObject().put("identifier", identifier.trim()), token = null)
        Unit
    }

    /**
     * Exchange the code for a key and make the relay a usable provider: instance, key, models,
     * a default group with the recommended chat model (only if the user has none yet), and the
     * image model for the avatar (only if none is set). Returns the account as the relay sees it.
     */
    suspend fun verify(context: Context, identifier: String, code: String): Account = withContext(Dispatchers.IO) {
        val repo = repo(context) ?: throw CloudException("no_repository", "Provider storage is not ready")
        val body = JSONObject()
            .put("identifier", identifier.trim())
            .put("code", code.trim())
            .put("device", "${Build.MANUFACTURER} ${Build.MODEL}".trim().take(80))
        val reply = call(context, "POST", "/v1/auth/verify", body, token = null)
        val apiKey = reply.optString("api_key").takeIf { it.isNotBlank() }
            ?: throw CloudException("bad_reply", "The relay sent no key")
        // The host the code was sent to is the host the key is for; the relay's own idea of
        // its public address (`base_url`) is informational.
        val base = baseUrl(context)

        // One instance per relay: signing in again on the same phone refreshes the key and
        // keeps the entries, groups and the image model that already point at it.
        val existing = instance(context)
        val inst = existing?.let {
            if (it.customBaseURL == base) it else it.copy(customBaseURL = base).also(repo::updateInstance)
        } ?: ProviderInstance(
            id = UUID.randomUUID().toString(),
            label = LABEL,
            providerType = ProviderType.openAI,
            credentialType = ProviderCredential.apiKey,
            customBaseURL = base,
            appendV1Suffix = true,
        ).also { repo.addInstance(it) }
        repo.saveApiKey(inst.id, apiKey)
        prefs(context).edit().putString(KEY_INSTANCE, inst.id).apply()

        // The models the relay serves — same `/v1/models` call every provider gets; the relay
        // includes modalities so the picture model is recognised as one.
        runCatching { repo.refreshModels(inst) }
        provisionDefaults(context, repo, inst, reply.optJSONArray("models"))

        saveAccount(context, reply)
        io.github.nanomuse.hub.Hub.restart(context) // the new key joins the hub
        account(context)!!
    }

    /** Re-read the balance. Returns null (and forgets the account) when the key is gone. */
    suspend fun refresh(context: Context): Account? = withContext(Dispatchers.IO) {
        val inst = instance(context) ?: return@withContext null
        val key = repo(context)?.loadApiKey(inst.id) ?: return@withContext null
        try {
            val me = call(context, "GET", "/v1/me", null, token = key)
            saveAccount(context, me)
            account(context)
        } catch (e: CloudException) {
            if (e.status == 401) {
                // Revoked elsewhere, or the relay was reset: the provider cannot answer any more.
                io.github.nanomuse.hub.Hub.stop(context)
                repo(context)?.removeInstance(inst.id)
                clear(context)
                null
            } else {
                account(context)
            }
        }
    }

    /** Revoke this phone's key at the relay and take the provider out of the app. */
    suspend fun signOut(context: Context) = withContext(Dispatchers.IO) {
        val repo = repo(context)
        val inst = instance(context)
        val key = inst?.let { repo?.loadApiKey(it.id) }
        if (inst != null && key != null) {
            runCatching { call(context, "POST", "/v1/auth/sign-out", null, token = key) }
        }
        io.github.nanomuse.hub.Hub.stop(context)
        if (inst != null) repo?.removeInstance(inst.id)
        clear(context)
    }

    /** A sentence for the person, from the relay's stable error codes. */
    fun describe(context: Context, e: Throwable): String = when (e) {
        is CloudException -> when (e.code) {
            "bad_identifier" -> context.getString(R.string.nm_cloud_err_bad_identifier)
            "code_wrong" -> context.getString(R.string.nm_cloud_err_code_wrong)
            "code_expired" -> context.getString(R.string.nm_cloud_err_code_expired)
            "code_too_often" -> context.getString(R.string.nm_cloud_err_code_too_often)
            "send_failed" -> context.getString(R.string.nm_cloud_err_send_failed)
            "account_disabled" -> context.getString(R.string.nm_cloud_err_disabled)
            "bad_key" -> context.getString(R.string.nm_cloud_err_bad_key)
            "out_of_tokens" -> context.getString(R.string.nm_cloud_err_out_of_tokens)
            "daily_cap" -> context.getString(R.string.nm_cloud_err_daily_cap)
            "rate_limited" -> context.getString(R.string.nm_cloud_err_rate_limited)
            "unreachable" -> context.getString(R.string.nm_cloud_err_unreachable)
            else -> e.message ?: context.getString(R.string.nm_cloud_err_generic)
        }
        is IOException -> context.getString(R.string.nm_cloud_err_unreachable)
        else -> e.message ?: context.getString(R.string.nm_cloud_err_generic)
    }

    // -- internals -------------------------------------------------------------------------------

    private fun repo(context: Context): ProviderRepository? =
        (context.applicationContext as? MinisApp)?.providerRepositoryOrNull

    /**
     * After the key: a default group if the user has none, and the image model for the avatar
     * if none is set. Nothing of the user's own is replaced — someone who already has a key
     * and a group keeps them and gets the relay as one more provider.
     */
    private fun provisionDefaults(context: Context, repo: ProviderRepository, inst: ProviderInstance, models: JSONArray?) {
        val offered = (0 until (models?.length() ?: 0)).mapNotNull { models?.optJSONObject(it) }
        val recommendedChat = offered.firstOrNull {
            it.optJSONObject("nanomuse")?.optBoolean("recommended") == true && !drawsOnly(it)
        }?.optString("id") ?: offered.firstOrNull { !drawsOnly(it) }?.optString("id")
        val imageModel = offered.firstOrNull { drawsOnly(it) }?.optString("id")

        val config = repo.config.value
        val entries = config.modelEntries.filter { it.providerInstanceId == inst.id && !it.isHidden }
        val chatEntry = entries.firstOrNull { it.model.id == recommendedChat }
            ?: entries.firstOrNull { !ImageGen.looksLikeImageModel(it.model.id) }
        if (chatEntry != null) {
            val already = config.modelGroups.any { chatEntry.id in it.memberEntryIds }
            if (!already) {
                val group = ModelGroup(name = LABEL)
                group.memberEntryIds.add(chatEntry.id)
                repo.addGroup(group)
                if (repo.defaultPrimaryGroupId == null) repo.defaultPrimaryGroupId = group.id
            }
        }
        if (imageModel != null) {
            val current = ImageGen.endpoint(context)
            if (current == null || current.instanceId == inst.id) ImageGen.save(context, inst.id, imageModel)
        }
    }

    private fun drawsOnly(model: JSONObject): Boolean {
        val out = model.optJSONObject("architecture")?.optJSONArray("output_modalities")
        val mods = (0 until (out?.length() ?: 0)).map { out!!.optString(it) }
        return "image" in mods && "text" !in mods
    }

    private fun saveAccount(context: Context, reply: JSONObject) {
        val account = reply.optJSONObject("account") ?: JSONObject()
        val tokens = reply.optJSONObject("tokens") ?: JSONObject()
        prefs(context).edit()
            .putString(KEY_CHANNEL, account.optString("channel"))
            .putString(KEY_HINT, account.optString("hint"))
            .putLong(KEY_GRANTED, tokens.optLong("granted"))
            .putLong(KEY_USED, tokens.optLong("used"))
            .putLong(KEY_USED_TODAY, tokens.optLong("used_today"))
            .putLong(KEY_DAILY_CAP, tokens.optLong("daily_cap"))
            .putLong(KEY_CHECKED_AT, System.currentTimeMillis())
            .apply()
    }

    private fun clear(context: Context) {
        prefs(context).edit()
            .remove(KEY_INSTANCE).remove(KEY_CHANNEL).remove(KEY_HINT)
            .remove(KEY_GRANTED).remove(KEY_USED).remove(KEY_USED_TODAY).remove(KEY_DAILY_CAP).remove(KEY_CHECKED_AT)
            .apply()
    }

    private fun call(context: Context, method: String, path: String, body: JSONObject?, token: String?): JSONObject {
        val builder = Request.Builder().url(baseUrl(context) + path)
        if (token != null) builder.header("Authorization", "Bearer $token")
        builder.header("User-Agent", "nanoMuse-Android/${BuildConfig.VERSION_NAME}")
        when (method) {
            "GET" -> builder.get()
            else -> builder.method(method, (body?.toString() ?: "{}").toRequestBody(json))
        }
        val response = try {
            http.newCall(builder.build()).execute()
        } catch (e: IOException) {
            throw CloudException("unreachable", e.message ?: "unreachable")
        }
        response.use { r ->
            val text = r.body?.string().orEmpty()
            if (r.isSuccessful) {
                return if (text.isBlank()) JSONObject() else runCatching { JSONObject(text) }.getOrElse { JSONObject() }
            }
            val err = runCatching { JSONObject(text).optJSONObject("error") }.getOrNull()
            throw CloudException(
                code = err?.optString("code")?.takeIf { it.isNotBlank() } ?: "http_${r.code}",
                message = err?.optString("message")?.takeIf { it.isNotBlank() } ?: "HTTP ${r.code}",
                status = r.code,
            )
        }
    }
}
