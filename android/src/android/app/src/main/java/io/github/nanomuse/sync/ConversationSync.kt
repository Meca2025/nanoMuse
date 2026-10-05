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
import kotlinx.coroutines.flow.update
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
 *
 * Contract C9 (0.1.38): side chats stay on the phone unless "Also sync side chats" is on
 * ([sideChats], per device, off by default); the first pull after a sign-in asks for the tail
 * and is applied off the main thread, in one write, before this phone's own history goes up.
 * Presence: [sent] tells the other devices a turn started here, [turnEnded] that it ended;
 * their `working` frames land in [working], which the chat shows as "kwai is working…" under
 * the last line that device wrote. [remoteRows] are the rows this phone did not write.
 */
object ConversationSync {
    private const val TAG = "ConversationSync"
    private const val PREFS = "nanomuse_sync"
    private const val KEY_ENABLED = "enabled"
    private const val KEY_SIDE_CHATS = "side_chats"
    private const val PUSH_DELAY_MS = 2_000L
    private const val PULL_EVERY_MS = 60_000L
    /** The turn's last rows are still being written when the stream flag drops; the reply goes a breath later. */
    private const val TURN_END_SETTLE_MS = 1_500L

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val lock = Mutex()
    @Volatile private var app: Context? = null
    /** The relay refused the key: nothing more until a new sign-in. */
    @Volatile private var halted = false
    @Volatile private var pushJob: Job? = null
    @Volatile private var ticker: Job? = null
    /** Chats this phone said `working: true` for and has not cleared yet. */
    private val workingSent = java.util.Collections.synchronizedSet(HashSet<String>())

    private val _enabled = MutableStateFlow(true)
    /** The switch as this phone knows it (the relay's word wins when it differs). */
    val enabled: StateFlow<Boolean> = _enabled.asStateFlow()

    private val _sideChats = MutableStateFlow(false)
    /** "Also sync side chats" (C9): this phone's setting, off until the person turns it on. */
    val sideChats: StateFlow<Boolean> = _sideChats.asStateFlow()

    private val _captions = MutableStateFlow<Map<String, String>>(emptyMap())
    /** Local message row id → the name of the device it was written on, for the bubble's "From Pixel 8" (C8: per message, never per chat). */
    val captions: StateFlow<Map<String, String>> = _captions.asStateFlow()

    private val _remoteRows = MutableStateFlow<Map<String, String>>(emptyMap())
    /** Local row id → the device that wrote it, for rows another device wrote (C9): never this phone's unfinished turn, never resumed from here. */
    val remoteRows: StateFlow<Map<String, String>> = _remoteRows.asStateFlow()

    private val _working = MutableStateFlow<Map<String, WorkingPresence>>(emptyMap())
    /** Local chat id → the device working on it right now (C9), while its `at` is under ten minutes old. */
    val working: StateFlow<Map<String, WorkingPresence>> = _working.asStateFlow()

