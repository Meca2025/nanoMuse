package io.github.nanomuse.sync

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Contract C7's client rules, against the fake relay: ids, adoption, merge, tombstones, cursor, the switch. */
class SyncEngineTest {
    private val uuid = Regex("^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")

    private class Phone(val relay: FakeRelay, val device: String, account: String = "acct-1") {
        val store = MemorySyncStore()
        val chats = MemoryChats()
        var clock = 1_700_000_000_000L
        val engine = SyncEngine(store, chats, relay, device, account, now = { clock })
    }

    private fun phone(relay: FakeRelay, device: String, account: String = "acct-1") = Phone(relay, device, account)

    @Test fun `first push mints a cid per chat and a mid per message, main as main`() = runTest {
        val relay = FakeRelay()
        val p = phone(relay, "phone-a")
        p.chats.addSession("main"); p.chats.main = "main"
        p.chats.addSession("side", "Trip")
        p.chats.user("main", "hi"); p.chats.assistant("main", "hello")
        p.chats.user("side", "plan a trip"); p.chats.assistant("side", "where to?")

        val accepted = p.engine.push()

        assertEquals(6, accepted)
        val mainMap = p.store.convs.getValue("main")
        val sideMap = p.store.convs.getValue("side")
        assertEquals("main", mainMap.kind)
        assertEquals("side", sideMap.kind)
        assertTrue(uuid.matches(mainMap.cid))
        assertTrue(uuid.matches(sideMap.cid))
        assertTrue(mainMap.pushed && sideMap.pushed)
        assertEquals("Trip", sideMap.pushedTitle)
        assertEquals(4, p.store.msgs.size)
        assertTrue(p.store.msgs.values.all { it.pushed && uuid.matches(it.mid) })
        assertEquals(setOf("main", "side"), relay.convs.values.map { it.kind }.toSet())
        assertEquals(4, relay.msgs.size)
        // the cursor advanced through the pull that comes before a first push
        assertNotNull(p.engine.cursor())
        // nothing new: nothing sent
        val before = relay.pushes
        assertEquals(0, p.engine.push())
        assertEquals(before, relay.pushes)
    }

    @Test fun `the same mids go out again only when they were never accepted`() = runTest {
        val relay = FakeRelay()
        val p = phone(relay, "phone-a")
        p.chats.addSession("main"); p.chats.main = "main"
        p.chats.user("main", "one")
        p.engine.pull() // the first pull is behind us; the POST itself is what fails
        relay.failWith = SyncException(0, "unreachable", "offline")
        val failed = runCatching { p.engine.push() }.exceptionOrNull()
        assertTrue(failed is SyncException)
        relay.failWith = null
        val minted = p.store.msgs.values.single().mid
        assertEquals(2, p.engine.push())
        assertEquals(minted, relay.msgs.keys.single())
    }

    @Test fun `main chat adoption on the first pull`() = runTest {
        val relay = FakeRelay(mapOf("desk-1" to "Mac"))
        relay.seed("desk-1", "cid-main", "main", null, 1_700_000_000)
        relay.seedMessage("desk-1", "cid-main", "mid-1", "user", "from the mac", 1_700_000_001)
        relay.seedMessage("desk-1", "cid-main", "mid-2", "assistant", "the mac answers", 1_700_000_002)
        val p = phone(relay, "phone-a")
        p.chats.addSession("main"); p.chats.main = "main"
        p.chats.user("main", "from the phone", at = 1_700_000_010_000)

        p.engine.push() // pulls first

        val map = p.store.convs.getValue("main")
        assertEquals("cid-main", map.cid)
        assertEquals("main", map.kind)
        // the mac's two lines are in the phone's main chat, in time order, before the phone's own
        val texts = p.chats.messages("main").map { Transcript.items(listOf(it)).firstOrNull()?.text }
        assertEquals(listOf("from the mac", "the mac answers", "from the phone"), texts)
        // and the phone's line went up under the adopted cid
        assertEquals(setOf("cid-main"), relay.msgs.values.map { it.cid }.toSet())
        assertEquals(3, relay.msgs.size)
        // the main chat is never badged as another device's
        assertTrue(p.engine.badges().isEmpty())
    }

    @Test fun `no main chat yet - the remote one becomes it`() = runTest {
        val relay = FakeRelay(mapOf("desk-1" to "Mac"))
        relay.seed("desk-1", "cid-main", "main", "Main", 1_700_000_000)
        relay.seedMessage("desk-1", "cid-main", "mid-1", "user", "hello", 1_700_000_001)
        val p = phone(relay, "phone-a")

        p.engine.pull()

        val main = p.chats.mainSessionId()
        assertNotNull(main)
        assertEquals("cid-main", p.store.convs.getValue(main!!).cid)
        assertEquals(1, p.chats.messages(main).size)
    }

