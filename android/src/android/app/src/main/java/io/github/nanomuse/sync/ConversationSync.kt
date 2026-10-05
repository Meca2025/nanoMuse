package io.github.nanomuse.sync

import android.content.Context
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.ProcessLifecycleOwner
import com.openminis.app.BuildConfig
import com.openminis.app.MinisApp
import com.openminis.app.logging.AppLogger
import io.github.nanomuse.cloud.NanoMuseCloud
import io.github.nanomuse.hub.Hub
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONObject

/**
 * The conversations, the same on every device of the account (contract C7). The relay keeps
 * their text; this object decides when the phone talks to it — [SyncEngine] decides what is
 * said. On by default once signed in; Settings → Data controls turns it off (the relay then
 * deletes what it kept).
 *
 * - **Push** at once when the person sends a message ([sent], from the view model's send
 *   path — contract C8), two seconds after any other row is written, a chat renamed or deleted
 *   (the hooks in `ChatRepository`), and when the app goes to the background.
 * - **Pull** when the app comes to the foreground, on the hub's `sync` frame (another device
 *   pushed), and every minute while in the foreground.
 * - 409 `sync_off` turns the local switch off; 401 stops everything until the next sign-in;
 *   a network error waits for the next trigger.
 */
object ConversationSync {
    private const val TAG = "ConversationSync"
    private const val PREFS = "nanomuse_sync"
    private const val KEY_ENABLED = "enabled"
    private const val PUSH_DELAY_MS = 2_000L
    private const val PULL_EVERY_MS = 60_000L

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val lock = Mutex()
    @Volatile private var app: Context? = null
    /** The relay refused the key: nothing more until a new sign-in. */
    @Volatile private var halted = false
    @Volatile private var pushJob: Job? = null
    @Volatile private var ticker: Job? = null

    private val _enabled = MutableStateFlow(true)
    /** The switch as this phone knows it (the relay's word wins when it differs). */
    val enabled: StateFlow<Boolean> = _enabled.asStateFlow()

    private val _captions = MutableStateFlow<Map<String, String>>(emptyMap())
    /** Local message row id → the name of the device it was written on, for the bubble's "From Pixel 8" (C8: per message, never per chat). */
    val captions: StateFlow<Map<String, String>> = _captions.asStateFlow()

    private val _pulled = MutableSharedFlow<Set<String>>(extraBufferCapacity = 16)
    /** Chats that just got rows from another device; an open chat reloads itself. */
    val pulled: SharedFlow<Set<String>> = _pulled.asSharedFlow()

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /** App start: the switch, the lifecycle, the captions the bubbles show. */
    fun init(context: Context) {
        val ctx = context.applicationContext
        app = ctx
        _enabled.value = prefs(ctx).getBoolean(KEY_ENABLED, true)
        ProcessLifecycleOwner.get().lifecycle.addObserver(
            LifecycleEventObserver { _, event ->
                when (event) {
                    Lifecycle.Event.ON_START -> {
                        syncSoon(ctx)
                        startTicker(ctx)
                    }
                    Lifecycle.Event.ON_STOP -> {
                        ticker?.cancel()
                        ticker = null
                        pushNow(ctx)
                    }
                    else -> {}
                }
            },
        )
        scope.launch { lock.withLock { runCatching { _captions.value = SyncEngine.captions(RoomSyncStore(ctx), Hub.deviceId(ctx)) } } }
    }

    /** Signed in, and the switch is on, and the relay has not refused the key. */
    fun active(context: Context): Boolean = !halted && _enabled.value && NanoMuseCloud.isSignedIn(context)

    // ── triggers ──────────────────────────────────────────────────────────

    /** A row was written, a chat renamed or deleted: a push in a moment (the hooks in ChatRepository). */
    fun changed() {
        val ctx = app ?: return
        if (!active(ctx)) return
        pushJob?.cancel()
        pushJob = scope.launch {
            delay(PUSH_DELAY_MS)
            run(ctx) { it.push() }
        }
    }

    /** The app went to the background: what is unsaid goes now. */
    fun pushNow(context: Context) {
        val ctx = context.applicationContext
        if (!active(ctx)) return
        pushJob?.cancel()
        scope.launch { run(ctx) { it.push() } }
    }

    /**
     * The person sent a message (its row is written): it reaches the other devices now, not at
     * the end of the turn (contract C8). The reply still goes with the turn's last row, through
     * [changed] — [Transcript] holds it back until the turn is finished.
     */
    fun sent() {
        val ctx = app ?: return
        pushNow(ctx)
    }

    fun pullSoon(context: Context) {
        val ctx = context.applicationContext
        if (!active(ctx)) return
        scope.launch { run(ctx) { applyPull(it.pull()) } }
    }

    /** Launch and foreground: the others' changes first, then ours. */
    fun syncSoon(context: Context) {
        val ctx = context.applicationContext
        if (!active(ctx)) return
        scope.launch {
            run(ctx) {
                applyPull(it.pull())
                it.push()
            }
        }
    }

