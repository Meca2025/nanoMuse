package io.github.nanomuse.sync

import org.json.JSONArray
import org.json.JSONObject

/** The mapping store as a few maps. */
class MemorySyncStore : SyncStore {
    val meta = HashMap<String, String>()
    val convs = LinkedHashMap<String, SyncConversation>()
    val msgs = LinkedHashMap<String, SyncMessage>()

    override suspend fun meta(key: String) = meta[key]
    override suspend fun putMeta(key: String, value: String?) {
        if (value == null) meta.remove(key) else meta[key] = value
    }
    override suspend fun conversations() = convs.values.toList()
    override suspend fun conversation(sessionId: String) = convs[sessionId]
    override suspend fun conversationByCid(cid: String) = convs.values.firstOrNull { it.cid == cid }
    override suspend fun putConversation(c: SyncConversation) {
        convs[c.sessionId] = c
    }
    override suspend fun removeConversation(sessionId: String) {
        convs.remove(sessionId)
    }
    override suspend fun messages(sessionId: String) = msgs.values.filter { it.sessionId == sessionId }
    override suspend fun messageByMid(mid: String) = msgs.values.firstOrNull { it.mid == mid }
    override suspend fun putMessages(list: List<SyncMessage>) {
        for (m in list) msgs[m.messageId] = m
    }
    override suspend fun removeMessages(messageIds: List<String>) {
        messageIds.forEach { msgs.remove(it) }
    }
    override suspend fun removeMessagesOf(sessionId: String) {
        msgs.values.filter { it.sessionId == sessionId }.forEach { msgs.remove(it.messageId) }
    }
    override suspend fun markAllUnpushed() {
        for ((k, v) in msgs.toMap()) msgs[k] = v.copy(pushed = false)
        for ((k, v) in convs.toMap()) convs[k] = v.copy(pushed = false)
    }
    override suspend fun clear() {
        meta.clear(); convs.clear(); msgs.clear()
    }
}

/** The phone's chats as lists, with the same parts JSON shapes OpenMinis writes. */
class MemoryChats : LocalChats {
    class Session(val id: String, var title: String?, val createdAt: Long, var updatedAt: Long)

    val sessions = LinkedHashMap<String, Session>()
    val rows = LinkedHashMap<String, MutableList<LocalMessage>>()
    var main: String? = null
    private var seq = 0
    val attachmentLine: (String) -> String = { "[Attachment $it]" }

    fun addSession(id: String, title: String? = null, createdAt: Long = 1_000_000L): Session =
        Session(id, title, createdAt, createdAt).also { sessions[id] = it; rows[id] = mutableListOf() }

    fun user(sessionId: String, text: String, at: Long = next()): String = add(sessionId, "user", textParts(text), at)
    fun assistant(sessionId: String, text: String, at: Long = next()): String = add(sessionId, "assistant", textParts(text), at)
    fun assistantTool(sessionId: String, text: String, at: Long = next()): String = add(
        sessionId, "assistant",
        JSONArray().apply {
            if (text.isNotEmpty()) put(JSONObject().put("type", "text").put("value", text))
            put(JSONObject().put("type", "toolUse").put("value", JSONObject().put("toolUseId", "t1").put("name", "shell_execute").put("input", "{}")))
        }.toString(),
        at,
    )
    fun toolResult(sessionId: String, at: Long = next()): String = add(
        sessionId, "user",
        JSONArray().put(JSONObject().put("type", "toolResult").put("value", JSONObject().put("toolUseId", "t1").put("output", "ok").put("success", true))).toString(),
        at,
    )
    fun userWithPicture(sessionId: String, text: String, file: String, at: Long = next()): String = add(
        sessionId, "user",
        JSONArray().apply {
            put(JSONObject().put("type", "text").put("value", text))
            put(JSONObject().put("type", "mediaRef").put("value", JSONObject().put("id", "m").put("relativePath", "a/$file").put("mimeType", "image/png")))
        }.toString(),
        at,
    )

    fun removeRow(id: String) {
        rows.values.forEach { list -> list.removeAll { it.id == id } }
    }

    fun next(): Long = 1_700_000_000_000L + (++seq) * 1000L

    private fun textParts(text: String) = JSONArray().put(JSONObject().put("type", "text").put("value", text)).toString()

    private fun add(sessionId: String, role: String, parts: String, at: Long): String {
        val id = "row-${++seq}"
        rows.getValue(sessionId) += LocalMessage(id, sessionId, role, parts, at)
        sessions.getValue(sessionId).updatedAt = maxOf(sessions.getValue(sessionId).updatedAt, at)
        return id
    }

    override suspend fun sessions() = sessions.values.map { LocalSession(it.id, it.title?.takeIf { t -> t.isNotBlank() }, it.createdAt, it.updatedAt) }
    override suspend fun session(id: String) = sessions[id]?.let { LocalSession(it.id, it.title?.takeIf { t -> t.isNotBlank() }, it.createdAt, it.updatedAt) }
    override suspend fun messages(sessionId: String) = rows[sessionId]?.sortedBy { it.createdAt }?.toList() ?: emptyList()
    override suspend fun mainSessionId() = main?.takeIf { it in sessions }
    override suspend fun createSession(title: String?, createdAt: Long, updatedAt: Long, main: Boolean): String {
        val id = "local-${++seq}"
        sessions[id] = Session(id, title, createdAt, updatedAt)
        rows[id] = mutableListOf()
        if (main) this.main = id
        return id
    }
    override suspend fun renameSession(id: String, title: String?, updatedAt: Long) {
        sessions.getValue(id).title = title
        sessions.getValue(id).updatedAt = updatedAt
    }
    override suspend fun deleteSession(id: String) {
        sessions.remove(id); rows.remove(id)
    }
    override suspend fun clearMessages(sessionId: String) {
        rows[sessionId]?.clear()
    }
    override suspend fun insertMessage(sessionId: String, role: String, text: String, attachments: List<Attachment>, createdAt: Long): String {
        val id = "pulled-${++seq}"
        rows.getValue(sessionId) += LocalMessage(id, sessionId, role, Transcript.partsJson(text, attachments.map { attachmentLine(it.name) }), createdAt)
        return id
    }
    override suspend fun deleteMessage(id: String) = removeRow(id)
}