    @Test fun `two devices race for main - the loser re-posts under cid_main`() = runTest {
        val relay = FakeRelay()
        val a = phone(relay, "phone-a")
        a.chats.addSession("main"); a.chats.main = "main"
        a.chats.user("main", "a says")
        a.engine.push()
        val cidA = a.store.convs.getValue("main").cid

        // b pulled while the relay was still empty, then a pushed; b now pushes its own main
        val b = phone(relay, "phone-b")
        b.chats.addSession("main"); b.chats.main = "main"
        b.store.meta[SyncStore.ACCOUNT] = "acct-1"
        b.store.meta[SyncStore.CURSOR] = "0"
        b.chats.user("main", "b says")
        b.engine.push()

        assertEquals(cidA, b.store.convs.getValue("main").cid)
        assertEquals(1, relay.convs.values.count { it.kind == "main" })
        assertEquals(setOf("a says", "b says"), relay.msgs.values.filter { it.cid == cidA }.map { it.text }.toSet())
        assertTrue(b.store.msgs.values.all { it.pushed })
    }

    @Test fun `a side chat from another device appears with its badge and can be continued`() = runTest {
        val relay = FakeRelay(mapOf("pixel" to "Pixel 8"))
        relay.seed("pixel", "cid-s", "side", "Groceries", 1_700_000_000)
        relay.seedMessage("pixel", "cid-s", "mid-1", "user", "milk, eggs", 1_700_000_001, listOf(Attachment("list.pdf", "application/pdf", 12)))
        relay.seedMessage("pixel", "cid-s", "mid-2", "assistant", "noted", 1_700_000_002)
        val p = phone(relay, "phone-a")

        val r = p.engine.pull()

        assertEquals(3, r.applied)
        val local = p.chats.sessions.values.single()
        assertEquals("Groceries", local.title)
        assertEquals(mapOf(local.id to "Pixel 8"), p.engine.badges())
        val rows = p.chats.messages(local.id)
        assertEquals(2, rows.size)
        assertTrue(rows[0].partsJson.contains("[Attachment list.pdf]"))
        // the person goes on here: the new turn syncs back under the same cid
        p.chats.user(local.id, "and bread"); p.chats.assistant(local.id, "added")
        p.engine.push()
        assertEquals(4, relay.msgs.values.count { it.cid == "cid-s" })
        // the second pull brings nothing new: known mids are left alone
        assertEquals(0, p.engine.pull().applied)
        assertEquals(4, p.chats.messages(local.id).size)
    }

    @Test fun `tombstones - a deleted message and a deleted chat go away locally`() = runTest {
        val relay = FakeRelay(mapOf("pixel" to "Pixel 8"))
        relay.seed("pixel", "cid-s", "side", "Groceries", 1_700_000_000)
        relay.seedMessage("pixel", "cid-s", "mid-1", "user", "milk", 1_700_000_001)
        relay.seedMessage("pixel", "cid-s", "mid-2", "assistant", "noted", 1_700_000_002)
        val p = phone(relay, "phone-a")
        p.engine.pull()
        val local = p.chats.sessions.keys.single()

        relay.msgs.getValue("mid-2").apply { deleted = true; seq = ++relay.seq }
        p.engine.pull()
        assertEquals(1, p.chats.messages(local).size)

        relay.deleteConversation("cid-s")
        p.engine.pull()
        assertTrue(p.chats.sessions.isEmpty())
        assertTrue(p.store.convs.isEmpty())
        assertTrue(p.store.msgs.isEmpty())
    }

    @Test fun `an edit here is a new mid plus a tombstone, a deleted chat a tombstone plus DELETE`() = runTest {
        val relay = FakeRelay()
        val p = phone(relay, "phone-a")
        p.chats.addSession("main"); p.chats.main = "main"
        p.chats.addSession("side", "Old")
        val q = p.chats.user("side", "qustion")
        p.chats.assistant("side", "answer")
        p.engine.push()
        val oldMid = p.store.msgs.getValue(q).mid

        // edited: the row is cut and written again
        p.chats.removeRow(q)
        p.chats.user("side", "question", at = 1_700_000_000_500)
        p.engine.push()
        assertTrue(relay.msgs.getValue(oldMid).deleted)
        assertEquals(1, relay.msgs.values.count { !it.deleted && it.role == "user" && it.text == "question" })
        assertNull(p.store.msgs[q])

        // renamed
        p.chats.sessions.getValue("side").title = "New"
        p.engine.push()
        assertEquals("New", relay.convs.values.first { it.kind == "side" }.title)

        // deleted
        val cid = p.store.convs.getValue("side").cid
        p.chats.deleteSession("side")
        p.engine.push()
        assertTrue(relay.convs.getValue(cid).deleted)
        assertEquals(listOf(cid), relay.deletes)
        assertNull(p.store.convs["side"])
        assertTrue(p.store.msgs.values.none { it.sessionId == "side" })
    }

