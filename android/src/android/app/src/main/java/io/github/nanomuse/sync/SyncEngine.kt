package io.github.nanomuse.sync

import java.util.UUID

/** What a pull changed locally, for the UI: chats that got rows, and whether any chat row changed. */
data class PullResult(val applied: Int, val touchedSessions: Set<String>, val cursor: Long)

/**
 * The conversation sync of contract C7, apart from Android: a [SyncStore] for the ids, the
 * phone's [LocalChats], and the relay behind [SyncApi]. [ConversationSync] decides *when* to
 * call [push] and [pull]; this class decides *what* goes and what is applied, so the rules can
 * be tested with a fake relay.
 *
 * - Every local chat gets a `cid` the first time a push looks at it; the main chat is `main`.
 * - A push sends the person's messages and each turn's final reply ([Transcript]) that the relay
 *   has not accepted yet, tombstones for rows that are gone (an edit, a regenerate), and the
 *   chats whose title changed. A chat deleted here goes as a tombstone plus `DELETE`.
 * - A pull applies changes in `seq` order: new chats are created, known ones merge by `mid`,
 *   tombstones delete. The first remote `main` is adopted as this phone's main chat.
 * - `main_exists` in a push's answer re-homes the local main chat under the relay's cid and
 *   posts its messages again.
 */