    /** The hub's `{"type": "sync", "what": "conversations", "from": …}`: another device pushed. */
    fun onFrame(context: Context, frame: JSONObject) {
        if (frame.optString("from") == Hub.deviceId(context)) return // our own write coming back
        if (frame.has("what") && frame.optString("what") != "conversations") return
        pullSoon(context)
    }

    /** A new key (sign-in): the stop after a 401 is over; the account's chats come down. */
    fun signedIn(context: Context) {
        halted = false
        val ctx = context.applicationContext
        scope.launch {
            run(ctx) {
                val state = runCatching { it.state() }.getOrNull()
                if (state != null) setLocalEnabled(ctx, state.enabled)
                if (_enabled.value) {
                    applyPull(it.pull())
                    it.push()
                }
            }
        }
    }

    /** Signed out: the next account starts with no ids, no cursor, the switch on. */
    fun forget(context: Context) {
        val ctx = context.applicationContext
        halted = false
        pushJob?.cancel()
        prefs(ctx).edit().remove(KEY_ENABLED).apply()
        _enabled.value = true
        _captions.value = emptyMap()
        scope.launch { lock.withLock { runCatching { RoomSyncStore(ctx).clear() } } }
    }

    private fun startTicker(ctx: Context) {
        ticker?.cancel()
        ticker = scope.launch {
            while (isActive) {
                delay(PULL_EVERY_MS)
                if (active(ctx)) run(ctx) { applyPull(it.pull()) }
            }
        }
    }

    // ── the switch and the delete (Data controls) ─────────────────────────

    /** The relay's view of the switch; also brings the local one in line. Throws [SyncException]. */
    suspend fun refreshState(context: Context): SyncState? = withContext(Dispatchers.IO) {
        val ctx = context.applicationContext
        val e = engine(ctx) ?: return@withContext null
        val state = lock.withLock { e.state() }
        setLocalEnabled(ctx, state.enabled)
        state
    }

    /** Off: the relay deletes everything of the account. On: this phone's chats go out again. Throws [SyncException]. */
    suspend fun setEnabled(context: Context, on: Boolean) = withContext(Dispatchers.IO) {
        val ctx = context.applicationContext
        val e = engine(ctx) ?: throw SyncException(401, "bad_key", "Not signed in")
        pushJob?.cancel()
        lock.withLock { e.setEnabled(on) }
        setLocalEnabled(ctx, on)
        if (on) {
            halted = false
            syncSoon(ctx)
        }
    }

    /** "Delete synced conversations": the relay's store goes; the switch and every device's chats stay. Throws [SyncException]. */
    suspend fun deleteSynced(context: Context) = withContext(Dispatchers.IO) {
        val ctx = context.applicationContext
        val e = engine(ctx) ?: throw SyncException(401, "bad_key", "Not signed in")
        lock.withLock { e.wipe() }
    }

    private fun setLocalEnabled(ctx: Context, on: Boolean) {
        prefs(ctx).edit().putBoolean(KEY_ENABLED, on).apply()
        _enabled.value = on
    }

    // ── internals ─────────────────────────────────────────────────────────

    private fun engine(ctx: Context): SyncEngine? {
        val repo = (ctx.applicationContext as? MinisApp)?.chatRepositoryOrNull ?: return null
        val token = NanoMuseCloud.apiKey(ctx) ?: return null
        // the ids are per account: the relay's id for it, or the key itself on a relay that gives none
        val account = NanoMuseCloud.account(ctx)?.accountId?.takeIf { it.isNotBlank() } ?: token.hashCode().toString()
        return SyncEngine(
            store = RoomSyncStore(ctx),
            chats = RoomChats(ctx, repo),
            api = RelaySyncApi(NanoMuseCloud.baseUrl(ctx), token, "nanoMuse-Android/${BuildConfig.VERSION_NAME}"),
            deviceId = Hub.deviceId(ctx),
            account = account,
        )
    }

    private suspend fun run(ctx: Context, block: suspend (SyncEngine) -> Unit) {
        lock.withLock {
            val e = engine(ctx) ?: return
            try {
                block(e)
            } catch (x: SyncException) {
                when {
                    x.status == 401 -> {
                        halted = true
                        AppLogger.info(TAG, "the relay refused the key; sync waits for the next sign-in")
                    }
                    x.status == 409 && x.code == "sync_off" -> {
                        setLocalEnabled(ctx, false)
                        AppLogger.info(TAG, "sync is off for the account")
                    }
                    x.status == 0 -> {} // offline: the next trigger tries again
                    else -> AppLogger.info(TAG, "relay: ${x.status} ${x.code}")
                }
            } catch (x: Exception) {
                AppLogger.warning(TAG, "sync: ${x.message}")
            }
            runCatching { _captions.value = e.captions() }
        }
    }

    private fun applyPull(r: PullResult) {
        if (r.applied > 0) AppLogger.info(TAG, "pulled ${r.applied} change(s) up to ${r.cursor}")
        if (r.touchedSessions.isNotEmpty()) _pulled.tryEmit(r.touchedSessions)
    }

}