/**
 * The relay of contract C7 in memory: one seq counter, idempotent mids, the newer title per
 * cid, one `main` per account (the older wins, the other is told `main_exists`), tombstones,
 * `sync_off` as 409.
 */
class FakeRelay(private val names: Map<String, String> = emptyMap()) : SyncApi {
    class Conv(val cid: String, val kind: String, var title: String?, val device: String, val createdAt: Long, var updatedAt: Long, var deleted: Boolean, var seq: Long)
    class Msg(val mid: String, val cid: String, val device: String, val role: String, var text: String, val attachments: List<Attachment>, val createdAt: Long, var deleted: Boolean, var seq: Long)

    var enabled = true
    var seq = 0L
    val convs = LinkedHashMap<String, Conv>()
    val msgs = LinkedHashMap<String, Msg>()
    val deletes = mutableListOf<String>()
    var wipes = 0
    var pushes = 0
    val pushedBatches = mutableListOf<Int>()
    /** Set to make every call fail with this. */
    var failWith: SyncException? = null

    private fun check() {
        failWith?.let { throw it }
    }

    override fun state(): SyncState {
        check()
        return SyncState(enabled, seq, convs.size, msgs.size)
    }

    override fun setEnabled(on: Boolean): SyncState {
        check()
        enabled = on
        if (!on) { convs.clear(); msgs.clear() }
        return state()
    }

    override fun changes(since: Long, limit: Int): Changes {
        check()
        if (!enabled) throw SyncException(409, "sync_off", "sync is off")
        val cs = convs.values.filter { it.seq > since }.sortedBy { it.seq }
        val ms = msgs.values.filter { it.seq > since }.sortedBy { it.seq }
        val all = (cs.map { it.seq } + ms.map { it.seq }).sorted().take(limit)
        val cut = all.lastOrNull() ?: since
        return Changes(
            cursor = if (all.size < limit) seq else cut,
            more = all.size >= limit && (cs.any { it.seq > cut } || ms.any { it.seq > cut }),
            conversations = cs.filter { it.seq <= cut }.map {
                RemoteConversation(it.cid, it.kind, it.title, it.device, names[it.device] ?: it.device, it.createdAt, it.updatedAt, it.deleted, it.seq)
            },
            messages = ms.filter { it.seq <= cut }.map {
                RemoteMessage(it.mid, it.cid, it.seq, it.device, it.role, it.text, it.text.length > 16_384, it.attachments, it.createdAt, it.deleted)
            },
        )
    }

    override fun push(device: String, conversations: List<OutConversation>, messages: List<OutMessage>): PushResult {
        check()
        if (!enabled) throw SyncException(409, "sync_off", "sync is off")
        if (messages.size > 200) throw SyncException(413, "http_413", "too many")
        pushes++
        pushedBatches += messages.size
        var accepted = 0
        val rejected = mutableListOf<Rejection>()
        for (c in conversations) {
            val known = convs[c.cid]
            if (known == null) {
                if (c.kind == "main") {
                    val main = convs.values.firstOrNull { it.kind == "main" && !it.deleted }
                    if (main != null) {
                        rejected += Rejection(null, c.cid, "main_exists", main.cid)
                        continue
                    }
                }
                convs[c.cid] = Conv(c.cid, c.kind, c.title, device, c.createdAt, c.updatedAt, c.deleted, ++seq)
                accepted++
            } else if (c.updatedAt >= known.updatedAt || c.deleted) {
                known.title = c.title; known.updatedAt = c.updatedAt; known.deleted = known.deleted || c.deleted; known.seq = ++seq
                accepted++
            }
        }
        for (m in messages) {
            val known = msgs[m.mid]
            if (known != null) {
                if (m.deleted && !known.deleted) { known.deleted = true; known.text = ""; known.seq = ++seq; accepted++ }
                continue
            }
            if (m.deleted) continue
            if (m.cid !in convs) { rejected += Rejection(m.mid, null, "unknown_cid", null); continue }
            if (m.role != "user" && m.role != "assistant") { rejected += Rejection(m.mid, null, "bad_role", null); continue }
            msgs[m.mid] = Msg(m.mid, m.cid, device, m.role, m.text.take(16_384), m.attachments, m.createdAt, false, ++seq)
            accepted++
        }
        return PushResult(seq, accepted, rejected)
    }

    override fun deleteConversation(cid: String) {
        check()
        deletes += cid
        convs[cid]?.let { it.deleted = true; it.seq = ++seq }
        msgs.values.filter { it.cid == cid }.forEach { it.deleted = true; it.text = "" }
    }

    override fun wipe() {
        check()
        wipes++
        convs.clear(); msgs.clear()
    }

    /** A device [device] starting a chat on the relay directly (what another client would do). */
    fun seed(device: String, cid: String, kind: String, title: String?, at: Long): Conv =
        Conv(cid, kind, title, device, at, at, false, ++seq).also { convs[cid] = it }

    fun seedMessage(device: String, cid: String, mid: String, role: String, text: String, at: Long, attachments: List<Attachment> = emptyList()): Msg =
        Msg(mid, cid, device, role, text, attachments, at, false, ++seq).also { msgs[mid] = it }
}
