package io.github.nanomuse.sync

import android.content.Context
import androidx.room.ColumnInfo
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Index
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

/*
 * What this phone remembers about sync, apart from the chats themselves: which local chat is
 * which `cid`, which local row is which `mid`, what was pushed, and the cursor. Its own small
 * database, so the OpenMinis schema (`minis.db`) stays as upstream ships it.
 */

/** A local chat ↔ a conversation of the account. */
@Entity(tableName = "sync_conversations", indices = [Index(value = ["cid"], unique = true)])
data class SyncConversation(
    @PrimaryKey val sessionId: String,
    val cid: String,
    /** `main` or `side`, fixed when the cid is minted or adopted. */
    val kind: String,
    /** The device that started it (ours for local chats; another for pulled ones — the drawer's badge). */
    val device: String,
    val deviceName: String,
    /** The title as the relay last heard it from us (or gave it to us). */
    val pushedTitle: String?,
    /** The relay knows this conversation. */
    val pushed: Boolean,
    /** Deleted here; the tombstone still has to go out. */
    val deleted: Boolean = false,
)

/** A local message row ↔ a `mid`. Rows that are not part of the transcript have no entry. */
@Entity(tableName = "sync_messages", indices = [Index(value = ["mid"], unique = true), Index(value = ["sessionId"])])
data class SyncMessage(
    @PrimaryKey val messageId: String,
    val mid: String,
    val sessionId: String,
    val pushed: Boolean,
    /** The device that wrote the row — blank for this phone's own; another id for a pulled one (contract C8's caption). */
    @ColumnInfo(defaultValue = "") val device: String = "",
    @ColumnInfo(defaultValue = "") val deviceName: String = "",
)

@Entity(tableName = "sync_meta")
data class SyncMeta(@PrimaryKey val key: String, val value: String)

/** The mapping store, as the engine sees it; [RoomSyncStore] on the phone, a map in tests. */
interface SyncStore {
    suspend fun meta(key: String): String?
    suspend fun putMeta(key: String, value: String?)
    suspend fun conversations(): List<SyncConversation>
    suspend fun conversation(sessionId: String): SyncConversation?
    suspend fun conversationByCid(cid: String): SyncConversation?
    suspend fun putConversation(c: SyncConversation)
    suspend fun removeConversation(sessionId: String)
    suspend fun messages(sessionId: String): List<SyncMessage>
    suspend fun messageByMid(mid: String): SyncMessage?
    /** The rows that came from the relay with a device on them (pulled, not this phone's own). */
    suspend fun pulledMessages(): List<SyncMessage>
    suspend fun putMessages(list: List<SyncMessage>)
    suspend fun removeMessages(messageIds: List<String>)
    suspend fun removeMessagesOf(sessionId: String)
    /** Everything goes out again on the next push (the switch turned back on). */
    suspend fun markAllUnpushed()
    suspend fun clear()

    companion object {
        const val CURSOR = "cursor"
        const val ACCOUNT = "account"
    }
}

@Dao
interface SyncDao {
    @Query("SELECT value FROM sync_meta WHERE `key` = :key")
    suspend fun meta(key: String): String?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putMeta(row: SyncMeta)

    @Query("DELETE FROM sync_meta WHERE `key` = :key")
    suspend fun removeMeta(key: String)

    @Query("SELECT * FROM sync_conversations")
    suspend fun conversations(): List<SyncConversation>

    @Query("SELECT * FROM sync_conversations WHERE sessionId = :sessionId")
    suspend fun conversation(sessionId: String): SyncConversation?

    @Query("SELECT * FROM sync_conversations WHERE cid = :cid")
    suspend fun conversationByCid(cid: String): SyncConversation?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putConversation(c: SyncConversation)

    @Query("DELETE FROM sync_conversations WHERE sessionId = :sessionId")
    suspend fun removeConversation(sessionId: String)

    @Query("SELECT * FROM sync_messages WHERE sessionId = :sessionId")
    suspend fun messages(sessionId: String): List<SyncMessage>

    @Query("SELECT * FROM sync_messages WHERE mid = :mid")
    suspend fun messageByMid(mid: String): SyncMessage?

    @Query("SELECT * FROM sync_messages WHERE device != ''")
    suspend fun pulledMessages(): List<SyncMessage>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putMessages(list: List<SyncMessage>)

    @Query("DELETE FROM sync_messages WHERE messageId IN (:ids)")
    suspend fun removeMessages(ids: List<String>)

    @Query("DELETE FROM sync_messages WHERE sessionId = :sessionId")
    suspend fun removeMessagesOf(sessionId: String)

    @Query("UPDATE sync_messages SET pushed = 0")
    suspend fun unpushMessages()

    @Query("UPDATE sync_conversations SET pushed = 0")
    suspend fun unpushConversations()

    @Query("DELETE FROM sync_messages")
    suspend fun clearMessages()

    @Query("DELETE FROM sync_conversations")
    suspend fun clearConversations()

    @Query("DELETE FROM sync_meta")
    suspend fun clearMeta()
}

@Database(entities = [SyncConversation::class, SyncMessage::class, SyncMeta::class], version = 2, exportSchema = false)
abstract class SyncDatabase : RoomDatabase() {
    abstract fun dao(): SyncDao

    companion object {
        @Volatile private var instance: SyncDatabase? = null

        /** 0.1.37: which device wrote a pulled row, for the per-message caption. The ids and the cursor must survive. */
        private val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE sync_messages ADD COLUMN device TEXT NOT NULL DEFAULT ''")
                db.execSQL("ALTER TABLE sync_messages ADD COLUMN deviceName TEXT NOT NULL DEFAULT ''")
            }
        }

        fun get(context: Context): SyncDatabase = instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(context.applicationContext, SyncDatabase::class.java, "nanomuse_sync.db")
                .addMigrations(MIGRATION_1_2)
                .fallbackToDestructiveMigration()
                .build()
                .also { instance = it }
        }
    }
}

class RoomSyncStore(private val dao: SyncDao) : SyncStore {
    constructor(context: Context) : this(SyncDatabase.get(context).dao())

    override suspend fun meta(key: String): String? = dao.meta(key)
    override suspend fun putMeta(key: String, value: String?) {
        if (value == null) dao.removeMeta(key) else dao.putMeta(SyncMeta(key, value))
    }
    override suspend fun conversations(): List<SyncConversation> = dao.conversations()
    override suspend fun conversation(sessionId: String): SyncConversation? = dao.conversation(sessionId)
    override suspend fun conversationByCid(cid: String): SyncConversation? = dao.conversationByCid(cid)
    override suspend fun putConversation(c: SyncConversation) = dao.putConversation(c)
    override suspend fun removeConversation(sessionId: String) = dao.removeConversation(sessionId)
    override suspend fun messages(sessionId: String): List<SyncMessage> = dao.messages(sessionId)
    override suspend fun messageByMid(mid: String): SyncMessage? = dao.messageByMid(mid)
    override suspend fun pulledMessages(): List<SyncMessage> = dao.pulledMessages()
    override suspend fun putMessages(list: List<SyncMessage>) {
        if (list.isNotEmpty()) dao.putMessages(list)
    }
    override suspend fun removeMessages(messageIds: List<String>) {
        messageIds.chunked(500).forEach { dao.removeMessages(it) }
    }
    override suspend fun removeMessagesOf(sessionId: String) = dao.removeMessagesOf(sessionId)
    override suspend fun markAllUnpushed() {
        dao.unpushMessages()
        dao.unpushConversations()
    }
    override suspend fun clear() {
        dao.clearMessages()
        dao.clearConversations()
        dao.clearMeta()
    }
}
