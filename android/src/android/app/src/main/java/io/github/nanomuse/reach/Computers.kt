package io.github.nanomuse.reach

import android.content.Context
import android.os.Build
import com.openminis.app.logging.AppLogger
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.util.UUID
import java.util.concurrent.TimeUnit

/**
 * The computers this phone is paired with (0.1.13 Reach) and the calls to them. One way:
 * the phone drives the computer through `host/nanomuse_host.py`, a small stdlib-only server
 * on the same network; the computer never reaches into the phone.
 *
 * Each computer has its own bearer token, kept in the app's private preferences. The host keeps
 * only a hash of it. Approvals for what runs there are decided here, on the phone, before a
 * request is sent — the host has no way to judge intent.
 */
object Computers {
    private const val PREFS = "nanomuse"
    private const val SECURE_PREFS = "nanomuse_secure"
    private const val KEY = "reach.computers"
    const val DEEP_LINK = "minis://settings/computers"
    const val DEFAULT_PORT = 7333
    const val HOST_SCRIPT_URL = "https://raw.githubusercontent.com/nano-muse/nanoMuse/main/host/nanomuse_host.py"

    data class Computer(
        val id: String,
        val name: String,
        val os: String,
        val host: String,
        val port: Int,
        val token: String,
        val pairedAt: Long,
        val lastSeen: Long = 0L,
        /** Set for a device reached through the hub (any network) rather than the local network. */
        val hubId: String? = null,
        val kind: String = "computer",
    ) {
        val viaHub: Boolean get() = hubId != null
        val address: String get() = if (viaHub) "hub" else "$host:$port"
        fun url(path: String): String = "http://$host:$port$path"
    }

    private val _list = MutableStateFlow<List<Computer>?>(null)

    /** The paired computers, loaded once; the settings page and the CLI observe it. */
    fun list(context: Context): List<Computer> {
        _list.value?.let { return it }
        val loaded = load(context)
        _list.value = loaded
        return loaded
    }

    fun flow(context: Context): StateFlow<List<Computer>?> { list(context); return _list.asStateFlow() }

    /**
     * The pairing tokens are bearer credentials for the computers, so they live in the same
     * encrypted store as API keys (and are excluded from backups). A list saved by an older
     * build in the plain store is moved over once.
     */
    private fun store(context: Context) = com.openminis.app.util.EncryptedPrefsFactory.safeCreate(context, SECURE_PREFS)

    private fun load(context: Context): List<Computer> {
        val secure = store(context)
        var raw = secure.getString(KEY, null)
        if (raw == null) {
            val plain = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            raw = plain.getString(KEY, null) ?: return emptyList()
            secure.edit().putString(KEY, raw).apply()
            plain.edit().remove(KEY).apply()
        }
        return runCatching {
            val arr = JSONArray(raw)
            (0 until arr.length()).map { i ->
                val o = arr.getJSONObject(i)
                Computer(
                    o.getString("id"), o.optString("name"), o.optString("os"), o.getString("host"), o.optInt("port", DEFAULT_PORT),
                    o.getString("token"), o.optLong("pairedAt"), o.optLong("lastSeen"),
                )
            }
        }.getOrElse { emptyList() }
    }

    private fun save(context: Context, list: List<Computer>) {
        val arr = JSONArray()
        list.forEach { c ->
            arr.put(
                JSONObject().put("id", c.id).put("name", c.name).put("os", c.os).put("host", c.host).put("port", c.port)
                    .put("token", c.token).put("pairedAt", c.pairedAt).put("lastSeen", c.lastSeen),
            )
        }
        store(context).edit().putString(KEY, arr.toString()).apply()
        _list.value = list
    }

    fun forget(context: Context, id: String) = save(context, list(context).filterNot { it.id == id })

    private fun update(context: Context, c: Computer) = save(context, list(context).map { if (it.id == c.id) c else it })

    /** The devices reachable through the hub right now, as computers: other computers and other phones alike. */
    fun hubDevices(context: Context, computersOnly: Boolean = false): List<Computer> =
        io.github.nanomuse.hub.Hub.others(context)
            .filter { it.online && (!computersOnly || it.isComputer) }
            .map { d ->
                Computer(
                    id = "hub:" + d.id, name = d.name, os = d.os, host = "hub", port = 0, token = "",
                    pairedAt = 0L, lastSeen = d.lastSeen, hubId = d.id, kind = d.kind,
                )
            }

