"""Passwords, sign-ins, the usage breakdown, calls and the operator's detail views."""

from __future__ import annotations

import asyncio
import json
import threading
import time

import httpx
import websockets
from starlette.testclient import TestClient
from test_cloud import fake_upstream, sign_up

from nanomuse_cloud.api import create_app
from nanomuse_cloud.config import RealtimeUsage, Settings
from nanomuse_cloud.db import Database
from nanomuse_cloud.senders import LogSender
from nanomuse_cloud.service import Cloud, check_password, hash_password


def make(**overrides):
    up = fake_upstream()
    kw = dict(
        database=":memory:", secret="test-secret", admin_token="admin",
        upstream_base="http://upstream/compat/v1", upstream_key="sk-upstream",
        dashscope_base="http://upstream/ds/api/v1",
        signup_tokens=0, daily_cap_tokens=0, per_minute_requests=100, daily_cap_cny=25,
        public_base="http://cloud.test", password_max_attempts=3, lockout_s=600,
    )
    kw.update(overrides)
    settings = Settings(**kw)
    sender = LogSender()
    cloud = Cloud(settings, Database(":memory:"), sender)
    app = create_app(settings, cloud, upstream_transport=httpx.ASGITransport(app=up))
    client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://cloud.test")
    return app, client, sender, up, cloud, settings


def auth(key: str) -> dict:
    return {"Authorization": f"Bearer {key}"}


def test_password_hashing_roundtrip():
    h = hash_password("correct horse")
    assert h.startswith("scrypt$") and check_password("correct horse", h)
    assert not check_password("wrong", h)
    assert not check_password("x", "garbage")
    assert hash_password("a") != hash_password("a")  # salted


