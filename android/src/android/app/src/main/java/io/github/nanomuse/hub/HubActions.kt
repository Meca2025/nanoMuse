package io.github.nanomuse.hub

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.util.Base64
import androidx.core.app.NotificationCompat
import com.openminis.app.MinisApp
import com.openminis.app.R
import com.openminis.app.accessibility.MinisAccessibilityService
import com.openminis.app.data.MemoryGlobalPrefs
import com.openminis.app.debug.HeadlessChatRunner
import com.openminis.app.logging.AppLogger
import com.openminis.app.sandbox.PRootKernel
import com.openminis.app.sandbox.ShellExecutor
import com.openminis.app.service.AgentForegroundService
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File

/**
 * What the other devices may ask of this phone, and how each is carried out here.
 *
 *  - `info`, `files`, `file.get`, `file.put`, `shell`: the phone's Linux sandbox — the same
 *    filesystem and shell the agent itself uses; never Android's own storage or shell.
 *  - `open`, `notify`: a URL to the matching app, a notification on this phone.
 *  - `screen`: a picture of the screen, when the accessibility service is on (Hands).
 *  - `task`: a whole task in words for this phone's own agent, in a conversation of its own;
 *    whatever needs an approval shows the usual card here, on the phone.
 *
 * The caller has already judged a `shell` command before sending it (the desktop's guard, the
 * phone's ShellGuard); "Remote control" off refuses everything but `info`.
 */
object HubActions {
    private const val TAG = "HubActions"
    private const val FILE_LIMIT = 8L * 1024 * 1024
    private const val TASK_TIMEOUT_MS = 10 * 60 * 1000L
    private const val CHANNEL = "nanomuse_hub"
    private const val PREFS = "nanomuse"

    fun handle(context: Context, call: IncomingCall) {
        if (call.action == "info") { call.result(info(context)); return }
        if (!Hub.remoteControl(context)) { call.fail("not_allowed", "${Hub.name(context)} is set not to be operated from other devices"); return }
        AppLogger.info(TAG, "${call.senderName} → ${call.action}")
        try {
            when (call.action) {
                "shell" -> shell(context, call)
                "files" -> call.result(files(context, call.args.optString("path").ifBlank { "/root" }))
                "file.get" -> call.result(fileGet(context, call.args.optString("path")))
                "file.put" -> call.result(filePut(context, call.args.optString("path"), call.args.optString("data"), call.args.optBoolean("force")))
                "open" -> call.result(open(context, call.args.optString("url")))
                "screen" -> call.result(screen())
                "notify" -> call.result(notify(context, call.args.optString("text"), call.args.optString("title").ifBlank { "nanoMuse" }, call.senderName))
                "task" -> task(context, call)
                "approve" -> call.result(JSONObject().put("ok", true).put("note", "approvals on this phone are decided on its screen"))
                "stop" -> call.result(JSONObject().put("stopped", false))
                else -> call.fail("unknown_action", "this phone does not do '${call.action}'")
            }
        } catch (e: Refused) {
            call.fail(e.code, e.message ?: e.code)
        }
    }

    class Refused(val code: String, message: String) : Exception(message)

    // ── info ───────────────────────────────────────────────────────────────

    fun info(context: Context): JSONObject = JSONObject()
        .put("name", Hub.name(context))
        .put("os", "Android ${Build.VERSION.RELEASE}")
        .put("model", "${Build.MANUFACTURER} ${Build.MODEL}")
        .put("app", "nanoMuse ${Hub.VERSION}")
        .put("sandbox", if (PRootKernel.isBooted) "ready" else "not booted")
        .put("screen", MinisAccessibilityService.getInstance() != null)
        .put("actions", JSONArray(Hub.ACTIONS))
        .put("note", "shell and files live in the phone's Linux sandbox (Alpine); use `task` for anything that needs the phone's apps")

    // ── the sandbox ────────────────────────────────────────────────────────

    private fun shell(context: Context, call: IncomingCall) {
        val command = call.args.optString("command").trim()
        if (command.isEmpty()) { call.fail("usage", "a command is required"); return }
        boot(context)
        val timeoutS = call.args.optInt("timeout", 120).coerceIn(1, 900)
        val cwd = call.args.optString("cwd").trim()
        val full = if (cwd.isNotEmpty()) "cd ${shellQuote(cwd)} && $command" else command
        val r = runBlocking { ShellExecutor.execute(context, full, timeout = timeoutS * 1000L) }
        call.result(
            JSONObject()
                .put("exit_code", r.exitCode)
                .put("stdout", r.output.take(200_000))
                .put("stderr", "")
                .put("timed_out", r.exitCode == 124 || r.durationMs >= timeoutS * 1000L)
                .put("duration_ms", r.durationMs),
        )
    }