    /** Every device a command may go to: the LAN-paired computers, then whatever is on the hub. */
    fun all(context: Context): List<Computer> {
        val lan = list(context)
        val hub = hubDevices(context).filterNot { h -> lan.any { it.name.equals(h.name, true) } }
        return lan + hub
    }

    /** By name (case-insensitive), by address or by id; with none named, the only or the first computer. */
    fun resolve(context: Context, nameOrNull: String?): Computer? {
        val all = all(context)
        if (nameOrNull.isNullOrBlank()) return all.firstOrNull { it.kind == "computer" } ?: all.firstOrNull()
        val q = nameOrNull.trim()
        return all.firstOrNull { it.name.equals(q, true) } ?: all.firstOrNull { it.address == q || it.host == q } ?: all.firstOrNull { it.id == q || it.hubId == q }
            ?: all.firstOrNull { it.name.contains(q, true) }
            ?: when (q.lowercase()) {
                "pc", "computer", "desktop", "电脑", "mac", "windows" -> all.filter { it.kind == "computer" }.singleOrNull()
                "phone", "手机" -> all.filter { it.kind == "phone" }.singleOrNull()
                else -> null
            }
    }

    // ── the calls ──────────────────────────────────────────────────────────

    class ReachException(val code: Int, message: String) : IOException(message)

