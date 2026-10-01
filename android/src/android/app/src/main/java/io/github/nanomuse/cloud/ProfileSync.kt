package io.github.nanomuse.cloud

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import android.util.Base64
import com.openminis.app.agent.SoulStore
import com.openminis.app.logging.AppLogger
import io.github.nanomuse.avatar.AvatarStore
import io.github.nanomuse.ui.avatar.AgentMood
import java.io.ByteArrayOutputStream
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import org.json.JSONObject

/**
 * The agent's name and look, the same on every device of the account.
 *
 * The relay keeps one profile per account (`/v1/me/profile`: the name, which face, and a drawn
 * face's five stills as WebP) and says `{"type": "profile", "rev"}` on the hub when it changes.
 * Here: **pull** on sign-in, on app start and on that frame, worn when the relay's `rev` is
 * newer than the one last seen on this phone; **push** a moment after the name (SOUL.md) or
 * the face ([AvatarStore]) changes here. The pictures ride along only when the face itself
 * changed. Never a key, never a message — the runtime does the same in `nanomuse/hub/profile.py`.
 *
 * An emoji look chosen on the web has no picture here, so the phone wears the dragon for it.
 */
object ProfileSync {
    private const val TAG = "ProfileSync"
    private const val PREFS = "nanomuse_profile_sync"
    private const val KEY_REV = "rev"
    private const val KEY_PUSHED_FACE = "pushed_face"
    private const val KEY_PUSHED_NAME = "pushed_name"
    private const val PUSH_DELAY_MS = 2_500L
    private const val DRAGON = "dragon"

    private val moods = mapOf(
        "idle" to AgentMood.IDLE,
        "working" to AgentMood.WORKING,
        "waiting" to AgentMood.WAITING,
        "happy" to AgentMood.HAPPY,
        "error" to AgentMood.ERROR,
    )

    private val worker = Executors.newSingleThreadScheduledExecutor { r -> Thread(r, "nm-profile-sync").apply { isDaemon = true } }
    private var app: Context? = null
    private var pending: ScheduledFuture<*>? = null
    /** Set while a pulled profile is being worn, so the change does not push back. */
    @Volatile private var applying = false

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /** App start: remember the context for the stores' callbacks and fetch what the account wears. */
    fun init(context: Context) {
        app = context.applicationContext
        pullSoon(context)
    }

    /** Signed out: the next account starts from its own profile. */
    fun forget(context: Context) {
        prefs(context).edit().clear().apply()
    }

    // -- the frame, the pull --------------------------------------------------------------

    fun onFrame(context: Context, frame: JSONObject) {
        val rev = frame.optInt("rev", 0)
        if (frame.optString("device") == io.github.nanomuse.hub.Hub.deviceId(context)) {
            // our own write coming back
            if (rev > prefs(context).getInt(KEY_REV, 0)) prefs(context).edit().putInt(KEY_REV, rev).apply()
            return
        }
        pullSoon(context)
    }

    fun pullSoon(context: Context) {
        val ctx = context.applicationContext
        if (!NanoMuseCloud.isSignedIn(ctx)) return
        worker.execute {
            try {
                pull(ctx)
            } catch (e: Exception) {
                AppLogger.info(TAG, "pull: ${e.message}")
            }
        }
    }

    /** Fetch the relay's profile and wear it when it is newer. */
    private fun pull(context: Context) {
        val light = NanoMuseCloud.profile(context, withFace = false)
        val rev = light.optInt("rev", 0)
        val known = prefs(context).getInt(KEY_REV, 0)
        if (rev == 0) {
            // the relay has nothing for this account yet: this phone's look seeds it, unless
            // it is the plain default (nothing worth telling the other devices)
            val name = SoulStore.load(context)?.metadata?.name.orEmpty()
            if (AvatarStore.current.value != null || (name.isNotBlank() && name != "nanoMuse")) push(context)
            return
        }
        if (rev <= known) return
        val name = light.optString("name").trim()
        val avatar = light.optString("avatar")
        applying = true
        try {
            if (name.isNotBlank()) {
                val cur = SoulStore.load(context)
                if (cur != null && cur.metadata.name != name) {
                    SoulStore.save(context, cur.copy(metadata = cur.metadata.copy(name = name)))
                }
            }
            when {
                avatar == "face" && light.optBoolean("has_face") -> {
                    val full = NanoMuseCloud.profile(context, withFace = true)
                    wearFace(full)
                }
                // the dragon, or an emoji the phone cannot draw: the built-in face
                AvatarStore.current.value != null -> AvatarStore.reset()
            }
        } finally {
            applying = false
        }
        prefs(context).edit()
            .putInt(KEY_REV, rev)
            .putString(KEY_PUSHED_FACE, faceStamp())
            .putString(KEY_PUSHED_NAME, name)
            .apply()
        AppLogger.info(TAG, "wearing rev $rev from the account ($avatar)")
    }