    @Test fun `a rename on another device lands here`() = runTest {
        val relay = FakeRelay()
        val p = phone(relay, "phone-a")
        p.chats.addSession("main"); p.chats.main = "main"
        p.chats.addSession("side", "Old")
        p.chats.user("side", "x")
        p.engine.push()
        val cid = p.store.convs.getValue("side").cid
        relay.convs.getValue(cid).apply { title = "Renamed elsewhere"; seq = ++relay.seq }

        val r = p.engine.pull()

        assertEquals("Renamed elsewhere", p.chats.sessions.getValue("side").title)
        assertTrue("side" in r.touchedSessions)
        // and it is not pushed back as a change of ours
        assertEquals(0, p.engine.push())
    }

    @Test fun `cursor is kept and pages are followed`() = runTest {
        val relay = FakeRelay(mapOf("pixel" to "Pixel 8"))
        relay.seed("pixel", "cid-s", "side", "Long", 1_700_000_000)
        repeat(1200) { relay.seedMessage("pixel", "cid-s", "mid-$it", if (it % 2 == 0) "user" else "assistant", "line $it", 1_700_000_001L + it) }
        val p = phone(relay, "phone-a")

        val r = p.engine.pull()

        assertEquals(1201, r.applied)
        assertEquals(relay.seq, r.cursor)
        assertEquals(relay.seq.toString(), p.store.meta[SyncStore.CURSOR])
        // later changes only
        relay.seedMessage("pixel", "cid-s", "mid-new", "user", "one more", 1_700_000_900)
        assertEquals(1, p.engine.pull().applied)
    }

    @Test fun `a push of many messages goes in batches of 200`() = runTest {
        val relay = FakeRelay()
        val p = phone(relay, "phone-a")
        p.chats.addSession("main"); p.chats.main = "main"
        repeat(250) { p.chats.user("main", "q$it"); p.chats.assistant("main", "a$it") }
        p.engine.push()
        assertEquals(listOf(200, 200, 100), relay.pushedBatches)
        assertEquals(500, relay.msgs.size)
    }

    @Test fun `another account starts clean`() = runTest {
        val relay = FakeRelay()
        val p = phone(relay, "phone-a", account = "acct-1")
        p.chats.addSession("main"); p.chats.main = "main"
        p.chats.user("main", "hi")
        p.engine.push()
        val relay2 = FakeRelay()
        val q = SyncEngine(p.store, p.chats, relay2, "phone-a", "acct-2")
        q.push()
        assertEquals("acct-2", p.store.meta[SyncStore.ACCOUNT])
        assertEquals(1, relay2.msgs.size)
    }

    @Test fun `sync_off is a 409 the caller sees, the switch on re-pushes everything`() = runTest {
        val relay = FakeRelay()
        val p = phone(relay, "phone-a")
        p.chats.addSession("main"); p.chats.main = "main"
        p.chats.user("main", "hi")
        p.engine.push()
        p.engine.setEnabled(false)
        assertTrue(relay.convs.isEmpty() && relay.msgs.isEmpty())
        val e = runCatching { p.engine.pull() }.exceptionOrNull() as? SyncException
        assertEquals(409, e?.status)
        assertEquals("sync_off", e?.code)

        p.engine.setEnabled(true)
        assertNull(p.engine.cursor())
        assertEquals(2, p.engine.push())
        assertEquals(1, relay.msgs.size)
        assertEquals(1, relay.convs.size)
    }

    @Test fun `delete synced conversations wipes the relay and keeps the chats here`() = runTest {
        val relay = FakeRelay()
        val p = phone(relay, "phone-a")
        p.chats.addSession("main"); p.chats.main = "main"
        p.chats.user("main", "hi")
        p.engine.push()
        p.engine.wipe()
        assertEquals(1, relay.wipes)
        assertTrue(relay.msgs.isEmpty())
        assertEquals(1, p.chats.messages("main").size)
        assertFalse(p.store.convs.isEmpty())
    }

    @Test fun `a long text is cut at what the relay keeps`() = runTest {
        val relay = FakeRelay()
        val p = phone(relay, "phone-a")
        p.chats.addSession("main"); p.chats.main = "main"
        p.chats.user("main", "x".repeat(40_000))
        p.engine.push()
        assertEquals(SyncEngine.TEXT_MAX, relay.msgs.values.single().text.length)
    }
}