class SyncEngine(
    private val store: SyncStore,
    private val chats: LocalChats,
    private val api: SyncApi,
    private val deviceId: String,
    private val account: String,
    private val now: () -> Long = { System.currentTimeMillis() },
    private val newId: () -> String = { UUID.randomUUID().toString() },
) {
    /** The cursor last applied, or null before the first pull of this account. */
    suspend fun cursor(): Long? = store.meta(SyncStore.CURSOR)?.toLongOrNull()

    /** A different account than the ids were minted for starts clean. */
    private suspend fun ensureAccount() {
        if (store.meta(SyncStore.ACCOUNT) != account) {
            store.clear()
            store.putMeta(SyncStore.ACCOUNT, account)
        }
    }

    // ── push ──────────────────────────────────────────────────────────────

    /** Sends what the relay does not have yet. Returns how many changes it accepted. */
    suspend fun push(): Int {
        ensureAccount()
        // adoption first: a phone that never pulled must not seed a second main chat
        if (cursor() == null) pull()
        return pushOnce(retryMain = true)
    }

    private suspend fun pushOnce(retryMain: Boolean): Int {
        val mainId = chats.mainSessionId()
        val convs = mutableListOf<OutConversation>()
        val msgs = mutableListOf<OutMessage>()
        val pending = mutableListOf<SyncMessage>()
        val titles = mutableMapOf<String, Pair<SyncConversation, String?>>()
        val gone = mutableListOf<SyncMessage>()
        val liveSessions = chats.sessions()
        val liveIds = liveSessions.map { it.id }.toSet()

        for (s in liveSessions) {
            var map = store.conversation(s.id)
            if (map == null) {
                map = SyncConversation(
                    sessionId = s.id,
                    cid = newId(),
                    kind = if (s.id == mainId) "main" else "side",
                    device = deviceId,
                    deviceName = "",
                    pushedTitle = null,
                    pushed = false,
                )
                store.putConversation(map)
            }
            val known = store.messages(s.id).associateBy { it.messageId }
            val items = Transcript.items(chats.messages(s.id))
            val itemIds = items.map { it.messageId }.toSet()
            val fresh = mutableListOf<SyncMessage>()
            for (item in items) {
                val m = known[item.messageId] ?: SyncMessage(item.messageId, newId(), s.id, pushed = false).also { fresh += it }
                if (m.pushed) continue
                pending += m
                msgs += OutMessage(
                    mid = m.mid, cid = map.cid, role = item.role,
                    text = item.text.take(TEXT_MAX), attachments = item.attachments,
                    createdAt = item.createdAt / 1000,
                )
            }
            store.putMessages(fresh)
            // rows that are gone (edited, regenerated, cut): their mids become tombstones
            for (m in known.values) {
                if (m.messageId in itemIds) continue
                if (!m.pushed) {
                    // never reached the relay: forget it quietly
                    gone += m
                    continue
                }
                gone += m
                msgs += OutMessage(mid = m.mid, cid = map.cid, role = "user", text = "", createdAt = now() / 1000, deleted = true)
            }
            // the main chat has no title of its own on this phone: it is named once, never renamed from here
            val titleChanged = map.kind != "main" && map.pushedTitle != s.title
            val touched = msgs.any { it.cid == map.cid }
            if (!map.pushed || titleChanged || touched) {
                convs += OutConversation(map.cid, map.kind, s.title, s.createdAt / 1000, s.updatedAt / 1000)
                titles[map.cid] = map to s.title
            }
        }
        // chats deleted here: a tombstone, then the relay's delete route
        val deletedMaps = store.conversations().filter { it.sessionId !in liveIds }
        for (map in deletedMaps) {
            if (!map.pushed) {
                // the relay never saw it; nothing to tell
                store.removeMessagesOf(map.sessionId)
                store.removeConversation(map.sessionId)
                continue
            }
            if (!map.deleted) store.putConversation(map.copy(deleted = true))
            convs += OutConversation(map.cid, map.kind, map.pushedTitle, now() / 1000, now() / 1000, deleted = true)
        }

        if (convs.isEmpty() && msgs.isEmpty()) return 0

        var accepted = 0
        val rejected = mutableListOf<Rejection>()
        // the conversations ride with the first batch so every message finds its cid
        val batches = if (msgs.isEmpty()) listOf(emptyList()) else msgs.chunked(BATCH)
        batches.forEachIndexed { i, batch ->
            val r = api.push(deviceId, if (i == 0) convs else emptyList(), batch)
            accepted += r.accepted
            rejected += r.rejected
        }
        val rejectedMids = rejected.mapNotNull { it.mid }.toSet()
        val rejectedCids = rejected.mapNotNull { it.cid }.toSet()

        // what the relay took is pushed; what it refused for good is dropped rather than retried forever
        store.putMessages(pending.map { it.copy(pushed = true) })
        store.removeMessages(gone.map { it.messageId })
        for ((cid, pair) in titles) {
            if (cid in rejectedCids) continue
            val (map, title) = pair
            store.putConversation(map.copy(pushed = true, pushedTitle = title))
        }
        for (map in deletedMaps) {
            if (!map.pushed) continue
            runCatching { api.deleteConversation(map.cid) }
            store.removeMessagesOf(map.sessionId)
            store.removeConversation(map.sessionId)
        }
        if (rejectedMids.isNotEmpty()) {
            // a message the relay will never take (bad role, unknown cid): not sent again
            val drop = pending.filter { it.mid in rejectedMids }
            store.putMessages(drop.map { it.copy(pushed = true) })
        }

        // two devices seeded a main chat each: the relay kept the older one, ours moves under it
        val mainClash = rejected.firstOrNull { it.reason == "main_exists" && it.cidMain != null }
        if (mainClash != null && retryMain) {
            val local = store.conversationByCid(mainClash.cid.orEmpty()) ?: store.conversation(mainId.orEmpty())
            if (local != null && local.cid != mainClash.cidMain) {
                rehome(local, mainClash.cidMain!!, "", "")
                return accepted + pushOnce(retryMain = false)
            }
        }
        return accepted
    }

    /** The local chat [local] is from now on the relay's conversation [cid]; its rows go out again. */
    private suspend fun rehome(local: SyncConversation, cid: String, device: String, deviceName: String) {
        store.putConversation(local.copy(cid = cid, kind = "main", device = device, deviceName = deviceName, pushed = true, pushedTitle = null))
        store.putMessages(store.messages(local.sessionId).map { it.copy(pushed = false) })
    }

    // ── pull ──────────────────────────────────────────────────────────────

    /** Fetches and applies everything after the stored cursor. */
    suspend fun pull(): PullResult {
        ensureAccount()
        var cursor = cursor() ?: 0L
        var applied = 0
        val touched = mutableSetOf<String>()
        while (true) {
            val page = api.changes(cursor, PAGE)
            for (c in page.conversations) {
                if (applyConversation(c, touched)) applied++
            }
            for (m in page.messages) {
                if (applyMessage(m, touched)) applied++
            }
            cursor = maxOf(cursor, page.cursor)
            store.putMeta(SyncStore.CURSOR, cursor.toString())
            if (!page.more || (page.conversations.isEmpty() && page.messages.isEmpty())) break
        }
        return PullResult(applied, touched, cursor)
    }

    private suspend fun applyConversation(c: RemoteConversation, touched: MutableSet<String>): Boolean {
        val known = store.conversationByCid(c.cid)
        if (c.deleted) {
            if (known == null) return false
            val mainId = chats.mainSessionId()
            if (known.sessionId == mainId) {
                // the home conversation stays; what was said in it goes
                chats.clearMessages(known.sessionId)
                store.removeMessagesOf(known.sessionId)
                store.putConversation(known.copy(pushedTitle = null))
            } else {
                chats.deleteSession(known.sessionId)
                store.removeMessagesOf(known.sessionId)
                store.removeConversation(known.sessionId)
            }
            touched += known.sessionId
            return true
        }
        if (known != null) {
            val s = chats.session(known.sessionId) ?: return false // gone here; the next push says so
            var renamed = false
            if (c.title != known.pushedTitle && c.title != s.title) {
                // another device renamed it
                chats.renameSession(s.id, c.title, maxOf(s.updatedAt, c.updatedAt * 1000))
                touched += s.id
                renamed = true
            }
            if (c.title != known.pushedTitle) store.putConversation(known.copy(pushedTitle = c.title))
            return renamed
        }
        if (c.kind == "main") {
            val mainId = chats.mainSessionId()
            if (mainId != null) {
                val mine = store.conversation(mainId)
                if (mine == null) {
                    // first sight of the account's main chat: ours is it from now on
                    store.putConversation(SyncConversation(mainId, c.cid, "main", c.device, c.deviceName, pushedTitle = c.title, pushed = true))
                } else if (mine.cid != c.cid) {
                    // the relay's main is not the one we minted: move under it, post ours again
                    rehome(mine, c.cid, c.device, c.deviceName)
                    store.putConversation(store.conversation(mainId)!!.copy(pushedTitle = c.title))
                }
                touched += mainId
                return true
            }
            val id = chats.createSession(c.title, c.createdAt * 1000, c.updatedAt * 1000, main = true)
            store.putConversation(SyncConversation(id, c.cid, "main", c.device, c.deviceName, pushedTitle = c.title, pushed = true))
            touched += id
            return true
        }
        val id = chats.createSession(c.title, c.createdAt * 1000, c.updatedAt * 1000, main = false)
        store.putConversation(SyncConversation(id, c.cid, "side", c.device, c.deviceName, pushedTitle = c.title, pushed = true))
        touched += id
        return true
    }

    private suspend fun applyMessage(m: RemoteMessage, touched: MutableSet<String>): Boolean {
        val known = store.messageByMid(m.mid)
        if (m.deleted) {
            if (known == null) return false
            chats.deleteMessage(known.messageId)
            store.removeMessages(listOf(known.messageId))
            touched += known.sessionId
            return true
        }
        if (known != null) return false // ours, or seen before
        if (m.role != "user" && m.role != "assistant") return false
        val conv = store.conversationByCid(m.cid) ?: return false
        if (conv.deleted) return false
        val id = chats.insertMessage(conv.sessionId, m.role, m.text, m.attachments, m.createdAt * 1000)
        store.putMessages(listOf(SyncMessage(id, m.mid, conv.sessionId, pushed = true)))
        touched += conv.sessionId
        return true
    }

    // ── the switch and the delete ─────────────────────────────────────────

    /** The person turned the switch: the relay first, then what this phone remembers. */
    suspend fun setEnabled(on: Boolean): SyncState {
        val state = api.setEnabled(on)
        if (on) {
            // the relay's store is empty again: everything of this phone goes out
            ensureAccount()
            store.markAllUnpushed()
            store.putMeta(SyncStore.CURSOR, null)
        }
        return state
    }

    /** "Delete synced conversations": the relay's store goes, the switch and the local chats stay. */
    suspend fun wipe() {
        api.wipe()
    }

    /** The relay's view of the switch and the counts. */
    suspend fun state(): SyncState = api.state()

    /** Which local chats came from another device, and that device's name — the drawer's badge. */
    suspend fun badges(): Map<String, String> = badges(store, deviceId)

    companion object {
        /** Side chats started on another device; the main chat is everyone's and carries no badge. */
        suspend fun badges(store: SyncStore, deviceId: String): Map<String, String> =
            store.conversations()
                .filter { it.kind != "main" && it.device.isNotBlank() && it.device != deviceId && it.deviceName.isNotBlank() && !it.deleted }
                .associate { it.sessionId to it.deviceName }

        /** The relay keeps 16 KB; sending more only to have it cut gains nothing. */
        const val TEXT_MAX = 16_384
        /** The relay's ceiling per POST. */
        const val BATCH = 200
        const val PAGE = 500
    }
}