    private fun wearFace(full: JSONObject) {
        val face = full.optJSONObject("face") ?: return
        val idle = decode(face.optString("idle")) ?: return
        AvatarStore.adopt(idle, full.optString("description"), full.optString("style"), "account")
        for ((key, mood) in moods) {
            if (mood == AgentMood.IDLE) continue
            val pic = decode(face.optString(key)) ?: continue
            AvatarStore.putMood(mood, pic)
        }
    }

    private fun decode(b64: String): Bitmap? {
        if (b64.isBlank()) return null
        val bytes = runCatching { Base64.decode(b64, Base64.DEFAULT) }.getOrNull() ?: return null
        return BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
    }

    // -- the push ---------------------------------------------------------------------------

    /** The name or the face changed on this phone (SOUL.md saved, a face adopted or reset). */
    fun changed() {
        val ctx = app ?: return
        if (applying || !NanoMuseCloud.isSignedIn(ctx)) return
        pending?.cancel(false)
        pending = worker.schedule({
            try {
                push(ctx)
            } catch (e: Exception) {
                AppLogger.warning(TAG, "push: ${e.message}")
            }
        }, PUSH_DELAY_MS, TimeUnit.MILLISECONDS)
    }

    /** What identifies the face worn here, so a rename does not resend the pictures. */
    private fun faceStamp(): String {
        val cur = AvatarStore.current.value ?: return ""
        return "${cur.createdAt}:${cur.moods.keys.sortedBy { it.ordinal }.joinToString(",") { it.name }}"
    }

    private fun push(context: Context) {
        val name = SoulStore.load(context)?.metadata?.name?.takeIf { it.isNotBlank() } ?: "nanoMuse"
        val p = prefs(context)
        val stamp = faceStamp()
        val sameFace = stamp == p.getString(KEY_PUSHED_FACE, null)
        if (sameFace && name == p.getString(KEY_PUSHED_NAME, null)) return
        val body = JSONObject()
            .put("device", io.github.nanomuse.hub.Hub.deviceId(context))
            .put("name", name.take(60))
        val cur = AvatarStore.current.value
        if (cur == null) {
            body.put("avatar", DRAGON)
        } else {
            body.put("avatar", "face")
                .put("style", cur.style.take(20))
                .put("description", cur.prompt.take(200))
            if (!sameFace) {
                val face = JSONObject()
                AvatarStore.decodeBitmap(AvatarStore.baseFile())?.let { face.put("idle", webp(it)) }
                for ((key, mood) in moods) {
                    if (mood == AgentMood.IDLE) continue
                    AvatarStore.decodeBitmap(AvatarStore.moodFile(mood))?.let { face.put(key, webp(it)) }
                }
                if (face.has("idle")) {
                    body.put("face", face)
                } else {
                    // a face with no picture on disk cannot be shared: the others keep theirs
                    body.put("avatar", DRAGON)
                    body.remove("style")
                    body.remove("description")
                }
            }
        }
        val out = NanoMuseCloud.putProfile(context, body)
        p.edit()
            .putInt(KEY_REV, out.optInt("rev", p.getInt(KEY_REV, 0)))
            .putString(KEY_PUSHED_FACE, if (body.optString("avatar") == "face") stamp else "")
            .putString(KEY_PUSHED_NAME, name)
            .apply()
        AppLogger.info(TAG, "shared with the account as rev ${out.optInt("rev")}")
    }

    /** A still as base64 WebP, small enough for the relay (512 px, lossy). */
    private fun webp(bitmap: Bitmap): String {
        val out = ByteArrayOutputStream()
        @Suppress("DEPRECATION")
        val format = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) Bitmap.CompressFormat.WEBP_LOSSY else Bitmap.CompressFormat.WEBP
        bitmap.compress(format, 82, out)
        return Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
    }
}
