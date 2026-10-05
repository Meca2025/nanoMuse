package io.github.nanomuse.sync

import java.io.IOException

/*
 * The shapes of contract C7 (conversation sync across the account's devices), as the relay
 * sends and takes them. Timestamps are Unix seconds, as on the wire; the local side works in
 * milliseconds and converts at the edge.
 */

/** A file or picture that rode with a message — its name and kind only, never the bytes. */
data class Attachment(val name: String, val mime: String, val size: Long)

/** One conversation as the relay lists it in `GET /v1/sync/changes`. */
data class RemoteConversation(
    val cid: String,
    val kind: String,
    val title: String?,
    val device: String,
    val deviceName: String,
    val createdAt: Long,
    val updatedAt: Long,
    val deleted: Boolean,
    val seq: Long,
)

/** One message as the relay lists it. */
data class RemoteMessage(
    val mid: String,
    val cid: String,
    val seq: Long,
    val device: String,
    val role: String,
    val text: String,
    val truncated: Boolean,
    val attachments: List<Attachment>,
    val createdAt: Long,
    val deleted: Boolean,
)

/** A page of changes since a cursor, in `seq` order. */
data class Changes(
    val cursor: Long,
    val more: Boolean,
    val conversations: List<RemoteConversation>,
    val messages: List<RemoteMessage>,
)

/** A conversation as this device posts it. */
data class OutConversation(
    val cid: String,
    val kind: String,
    val title: String?,
    val createdAt: Long,
    val updatedAt: Long,
    val deleted: Boolean = false,
)

/** A message as this device posts it; `deleted` makes it a tombstone for a known `mid`. */
data class OutMessage(
    val mid: String,
    val cid: String,
    val role: String,
    val text: String,
    val attachments: List<Attachment> = emptyList(),
    val createdAt: Long,
    val deleted: Boolean = false,
)

/** What the relay refused in a POST, and why. */
data class Rejection(val mid: String?, val cid: String?, val reason: String, val cidMain: String?)

data class PushResult(val cursor: Long, val accepted: Int, val rejected: List<Rejection>)

/** `GET /v1/sync/state`. */
data class SyncState(val enabled: Boolean, val cursor: Long, val conversations: Int, val messages: Int)

/**
 * The relay said no, or could not be reached ([status] 0). `code` is the relay's stable word
 * (`sync_off`, `bad_key`) or `http_<status>`.
 */
class SyncException(val status: Int, val code: String, message: String) : IOException(message)