    private fun shellQuote(s: String): String = "'" + s.replace("'", "'\\''") + "'"

    /** The sandbox boots on first use, exactly as it does for the phone's own agent. */
    private fun boot(context: Context) {
        if (PRootKernel.isBooted) return
        try {
            runBlocking { PRootKernel.boot(context.applicationContext) }
        } catch (e: Exception) {
            throw Refused("sandbox_not_ready", "the phone's sandbox could not start: ${e.message}")
        }
    }

    /** A sandbox path → the host file behind it; `~` is the sandbox home. */
    private fun host(context: Context, path: String): File {
        boot(context)
        val linux = when {
            path.isBlank() || path == "~" -> "/root"
            path.startsWith("~/") -> "/root/" + path.removePrefix("~/")
            path.startsWith("minis://attachments/") -> "/var/minis/attachments/" + path.removePrefix("minis://attachments/")
            !path.startsWith("/") -> "/root/$path"
            else -> path
        }
        return PRootKernel.resolveHostPath(linux) ?: throw Refused("no_sandbox", "the phone's sandbox is not set up yet")
    }

    private fun files(context: Context, path: String): JSONObject {
        val dir = host(context, path)
        if (!dir.exists()) throw Refused("not_found", "$path does not exist on the phone")
        val entries = JSONArray()
        if (dir.isFile) {
            entries.put(entry(dir))
        } else {
            dir.listFiles()?.sortedWith(compareBy({ !it.isDirectory }, { it.name.lowercase() }))?.take(2000)?.forEach { entries.put(entry(it)) }
        }
        return JSONObject().put("path", path).put("entries", entries)
    }

    private fun entry(f: File): JSONObject = JSONObject()
        .put("name", f.name)
        .put("type", if (f.isDirectory) "dir" else "file")
        .put("size", f.length())
        .put("mtime", f.lastModified() / 1000)

    private fun fileGet(context: Context, path: String): JSONObject {
        val f = host(context, path)
        if (!f.isFile) throw Refused("not_found", "$path is not a file on the phone")
        if (f.length() > FILE_LIMIT) throw Refused("too_large", "${f.name} is ${f.length()} bytes; the limit over the hub is $FILE_LIMIT")
        return JSONObject()
            .put("path", path).put("name", f.name).put("bytes", f.length()).put("mime", mime(f.name))
            .put("data", Base64.encodeToString(f.readBytes(), Base64.NO_WRAP))
    }

    private fun filePut(context: Context, path: String, data: String, force: Boolean): JSONObject {
        if (path.isBlank()) throw Refused("usage", "a path is required")
        val f = host(context, path)
        if (f.isDirectory) throw Refused("is_dir", "$path is a folder")
        if (f.exists() && !force) throw Refused("exists", "$path already exists on the phone; force replaces it")
        val bytes = Base64.decode(data, Base64.DEFAULT)
        f.parentFile?.mkdirs()
        val tmp = File(f.parentFile, f.name + ".nanomuse-part")
        tmp.writeBytes(bytes)
        if (!tmp.renameTo(f)) { f.writeBytes(bytes); tmp.delete() }
        return JSONObject().put("path", path).put("bytes", bytes.size)
    }

    private fun mime(name: String): String = when (name.substringAfterLast('.', "").lowercase()) {
        "png" -> "image/png"; "jpg", "jpeg" -> "image/jpeg"; "gif" -> "image/gif"; "webp" -> "image/webp"
        "pdf" -> "application/pdf"; "txt" -> "text/plain"; "md" -> "text/markdown"; "json" -> "application/json"; "csv" -> "text/csv"
        else -> "application/octet-stream"
    }

    // ── the phone itself ───────────────────────────────────────────────────

    private fun open(context: Context, url: String): JSONObject {
        val target = url.trim()
        if (target.isEmpty()) throw Refused("usage", "a URL is required")
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(target)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return try {
            context.startActivity(intent)
            JSONObject().put("ok", true).put("url", target)
        } catch (e: Exception) {
            throw Refused("no_app", "nothing on the phone opens $target: ${e.message}")
        }
    }