    private val _pulled = MutableSharedFlow<Set<String>>(extraBufferCapacity = 16)
    /** Chats that just got rows from another device; an open chat reloads itself. */
    val pulled: SharedFlow<Set<String>> = _pulled.asSharedFlow()

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /** App start: the switch, the lifecycle, the captions the bubbles show. */
    fun init(context: Context) {
        val ctx = context.applicationContext
        app = ctx
        _enabled.value = prefs(ctx).getBoolean(KEY_ENABLED, true)
        _sideChats.value = prefs(ctx).getBoolean(KEY_SIDE_CHATS, false)
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
        scope.launch {
            lock.withLock {
                runCatching {
                    val store = RoomSyncStore(ctx)
                    _captions.value = SyncEngine.captions(store, Hub.deviceId(ctx))
                    _remoteRows.value = SyncEngine.remoteRows(store, Hub.deviceId(ctx))
                }
            }
        }
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
     * The person sent a message (its row is written) in chat [sessionId]: it reaches the other
     * devices now, not at the end of the turn (contract C8), and right behind it goes
     * `working: true` (C9), so their chats say this phone is on it. The reply still goes with
     * the turn's last row, through [changed] — [Transcript] holds it back until the turn is
     * finished — and [turnEnded] clears the presence.
     */
    fun sent(sessionId: String? = null) {
        val ctx = app ?: return
        if (!active(ctx)) return
        pushJob?.cancel()
        scope.launch {
            run(ctx) {
                it.push()
                if (sessionId != null && runCatching { it.working(sessionId, true) }.getOrDefault(false)) workingSent += sessionId
            }
        }
    }

    /**
     * The turn in [sessionId] is over (the stream flag dropped): the reply goes up, then
     * `working: false`. Nothing happens for a chat this phone never said `true` for.
     */
    fun turnEnded(sessionId: String) {
        val ctx = app ?: return
        if (!workingSent.remove(sessionId)) return
        pushJob?.cancel()
        scope.launch {
            delay(TURN_END_SETTLE_MS)
            run(ctx) {
                it.push()
                runCatching { it.working(sessionId, false) }
            }
        }
    }

    fun pullSoon(context: Context) {
        val ctx = context.applicationContext
        if (!active(ctx)) return
        scope.launch { run(ctx) { applyPull(it.pull()) } }
    }

    /** Launch and foreground: the others' changes first, then ours; who is working, from the relay's memory. */
    fun syncSoon(context: Context) {
        val ctx = context.applicationContext
        if (!active(ctx)) return
        scope.launch {
            run(ctx) {
                applyPull(it.pull())
                it.push()
                runCatching { seedPresence(it, it.state().working) }
            }
        }
    }

    /** The hub's `{"type": "sync", "what": "conversations", "from": …}`: another device pushed. */
    fun onFrame(context: Context, frame: JSONObject) {
        if (frame.optString("from") == Hub.deviceId(context)) return // our own write coming back
        if (frame.has("what") && frame.optString("what") != "conversations") return
        pullSoon(context)
    }

    /**
     * The hub's `{"type": "working", "cid", "from", "device_name", "working", "at"}` (C9): a
     * turn started or ended on another device. Mapped to the local chat and kept while it is
     * fresh; a `false` from the device that said `true` clears it.
     */
    fun onWorkingFrame(context: Context, frame: JSONObject) {
        val ctx = context.applicationContext
        val from = frame.optString("from")
        if (from.isBlank() || from == Hub.deviceId(ctx)) return
        val cid = frame.optString("cid").takeIf { it.isNotBlank() } ?: return
        val on = frame.optBoolean("working", true)
        val presence = if (on) SyncJson.working(frame) else null
        scope.launch {
            val sessionId = runCatching { RoomSyncStore(ctx).conversationByCid(cid)?.sessionId }.getOrNull() ?: return@launch
            _working.update { map ->
                val cur = map[sessionId]
                when {
                    presence != null -> map + (sessionId to presence)
                    cur != null && cur.from == from -> map - sessionId
                    else -> map
                }
            }
        }
    }

    /** `GET /v1/sync/state` lists who is working: what the hub said while this phone was away. */
    private suspend fun seedPresence(e: SyncEngine, list: List<WorkingPresence>) {
        val me = app?.let { Hub.deviceId(it) }
        val now = System.currentTimeMillis() / 1000
        val fresh = HashMap<String, WorkingPresence>()
        for (p in list) {
            if (p.from == me || !p.live(now)) continue
            val sessionId = e.sessionOf(p.cid) ?: continue
            fresh[sessionId] = p
        }
        _working.update { map -> map.filterValues { it.live(now) } + fresh }
    }

    /**
     * A new key (sign-in): the stop after a 401 is over; the account's chats come down — the
     * tail first (C9), applied here on the IO dispatcher and shown as soon as it is written;
     * this phone's own history goes up only after that, and never holds the screen.
     */
    fun signedIn(context: Context) {
        halted = false
        val ctx = context.applicationContext
        scope.launch {
            run(ctx) {
                val state = runCatching { it.state() }.getOrNull()
                if (state != null) setLocalEnabled(ctx, state.enabled)
                if (_enabled.value) {
                    applyPull(it.pull())
                    if (state != null) seedPresence(it, state.working)
                    it.push()
                }
            }
        }
    }

    /** Signed out: the next account starts with no ids, no cursor, the switch on, side chats off. */
    fun forget(context: Context) {
        val ctx = context.applicationContext
        halted = false
        pushJob?.cancel()
        prefs(ctx).edit().remove(KEY_ENABLED).remove(KEY_SIDE_CHATS).apply()
        _enabled.value = true
        _sideChats.value = false
        _captions.value = emptyMap()
        _remoteRows.value = emptyMap()
        _working.value = emptyMap()
        workingSent.clear()
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

    /**
     * "Also sync side chats" (C9), this phone only. On: one pull from zero over the whole
     * scope, then the side chats go up, oldest first. Off: side chats stop going either way;
     * what was synced stays where it is.
     */
    fun setSideChats(context: Context, on: Boolean) {
        val ctx = context.applicationContext
        prefs(ctx).edit().putBoolean(KEY_SIDE_CHATS, on).apply()
        _sideChats.value = on
        if (!on || !active(ctx)) return
        pushJob?.cancel()
        scope.launch {
            run(ctx) {
                it.sideChatsTurnedOn()
                applyPull(it.pull())
                it.push()
            }
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
            sideChats = { _sideChats.value },
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
            runCatching {
                _captions.value = e.captions()
                _remoteRows.value = e.remoteRows()
            }
        }
    }

    private fun applyPull(r: PullResult) {
        if (r.applied > 0) AppLogger.info(TAG, "pulled ${r.applied} change(s) up to ${r.cursor}" + if (r.skipped > 0) " (${r.skipped} older left on the relay)" else "")
        // the reply arrived: whoever was working on that chat is done (C9)
        if (r.replied.isNotEmpty()) _working.update { map -> map - r.replied }
        if (r.touchedSessions.isNotEmpty()) _pulled.tryEmit(r.touchedSessions)
    }

}
