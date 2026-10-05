package io.github.nanomuse.sync

import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/** The `/v1/sync` routes on the wire: paths, the token, the bodies, the errors. */
class RelaySyncApiTest {
    private val server = MockWebServer()
    private lateinit var api: RelaySyncApi

    @Before fun up() {
        server.start()
        api = RelaySyncApi(server.url("/").toString().trimEnd('/'), "nm_secret", "nanoMuse-Android/test")
    }

    @After fun down() {
        server.shutdown()
    }

    @Test fun `state and the switch`() {
        server.enqueue(MockResponse().setBody("""{"enabled":true,"cursor":12,"counts":{"conversations":2,"messages":9},"limits":{"messages":20000,"text_bytes":16384}}"""))
        val s = api.state()
        assertEquals(SyncState(true, 12, 2, 9), s)
        val req = server.takeRequest()
        assertEquals("GET", req.method)
        assertEquals("/v1/sync/state", req.path)
        assertEquals("Bearer nm_secret", req.getHeader("Authorization"))

        server.enqueue(MockResponse().setBody("""{"enabled":false,"cursor":12,"counts":{"conversations":0,"messages":0}}"""))
        assertFalse(api.setEnabled(false).enabled)
        val put = server.takeRequest()
        assertEquals("PUT", put.method)
        assertEquals("""{"enabled":false}""", put.body.readUtf8())
    }

    @Test fun `changes are parsed in full`() {
        server.enqueue(
            MockResponse().setBody(
                """{"cursor":1300,"more":true,
                    "conversations":[{"cid":"c1","kind":"side","title":"Trip","device":"d1","device_name":"Pixel 8","created_at":1738000000,"updated_at":1738000100,"deleted":false,"seq":1201}],
                    "messages":[{"mid":"m1","cid":"c1","seq":1202,"device":"d1","role":"user","text":"hi","truncated":false,
                                 "attachments":[{"name":"a.pdf","mime":"application/pdf","size":1234}],"created_at":1738000050,"deleted":false},
                                {"mid":"m2","cid":"c1","seq":1203,"device":"d1","role":"assistant","text":null,"deleted":true,"created_at":1738000060}]}""",
            ),
        )
        val ch = api.changes(1200, 500)
        assertEquals("/v1/sync/changes?since=1200&limit=500", server.takeRequest().path)
        assertEquals(1300, ch.cursor)
        assertTrue(ch.more)
        val c = ch.conversations.single()
        assertEquals(RemoteConversation("c1", "side", "Trip", "d1", "Pixel 8", 1738000000, 1738000100, false, 1201), c)
        assertEquals(2, ch.messages.size)
        assertEquals(listOf(Attachment("a.pdf", "application/pdf", 1234)), ch.messages[0].attachments)
        assertEquals("", ch.messages[1].text)
        assertTrue(ch.messages[1].deleted)
    }

    @Test fun `a push body carries the device, the chats and the messages`() {
        server.enqueue(MockResponse().setBody("""{"cursor":7,"accepted":2,"rejected":[{"cid":"c-main","reason":"main_exists","cid_main":"c-older"}]}"""))
        val r = api.push(
            "phone-1",
            listOf(OutConversation("c-main", "main", null, 1, 2)),
            listOf(OutMessage("m1", "c-main", "user", "hello", listOf(Attachment("p.png", "image/png", 0)), 3), OutMessage("m0", "c-main", "user", "", createdAt = 4, deleted = true)),
        )
        assertEquals(2, r.accepted)
        assertEquals(Rejection(null, "c-main", "main_exists", "c-older"), r.rejected.single())
        val req = server.takeRequest()
        assertEquals("POST", req.method)
        assertEquals("/v1/sync/changes", req.path)
        val body = JSONObject(req.body.readUtf8())
        assertEquals("phone-1", body.getString("device"))
        val conv = body.getJSONArray("conversations").getJSONObject(0)
        assertEquals("main", conv.getString("kind"))
        assertTrue(conv.isNull("title"))
        assertFalse(conv.has("deleted"))
        val msgs = body.getJSONArray("messages")
        assertEquals("p.png", msgs.getJSONObject(0).getJSONArray("attachments").getJSONObject(0).getString("name"))
        assertTrue(msgs.getJSONObject(1).getBoolean("deleted"))
    }

    @Test fun `deletes hit their routes`() {
        server.enqueue(MockResponse().setBody("{}"))
        api.deleteConversation("c1")
        var req = server.takeRequest()
        assertEquals("DELETE", req.method)
        assertEquals("/v1/sync/conversations/c1", req.path)
        server.enqueue(MockResponse().setBody("{}"))
        api.wipe()
        req = server.takeRequest()
        assertEquals("DELETE", req.method)
        assertEquals("/v1/sync/changes", req.path)
    }

    @Test fun `the relay's refusals keep their status and code`() {
        server.enqueue(MockResponse().setResponseCode(409).setBody("""{"error":"sync_off"}"""))
        val off = runCatching { api.changes(0) }.exceptionOrNull() as SyncException
        assertEquals(409, off.status)
        assertEquals("sync_off", off.code)
        server.enqueue(MockResponse().setResponseCode(401).setBody("""{"error":{"code":"bad_key","message":"no such key"}}"""))
        val bad = runCatching { api.state() }.exceptionOrNull() as SyncException
        assertEquals(401, bad.status)
        assertEquals("bad_key", bad.code)
        server.enqueue(MockResponse().setResponseCode(500))
        val boom = runCatching { api.state() }.exceptionOrNull() as SyncException
        assertEquals("http_500", boom.code)
        assertNull(boom.cause)
    }

    @Test fun `no server is status 0`() {
        val gone = RelaySyncApi("http://127.0.0.1:1", "k", "ua")
        val e = runCatching { gone.state() }.exceptionOrNull() as SyncException
        assertEquals(0, e.status)
        assertEquals("unreachable", e.code)
    }
}