    private val http: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(5, TimeUnit.SECONDS)
            .readTimeout(120, TimeUnit.SECONDS)
            .writeTimeout(60, TimeUnit.SECONDS)
            .build()
    }

    private val JSON = "application/json; charset=utf-8".toMediaType()
    private val BYTES = "application/octet-stream".toMediaType()

    private fun deviceName(): String = listOf(Build.MANUFACTURER, Build.MODEL).filter { it.isNotBlank() }.joinToString(" ").ifBlank { "Android" } + " · nanoMuse"

    /** Pairs with the host at [host]:[port] using the code on its screen; saves and returns the computer. */
    @Throws(IOException::class)
    fun pair(context: Context, host: String, port: Int, code: String): Computer {
        val body = JSONObject().put("code", code.trim().replace(" ", "")).put("device", deviceName()).toString()
        val req = Request.Builder().url("http://$host:$port/pair").post(body.toRequestBody(JSON)).build()
        http.newCall(req).execute().use { resp ->
            val text = resp.body?.string().orEmpty()
            if (!resp.isSuccessful) throw ReachException(resp.code, errorMessage(text, resp.code))
            val o = JSONObject(text)
            val c = Computer(
                id = UUID.randomUUID().toString(),
                name = o.optString("name").ifBlank { host },
                os = o.optString("os"),
                host = host, port = port,
                token = o.getString("token"),
                pairedAt = System.currentTimeMillis(),
                lastSeen = System.currentTimeMillis(),
            )
            save(context, list(context).filterNot { it.host == host && it.port == port } + c)
            return c
        }
    }

    private fun errorMessage(text: String, code: Int): String =
        runCatching { JSONObject(text).optString("message").ifBlank { null } }.getOrNull() ?: "HTTP $code"

    private fun call(context: Context, c: Computer, req: Request.Builder): Pair<Int, ByteArray> {
        val r = req.header("Authorization", "Bearer ${c.token}").build()
        http.newCall(r).execute().use { resp ->
            val bytes = resp.body?.bytes() ?: ByteArray(0)
            if (!resp.isSuccessful) throw ReachException(resp.code, errorMessage(String(bytes), resp.code))
            update(context, c.copy(lastSeen = System.currentTimeMillis()))
            return resp.code to bytes
        }
    }

    private fun json(context: Context, c: Computer, req: Request.Builder): JSONObject = JSONObject(String(call(context, c, req).second))

    // Through the hub, the same actions travel as JSON frames; the desktop answers them itself.
    private fun hub(c: Computer, action: String, args: JSONObject = JSONObject(), timeoutMs: Long = 120_000L, onEvent: ((JSONObject) -> Unit)? = null): JSONObject =
        try {
            io.github.nanomuse.hub.Hub.call(c.hubId!!, action, args, timeoutMs, onEvent)
        } catch (e: io.github.nanomuse.hub.HubException) {
            throw ReachException(
                when (e.code) { "device_offline", "disconnected" -> 503; "timeout" -> 504; "not_allowed" -> 403; "not_found" -> 404; "exists" -> 409; else -> 400 },
                e.message ?: e.code,
            )
        }

    @Throws(IOException::class)
    fun info(context: Context, c: Computer): JSONObject =
        if (c.viaHub) hub(c, "info", timeoutMs = 15_000L) else json(context, c, Request.Builder().url(c.url("/info")).get())

    /** Runs [command] in the computer's shell; the caller has already had it approved. */
    @Throws(IOException::class)
    fun shell(context: Context, c: Computer, command: String, cwd: String?, timeoutS: Int): JSONObject {
        val body = JSONObject().put("command", command).put("timeout", timeoutS).apply { if (!cwd.isNullOrBlank()) put("cwd", cwd) }
        if (c.viaHub) return hub(c, "shell", body, timeoutMs = timeoutS * 1000L + 30_000L)
        return json(context, c, Request.Builder().url(c.url("/shell")).post(body.toString().toRequestBody(JSON)))
    }

    @Throws(IOException::class)
    fun files(context: Context, c: Computer, path: String?): JSONObject {
        if (c.viaHub) return hub(c, "files", JSONObject().apply { if (path != null) put("path", path) })
        return json(context, c, Request.Builder().url(c.url("/files") + (path?.let { "?path=" + java.net.URLEncoder.encode(it, "UTF-8") } ?: "")).get())
    }

    @Throws(IOException::class)
    fun getFile(context: Context, c: Computer, path: String, dest: File): Long {
        val bytes = if (c.viaHub) {
            android.util.Base64.decode(hub(c, "file.get", JSONObject().put("path", path), timeoutMs = 300_000L).optString("data"), android.util.Base64.DEFAULT)
        } else {
            call(context, c, Request.Builder().url(c.url("/file") + "?path=" + java.net.URLEncoder.encode(path, "UTF-8")).get()).second
        }
        dest.parentFile?.mkdirs()
        dest.writeBytes(bytes)
        return bytes.size.toLong()
    }

    @Throws(IOException::class)
    fun putFile(context: Context, c: Computer, local: File, remotePath: String, force: Boolean = false): JSONObject {
        if (c.viaHub) {
            val data = android.util.Base64.encodeToString(local.readBytes(), android.util.Base64.NO_WRAP)
            return hub(c, "file.put", JSONObject().put("path", remotePath).put("data", data).put("force", force), timeoutMs = 300_000L)
        }
        return json(
            context, c,
            Request.Builder().url(c.url("/file") + "?path=" + java.net.URLEncoder.encode(remotePath, "UTF-8")).put(local.readBytes().toRequestBody(BYTES)),
        )
    }

    @Throws(IOException::class)
    fun open(context: Context, c: Computer, url: String): JSONObject {
        if (c.viaHub) return hub(c, "open", JSONObject().put("url", url))
        return json(context, c, Request.Builder().url(c.url("/open")).post(JSONObject().put("url", url).toString().toRequestBody(JSON)))
    }

    /** A picture of the computer's screen, or null when the host cannot take one. */
    @Throws(IOException::class)
    fun screen(context: Context, c: Computer): Pair<ByteArray, String>? {
        if (c.viaHub) {
            val r = try { hub(c, "screen", timeoutMs = 60_000L) } catch (e: ReachException) { if (e.message?.contains("no_screen") == true || e.code == 400) return null else throw e }
            return android.util.Base64.decode(r.optString("data"), android.util.Base64.DEFAULT) to r.optString("mime").ifBlank { "image/jpeg" }
        }
        val r = Request.Builder().url(c.url("/screen")).get().header("Authorization", "Bearer ${c.token}").build()
        http.newCall(r).execute().use { resp ->
            if (resp.code == 501) return null
            val bytes = resp.body?.bytes() ?: ByteArray(0)
            if (!resp.isSuccessful) throw ReachException(resp.code, errorMessage(String(bytes), resp.code))
            update(context, c.copy(lastSeen = System.currentTimeMillis()))
            return bytes to (resp.header("Content-Type") ?: "image/png")
        }
    }

    /** Sends a notification to the device (hub devices only). */
    @Throws(IOException::class)
    fun notify(c: Computer, text: String, title: String?): JSONObject {
        if (!c.viaHub) throw ReachException(501, "${c.name} is paired over the local network, which has no notifications; run nanoMuse Desktop there")
        return hub(c, "notify", JSONObject().put("text", text).apply { if (!title.isNullOrBlank()) put("title", title) })
    }

    /**
     * Hands a whole task to the Muse running on the device and waits for its answer. Progress
     * arrives through [onEvent]; an `approval` event is a question from that Muse, answered with
     * `approve` — the caller decides how (on the phone: the usual card).
     */
    @Throws(IOException::class)
    fun task(context: Context, c: Computer, text: String, onEvent: (JSONObject) -> Unit): JSONObject {
        if (!c.viaHub) throw ReachException(501, "${c.name} is paired over the local network; tasks need nanoMuse Desktop on the hub")
        return hub(c, "task", JSONObject().put("text", text).put("from", io.github.nanomuse.hub.Hub.name(context)), timeoutMs = 10 * 60_000L, onEvent = onEvent)
    }

    fun approve(c: Computer, approvalId: String, allow: Boolean) {
        if (!c.viaHub) return
        runCatching { hub(c, "approve", JSONObject().put("approval_id", approvalId).put("allow", allow), timeoutMs = 30_000L) }
    }

    /** True when the host answers /info within a few seconds. */
    fun reachable(context: Context, c: Computer): Boolean = try {
        info(context, c); true
    } catch (t: Throwable) {
        AppLogger.info(TAG, "${c.name} unreachable: ${t.message}"); false
    }

    // ── what the agent is told ─────────────────────────────────────────────

    fun promptParagraph(context: Context): String {
        val all = all(context)
        val onHub = io.github.nanomuse.hub.Hub.isConnected
        return buildString {
            append("## Your devices (nanoMuse)\n")
            if (all.isEmpty()) {
                append("No other device is connected right now. The way to add a computer: install nanoMuse Desktop there (https://nanomuse.cn/#download) and sign in with the same nanoMuse Cloud account — it appears under [Devices](${io.github.nanomuse.hub.Hub.DEEP_LINK}) within seconds, on any network. Pairing over the local network with `nanomuse_host.py` under [Computers]($DEEP_LINK) is the fallback for a computer without the account. ")
                append("When the user wants something done on their PC or Mac, say so in one line and point to the desktop app. ")
                if (!onHub) append("This phone is not on the hub itself; signing in to nanoMuse Cloud puts it there. ")
            } else {
                append("Connected: ").append(all.joinToString("; ") { "${it.name} (${it.kind}, ${it.os}, ${if (it.viaHub) "via the hub — any network" else "local network " + it.address})" }).append(". ")
                append("`nanomuse-pc run \"<command>\" [--on <device>] [--cwd <dir>] [--timeout <s>]` runs a shell command there and returns exit code, stdout and stderr — the same approval rules as the phone's shell apply, decided on this phone before anything is sent; ")
                append("`nanomuse-pc ls [<path>]` lists a folder; `nanomuse-pc get <remote> [--name <file>]` copies a file into this chat's attachments (pictures then render with `![…](minis://attachments/<file>)`); `nanomuse-pc put <local> <remote>` copies one there; ")
                append("`nanomuse-pc open <url>` opens a page there; `nanomuse-pc screen` takes a picture of its screen into the attachments; `nanomuse-pc notify \"<text>\"` shows a notification there; `nanomuse-pc status` says which devices answer. ")
                append("`nanomuse-pc task \"<what to do, in plain words, with every detail>\" --on <device>` hands a whole task to the Muse running on that device and returns its answer — use it when the job needs that device's own apps, files, screen or judgement (a computer's browser or documents, another phone's apps); it may take minutes, and if that Muse needs an approval the card shows here. ")
                append("The other device's shell is the user's own account: same care as with `rm`, `git push --force` or anything that sends. When it does not answer, say it is offline and point to [Devices](${io.github.nanomuse.hub.Hub.DEEP_LINK}).")
            }
        }
    }

    private const val TAG = "Computers"
}