    private fun screen(): JSONObject {
        val svc = MinisAccessibilityService.getInstance() ?: throw Refused("no_screen", "the phone's accessibility service is off; turn on Hands in Settings")
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) throw Refused("no_screen", "screenshots need Android 11")
        val shot = svc.captureScreenshot(timeoutMs = 6_000)
        val bmp = shot.bitmap ?: throw Refused("no_screen", "screenshot failed: ${shot.errorMessage ?: shot.errorCode}")
        val scaled = if (bmp.width > 1080) Bitmap.createScaledBitmap(bmp, 1080, (bmp.height * 1080f / bmp.width).toInt().coerceAtLeast(1), true) else bmp
        val out = ByteArrayOutputStream()
        scaled.compress(Bitmap.CompressFormat.JPEG, 80, out)
        if (scaled !== bmp) scaled.recycle()
        val bytes = out.toByteArray()
        return JSONObject().put("mime", "image/jpeg").put("bytes", bytes.size).put("data", Base64.encodeToString(bytes, Base64.NO_WRAP))
    }

    private fun notify(context: Context, text: String, title: String, from: String): JSONObject {
        if (text.isBlank()) throw Refused("usage", "text is required")
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(CHANNEL) == null) {
            nm.createNotificationChannel(NotificationChannel(CHANNEL, context.getString(R.string.nm_hub_channel), NotificationManager.IMPORTANCE_DEFAULT))
        }
        val open = context.packageManager.getLaunchIntentForPackage(context.packageName)?.let {
            PendingIntent.getActivity(context, 0, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        }
        val n = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_nanomuse)
            .setContentTitle(title)
            .setContentText(text)
            .setSubText(from)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setAutoCancel(true)
            .apply { if (open != null) setContentIntent(open) }
            .build()
        return try {
            nm.notify((System.currentTimeMillis() % 100_000).toInt() + 40_000, n)
            JSONObject().put("ok", true).put("shown", true)
        } catch (e: SecurityException) {
            JSONObject().put("ok", false).put("shown", false).put("message", "notifications are not allowed for nanoMuse on this phone")
        }
    }

    // ── a task for this phone's agent ──────────────────────────────────────

    private fun task(context: Context, call: IncomingCall) {
        val text = call.args.optString("text").trim()
        if (text.isEmpty()) { call.fail("usage", "text is required"); return }
        val app = context.applicationContext as? MinisApp
        if (app == null || !app.subsystemsReady()) { call.fail("not_ready", "nanoMuse on the phone is still starting"); return }
        val conversation = call.args.optString("conversation").ifBlank { "from-" + call.from.optString("id").ifBlank { "unknown" } }
        val sessionId = runBlocking { sessionFor(app, conversation, call.senderName) }
        if (sessionId == null) { call.fail("no_model", "the phone has no model to think with; sign in to nanoMuse Cloud there"); return }
        call.event(JSONObject().put("stage", "thinking").put("session", sessionId))
        AgentForegroundService.startService(app, sessionCount = 1, toolStatus = context.getString(R.string.nm_hub_task_from, call.senderName))
        val prompt = if (call.senderKind == "web") text else context.getString(R.string.nm_hub_task_prefix, call.senderName) + "\n\n" + text
        val result = runBlocking {
            HeadlessChatRunner.prompt(context = app, sessionId = sessionId, text = prompt, attachments = emptyList(), thinkingLevel = null, wait = true, timeoutMs = TASK_TIMEOUT_MS)
        }
        val answer = result.responseText?.trim().orEmpty()
        if (result.timedOut) { call.fail("timeout", "the phone's agent did not finish within ten minutes"); return }
        if (result.status == "Error" && answer.isEmpty()) { call.fail("failed", "the phone's agent could not run this"); return }
        call.result(
            JSONObject().put("text", answer.ifBlank { "(no answer)" }).put("conversation", conversation).put("session", sessionId)
                .put("device", Hub.name(context)).put("status", result.status),
        )
    }

    /** One conversation per remote conversation id, created like a goal's own: seeded from the default group. */
    private suspend fun sessionFor(app: MinisApp, conversation: String, sender: String): String? {
        val p = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val key = "hub.session.$conversation"
        p.getString(key, null)?.let { existing ->
            if (runCatching { app.chatRepository.dao.getSession(existing) }.getOrNull() != null) return existing
        }
        val providers = app.providerRepository
        val defaultGroupId = providers.defaultPrimaryGroupId
        val seedModelId = defaultGroupId
            ?.let { providers.group(it) }
            ?.let { g -> providers.availableMemberEntries(g).firstOrNull()?.model?.id }
            ?: providers.allVisibleEntries().firstOrNull()?.baseModel?.id
            ?: return null
        val session = app.chatRepository.createSession(
            modelId = seedModelId,
            title = app.getString(R.string.nm_hub_session_title, sender),
            memoryEnabled = MemoryGlobalPrefs.isGlobalEnabled(app),
        )
        app.chatRepository.dao.updateSource(session.id, "scheduled")
        if (defaultGroupId != null) {
            app.chatRepository.updateSessionBinding(session.id, """{"type":"group","groupId":"$defaultGroupId"}""", seedModelId)
        }
        p.edit().putString(key, session.id).apply()
        return session.id
    }
}