async def test_password_set_login_change_and_lockout():
    app, client, sender, up, cloud, settings = make()
    first = await sign_up(client, sender, "13800138000", "pixel")
    key1 = first["api_key"]
    assert first["account"]["has_password"] is False and first["account"]["signed_in_via"] == "code"

    # No password yet: the password sign-in says so instead of pretending.
    r = await client.post("/v1/auth/login", json={"identifier": "13800138000", "password": "whatever1", "device": "mac"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "no_password"

    # Weak ones are refused; a proper one is set without `current` (none exists).
    r = await client.post("/v1/auth/password", json={"password": "short"}, headers=auth(key1))
    assert r.status_code == 400 and r.json()["error"]["code"] == "password_short"
    r = await client.post("/v1/auth/password", json={"password": "aaaaaaaaaa"}, headers=auth(key1))
    assert r.status_code == 400 and r.json()["error"]["code"] == "password_weak"
    r = await client.post("/v1/auth/password", json={"password": "correct horse 1"}, headers=auth(key1))
    assert r.status_code == 204
    me = (await client.get("/v1/me", headers=auth(key1))).json()
    assert me["account"]["has_password"] is True and me["account"]["password_set_at"]

    # A second device signs in with the password: a new key, same account, via=password.
    r = await client.post("/v1/auth/login", json={"identifier": "13800138000", "password": "correct horse 1", "device": "mac"})
    assert r.status_code == 200, r.text
    second = r.json()
    key2 = second["api_key"]
    assert key2 != key1 and second["account"]["id"] == first["account"]["id"]
    assert second["account"]["signed_in_via"] == "password" and second["account"]["sessions"] == 2

    # Unknown numbers and wrong passwords get the same answer.
    r = await client.post("/v1/auth/login", json={"identifier": "13900001111", "password": "correct horse 1"})
    assert r.status_code == 401 and r.json()["error"]["code"] == "bad_credentials"
    r = await client.post("/v1/auth/login", json={"identifier": "13800138000", "password": "nope nope nope"})
    assert r.status_code == 401 and r.json()["error"]["code"] == "bad_credentials"

    # Changing it needs the current one — this key is well past the reset window.
    cloud.db._conn.execute("UPDATE api_keys SET created_at=created_at-7200")
    r = await client.post("/v1/auth/password", json={"password": "another one 2"}, headers=auth(key1))
    assert r.status_code == 400 and r.json()["error"]["code"] == "password_required"
    r = await client.post("/v1/auth/password", json={"password": "another one 2", "current": "wrong"}, headers=auth(key1))
    assert r.status_code == 400 and r.json()["error"]["code"] == "password_wrong"
    r = await client.post("/v1/auth/password", json={"password": "another one 2", "current": "correct horse 1"}, headers=auth(key1))
    assert r.status_code == 204

    # Three wrong tries lock the password (the code still works); a fresh code
    # sign-in may then set a new password without the old one.
    for _ in range(2):
        r = await client.post("/v1/auth/login", json={"identifier": "13800138000", "password": "bad"})
        assert r.status_code == 401
    r = await client.post("/v1/auth/login", json={"identifier": "13800138000", "password": "bad"})
    assert r.status_code == 429 and r.json()["error"]["code"] == "locked"
    r = await client.post("/v1/auth/login", json={"identifier": "13800138000", "password": "another one 2"})
    assert r.status_code == 429
    third = await sign_up(client, sender, "13800138000", "ipad")
    r = await client.post("/v1/auth/password", json={"password": "reset by code 3"}, headers=auth(third["api_key"]))
    assert r.status_code == 204
    r = await client.post("/v1/auth/login", json={"identifier": "13800138000", "password": "reset by code 3", "device": "win"})
    assert r.status_code == 200

    # The timeline shows what happened, never what was said.
    events = (await client.get("/v1/me/events", headers=auth(key1))).json()["events"]
    kinds = [e["kind"] for e in events]
    assert "password.set" in kinds and "password.changed" in kinds and "sign_in.password" in kinds and "sign_in.failed" in kinds
    assert all("detail" in e and len(e["detail"]) <= 200 for e in events)


async def test_sessions_can_be_listed_and_revoked():
    app, client, sender, up, cloud, settings = make()
    a = await sign_up(client, sender, "dev-a@example.com", "pixel")
    b = await sign_up(client, sender, "dev-a@example.com", "mac")
    c = await sign_up(client, sender, "dev-a@example.com", "ipad")
    r = await client.get("/v1/me/sessions", headers=auth(a["api_key"]))
    sessions = r.json()["sessions"]
    assert [s["device"] for s in sessions][0] == "pixel" and sessions[0]["current"] is True
    assert {s["device"] for s in sessions} == {"pixel", "mac", "ipad"}
    assert all(s["via"] == "code" and len(s["prefix"]) == 10 for s in sessions)

    # Sign the tablet out from the phone; it stops working at once.
    ipad = next(s for s in sessions if s["device"] == "ipad")
    r = await client.delete(f"/v1/me/sessions/{ipad['prefix']}", headers=auth(a["api_key"]))
    assert r.status_code == 204
    assert (await client.get("/v1/me", headers=auth(c["api_key"]))).status_code == 401
    r = await client.delete("/v1/me/sessions/nm_nothere", headers=auth(a["api_key"]))
    assert r.status_code == 404

    # Everyone else out: only the phone stays.
    r = await client.post("/v1/auth/sign-out-all", json={}, headers=auth(a["api_key"]))
    assert r.status_code == 200 and r.json()["signed_out"] == 1
    assert (await client.get("/v1/me", headers=auth(b["api_key"]))).status_code == 401
    assert (await client.get("/v1/me", headers=auth(a["api_key"]))).status_code == 200
    r = await client.post("/v1/auth/sign-out-all", json={"all": True}, headers=auth(a["api_key"]))
    assert r.json()["signed_out"] == 1
    assert (await client.get("/v1/me", headers=auth(a["api_key"]))).status_code == 401


async def test_usage_is_broken_down_by_kind_and_model():
    app, client, sender, up, cloud, settings = make()
    data = await sign_up(client, sender)
    headers = auth(data["api_key"])
    for _ in range(2):
        r = await client.post("/v1/chat/completions", json={"model": "qwen3.8-27b", "messages": [{"role": "user", "content": "hi"}]}, headers=headers)
        assert r.status_code == 200
    r = await client.post("/v1/chat/completions", json={"model": "qwen3.8-flash", "messages": [{"role": "user", "content": "hi"}]}, headers=headers)
    assert r.status_code == 200
    r = await client.post("/v1/images/generations", json={"model": "qwen-image-3.0-pro", "prompt": "a cat", "n": 1}, headers=headers)
    assert r.status_code == 200, r.text

    me = (await client.get("/v1/me", headers=headers)).json()
    usage = me["usage"]
    assert usage["kinds"] == ["chat", "image", "video", "realtime"]
    by_kind = {row["kind"]: row for row in usage["today"]["by_kind"]}
    assert by_kind["chat"]["requests"] == 3 and by_kind["chat"]["prompt_tokens"] == 300 and by_kind["chat"]["completion_tokens"] == 150
    assert by_kind["image"]["requests"] == 1 and by_kind["image"]["cost_cny"] == 0.25
    by_model = {(row["model"], row["kind"]): row for row in usage["total"]["by_model"]}
    assert by_model[("qwen3.8-27b", "chat")]["requests"] == 2 and by_model[("qwen3.8-flash", "chat")]["requests"] == 1
    assert by_model[("qwen-image-3.0-pro", "image")]["requests"] == 1
    # Money adds up across kinds: 2 × (100×3 + 50×12) + (100×0.8 + 50×2.7) micro-yuan + ¥0.25
    total_cny = sum(row["cost_cny"] for row in usage["total"]["by_kind"])
    assert round(total_cny, 4) == round(2 * 0.0009 + 0.000215 + 0.25, 4)


def test_realtime_usage_and_prices():
    done = {
        "type": "response.done",
        "response": {
            "usage": {
                "input_tokens": 1300, "output_tokens": 700,
                "input_token_details": {"text_tokens": 300, "audio_tokens": 1000, "image_tokens": 0},
                "output_token_details": {"text_tokens": 200, "audio_tokens": 500},
            }
        },
    }
    u = RealtimeUsage.from_response_done(done)
    assert u == RealtimeUsage(text_in=300, audio_in=1000, image_in=0, text_out=200, audio_out=500)
    assert u.input_tokens == 1300 and u.output_tokens == 700
    spec = Settings().model("qwen3.5-omni-flash-realtime")
    assert spec is not None and spec.kind == "realtime"
    # text in 300×3.3 + audio in 1000×27 + audio out 500×107 (the spoken text is free) = 81 490 µ¥
    assert spec.realtime_cost_uy(u) == round(300 * 3.3 + 1000 * 27 + 500 * 107)
    # The grant weighs audio eight times: 300 + 8000 + 200 + 4000
    assert spec.realtime_charged(u) == 300 + 8000 + 200 + 4000
    # Text-only answers bill the text out.
    t = RealtimeUsage(text_in=100, text_out=50)
    assert spec.realtime_cost_uy(t) == round(100 * 3.3 + 50 * 20)
    # Without details the totals are taken as text.
    u2 = RealtimeUsage.from_response_done({"type": "response.done", "response": {"usage": {"input_tokens": 10, "output_tokens": 5}}})
    assert u2 == RealtimeUsage(text_in=10, text_out=5)
    assert RealtimeUsage.from_response_done({"type": "response.done", "response": {}}) is None


class FakeRealtimeUpstream:
    """A provider stand-in: answers every committed buffer with one audio delta
    and a `response.done` carrying usage; remembers what it was sent."""

    def __init__(self):
        self.received: list[dict] = []
        self.headers: dict = {}
        self.port = 0
        self._ready = threading.Event()
        self._loop: asyncio.AbstractEventLoop | None = None
        self._thread = threading.Thread(target=self._run, daemon=True)

    def start(self) -> FakeRealtimeUpstream:
        self._thread.start()
        assert self._ready.wait(5)
        return self

    def stop(self) -> None:
        if self._loop is not None:
            self._loop.call_soon_threadsafe(self._stopping.set)
            self._thread.join(5)

    def _run(self) -> None:
        self._loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self._loop)
        self._stopping = asyncio.Event()

        async def serve():
            async with websockets.serve(self._handle, "127.0.0.1", 0) as server:
                self.port = server.sockets[0].getsockname()[1]
                self._ready.set()
                await self._stopping.wait()

        self._loop.run_until_complete(serve())
        self._loop.close()

    async def _handle(self, ws) -> None:
        self.headers = dict(ws.request.headers)
        self.path = ws.request.path
        await ws.send(json.dumps({"type": "session.created", "session": {"id": "s1", "model": "fake", "voice": "Cherry"}}))
        async for raw in ws:
            ev = json.loads(raw)
            self.received.append(ev)
            if ev.get("type") == "input_audio_buffer.commit":
                await ws.send(json.dumps({"type": "response.audio.delta", "delta": "AAAA"}))
                await ws.send(json.dumps({
                    "type": "response.done",
                    "response": {"usage": {
                        "input_tokens": 1100, "output_tokens": 300,
                        "input_token_details": {"text_tokens": 100, "audio_tokens": 1000},
                        "output_token_details": {"text_tokens": 50, "audio_tokens": 250},
                    }},
                }))


def test_call_is_relayed_metered_and_hung_up_at_the_cap():
    upstream = FakeRealtimeUpstream().start()
    try:
        # A tiny cap: the first answer costs 100×3.3 + 1000×27 + 250×107 = 54 080 µ¥ ≈ ¥0.054,
        # so a ¥0.05 cap allows exactly one answer before the relay hangs up.
        app, client, sender, up, cloud, settings = make(
            realtime_base=f"ws://127.0.0.1:{upstream.port}/api-ws/v1/realtime", daily_cap_cny=0.05,
        )
        tc = TestClient(app)
        r = tc.post("/v1/auth/code", json={"identifier": "13800138000"})
        assert r.status_code == 204
        ident, code = sender.sent[-1]
        key = tc.post("/v1/auth/verify", json={"identifier": "13800138000", "code": code, "device": "pixel"}).json()["api_key"]

        # Header auth, model by query; the greeting comes through untouched.
        with tc.websocket_connect("/v1/realtime?model=qwen3.5-omni-flash-realtime", headers=auth(key)) as ws:
            created = ws.receive_json()
            assert created["type"] == "session.created"
            ws.send_json({"type": "session.update", "session": {"voice": "Cherry"}})
            ws.send_json({"type": "input_audio_buffer.append", "audio": "AAAA"})
            ws.send_json({"type": "input_audio_buffer.commit"})
            delta = ws.receive_json()
            assert delta["type"] == "response.audio.delta"
            done = ws.receive_json()
            assert done["type"] == "response.done"
            assert done["nanomuse"]["charged"] == 100 + 8000 + 50 + 2000
            assert done["nanomuse"]["cost_cny"] == round((100 * 3.3 + 1000 * 27 + 250 * 107) / 1e6, 4)
            # …and that answer used the day's ¥0.05 up: the relay says so and closes.
            err = ws.receive_json()
            assert err["type"] == "error" and err["error"]["code"] == "daily_cap"
        assert upstream.headers.get("authorization") == "Bearer sk-upstream"
        assert upstream.path.endswith("?model=qwen3.5-omni-flash-realtime")
        assert [e["type"] for e in upstream.received] == ["session.update", "input_audio_buffer.append", "input_audio_buffer.commit"]

        me = tc.get("/v1/me", headers=auth(key)).json()
        by_kind = {row["kind"]: row for row in me["usage"]["today"]["by_kind"]}
        assert by_kind["realtime"]["requests"] == 1 and by_kind["realtime"]["prompt_tokens"] == 1100
        recent = me["recent"][0]
        assert recent["kind"] == "realtime" and recent["detail"] == {"text_in": 100, "audio_in": 1000, "image_in": 0, "text_out": 50, "audio_out": 250}
        # The hang-up is written after the socket closes; give the server a moment.
        for _ in range(50):
            events = tc.get("/v1/me/events", headers=auth(key)).json()["events"]
            if any(e["kind"] == "call.ended" for e in events):
                break
            time.sleep(0.05)
        assert any(e["kind"] == "call.ended" and e["detail"].startswith("qwen3.5-omni-flash-realtime") for e in events)
        assert any(e["kind"] == "budget.refused" for e in events)

        # Over the cap already: refused before connecting upstream.
        with tc.websocket_connect("/v1/realtime", headers=auth(key)) as ws:
            err = ws.receive_json()
            assert err["type"] == "error" and err["error"]["code"] == "daily_cap"

        # First-frame auth for browsers; a wrong key is told so.
        with tc.websocket_connect("/v1/realtime") as ws:
            ws.send_json({"type": "nanomuse.auth", "key": "nm_wrong"})
            err = ws.receive_json()
            assert err["error"]["code"] == "bad_key"
        # A chat model is not a call model.
        with tc.websocket_connect("/v1/realtime?model=qwen3.8-27b", headers=auth(key)) as ws:
            err = ws.receive_json()
            assert err["error"]["code"] == "model_not_offered"
    finally:
        upstream.stop()


async def test_admin_overview_and_account_detail():
    app, client, sender, up, cloud, settings = make()
    a = await sign_up(client, sender, "13800138000", "pixel")
    b = await sign_up(client, sender, "dev-a@example.com", "mac")
    ha, hb = auth(a["api_key"]), auth(b["api_key"])
    await client.post("/v1/chat/completions", json={"model": "qwen3.8-27b", "messages": [{"role": "user", "content": "hi"}]}, headers=ha)
    await client.post("/v1/chat/completions", json={"model": "qwen3.8-flash", "messages": [{"role": "user", "content": "hi"}]}, headers=hb)
    await client.post("/v1/images/generations", json={"model": "qwen-image-3.0-pro", "prompt": "a cat"}, headers=hb)
    await client.post("/v1/auth/password", json={"password": "correct horse 1"}, headers=hb)
    await client.post("/v1/auth/login", json={"identifier": "dev-a@example.com", "password": "wrong wrong"})
    admin = {"X-Admin-Token": "admin"}

    assert (await client.get("/v1/admin/overview")).status_code == 401
    r = await client.get("/v1/admin/overview", headers=admin)
    assert r.status_code == 200, r.text
    ov = r.json()
    assert ov["accounts"]["total"] == 2 and ov["accounts"]["with_password"] == 1 and ov["accounts"]["live_keys"] == 2
    assert ov["today"]["requests"] == 3 and ov["today"]["active_accounts"] == 2 and ov["today"]["new_accounts"] == 2
    kinds = {row["kind"]: row for row in ov["today"]["by_kind"]}
    assert kinds["chat"]["requests"] == 2 and kinds["image"]["requests"] == 1
    models = {row["model"] for row in ov["period"]["by_model"]}
    assert models == {"qwen3.8-27b", "qwen3.8-flash", "qwen-image-3.0-pro"}
    assert ov["signals_today"]["sign_ins"] == 2 and ov["signals_today"]["sign_in_failures"] == 1
    assert ov["top_accounts"][0]["hint"] == "de***@example.com" and ov["top_accounts"][0]["requests"] == 2
    # The overview never carries identifiers in clear — only the masked hints.
    assert "13800138000" not in r.text and "dev-a@example.com" not in r.text
    assert ov["events"][0]["kind"] == "sign_in.failed" and ov["events"][0]["hint"] == "de***@example.com"

    r = await client.get(f"/v1/admin/accounts/{b['account']['id']}", headers=admin)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["account"]["identifier"] == "dev-a@example.com" and d["account"]["has_password"] is True
    assert "password_hash" not in d["account"]
    assert d["spend"]["requests_total"] == 2 and d["spend"]["daily_cap_cny"] == 25
    assert {row["kind"] for row in d["usage"]["period"]["by_kind"]} == {"chat", "image"}
    assert len(d["usage"]["period"]["by_day"]) == 2
    assert d["sessions"][0]["device"] == "mac" and d["sessions"][0]["revoked_at"] is None
    assert [e["kind"] for e in d["events"]][:3] == ["sign_in.failed", "password.set", "sign_in.code"]
    assert len(d["recent"]) == 2 and {x["kind"] for x in d["recent"]} == {"chat", "image"}
    assert (await client.get("/v1/admin/accounts/nope", headers=admin)).status_code == 404

    r = await client.get("/v1/admin/events?kind=sign_in.failed,password.set", headers=admin)
    assert [e["kind"] for e in r.json()["events"]] == ["sign_in.failed", "password.set"]

    # The list view carries the new flags too.
    accounts = (await client.get("/v1/admin/accounts", headers=admin)).json()["accounts"]
    byid = {x["id"]: x for x in accounts}
    assert byid[b["account"]["id"]]["has_password"] is True and byid[a["account"]["id"]]["has_password"] is False
    assert all("password_hash" not in x for x in accounts)
