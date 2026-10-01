"""The visitors' sign-in: a nanoMuse Cloud account before a demo Muse."""

from __future__ import annotations

import httpx
import pytest

from showcase_gateway.app import create_app
from showcase_gateway.sessions import SessionManager
from showcase_gateway.visitors import VisitorBook, VisitorStore

from .conftest import Clock, FakeRunner, Upstream, make_settings


@pytest.fixture
def showcase():
    settings = make_settings(demo_signin_required=True)
    runner = FakeRunner()
    upstream = Upstream()
    clock = Clock()
    client = httpx.AsyncClient(transport=httpx.MockTransport(upstream.handler))
    manager = SessionManager(settings, runner, http=client, clock=clock)
    book = VisitorBook(settings, VisitorStore(":memory:"), http=client, clock=clock)
    app = create_app(settings, manager, client=client, visitors=book)
    return settings, runner, upstream, clock, book, app


async def client_for(app):
    transport = httpx.ASGITransport(app=app)
    return httpx.AsyncClient(transport=transport, base_url="http://localhost:8000")


async def sign_in(c, ident: str, ip: str = "1.2.3.4") -> httpx.Response:
    r = await c.post(
        "/api/demo/signin/code", json={"identifier": ident}, headers={"x-forwarded-for": ip}
    )
    assert r.status_code == 204, r.text
    return await c.post(
        "/api/demo/signin/verify",
        json={"identifier": ident, "code": "246810"},
        headers={"x-forwarded-for": ip},
    )


async def test_a_demo_needs_a_sign_in(showcase):
    settings, runner, upstream, clock, book, app = showcase
    async with await client_for(app) as c:
        info = (await c.get("/api/demo/info")).json()
        assert info["signin_required"] is True
        assert info["signin"] == {"signin_required": True, "visitors": 0, "visitors_7d": 0}

        # no ticket: the page is told to sign in, nothing is started
        r = await c.post("/api/demo/session", json={}, headers={"x-forwarded-for": "1.2.3.4"})
        assert r.status_code == 401
        assert r.json()["error"] == "signin_required"
        assert runner.running == {}

        # a wrong code is the relay's own refusal, passed on
        await c.post("/api/demo/signin/code", json={"identifier": "someone@example.com"})
        r = await c.post(
            "/api/demo/signin/verify", json={"identifier": "someone@example.com", "code": "000000"}
        )
        assert r.status_code == 400
        assert r.json()["error"] == "code_wrong"

        r = await sign_in(c, "someone@example.com")
        assert r.status_code == 200, r.text
        data = r.json()
        ticket = data["ticket"]
        assert data["visitor"] == {"hint": "so…", "channel": "email", "created": True}
        # the key the relay issued for the sign-in is revoked at once
        assert upstream.revoked == ["nm_key1"]
        # the relay saw the visitor's address, not the gateway's
        verify = [q for q in upstream.calls if q.url.path == "/v1/auth/verify"][-1]
        assert verify.headers["x-forwarded-for"] == "1.2.3.4"

        # the ticket opens the demo, and the session carries the account (never the identifier)
        auth = {"authorization": f"Bearer {ticket}", "x-forwarded-for": "1.2.3.4"}
        r = await c.post("/api/demo/session", json={}, headers=auth)
        assert r.status_code == 201, r.text
        sid = r.json()["id"]
        assert list(runner.running) == [f"nm-{sid}"]
        me = (await c.get("/api/demo/me", headers=auth)).json()
        assert me["visitor"]["hint"] == "so…"
        assert book.store.get("acct-someone-at-example.com").sessions == 1
        info = (await c.get("/api/demo/info")).json()
        assert info["signin"]["visitors"] == 1


async def test_one_account_is_one_person(showcase):
    settings, runner, upstream, clock, book, app = showcase
    async with await client_for(app) as c:
        # the same account from two browsers in two places
        t1 = (await sign_in(c, "someone@example.com", ip="1.1.1.1")).json()["ticket"]
        t2 = (await sign_in(c, "someone@example.com", ip="2.2.2.2")).json()["ticket"]
        assert book.store.count() == 1  # one visitor, seen twice
        r = await c.post(
            "/api/demo/session",
            json={},
            headers={"authorization": f"Bearer {t1}", "x-forwarded-for": "1.1.1.1"},
        )
        assert r.status_code == 201
        first = r.json()
        r = await c.post(
            "/api/demo/session",
            json={},
            headers={"authorization": f"Bearer {t2}", "x-forwarded-for": "2.2.2.2"},
        )
        assert r.status_code == 429
        assert r.json()["error"] == "already_running"

        # ending the first makes room; the day's allowance (two here) then runs out
        r = await c.delete(
            f"/api/demo/session/{first['id']}",
            headers={"authorization": f"Bearer {first['token']}"},
        )
        assert r.status_code == 204
        r = await c.post(
            "/api/demo/session",
            json={},
            headers={"authorization": f"Bearer {t2}", "x-forwarded-for": "2.2.2.2"},
        )
        assert r.status_code == 201
        second = r.json()
        await c.delete(
            f"/api/demo/session/{second['id']}",
            headers={"authorization": f"Bearer {second['token']}"},
        )
        r = await c.post(
            "/api/demo/session",
            json={},
            headers={"authorization": f"Bearer {t2}", "x-forwarded-for": "3.3.3.3"},
        )
        assert r.status_code == 429
        assert r.json()["error"] == "daily_limit"


async def test_tickets_lapse_and_can_be_handed_back(showcase):
    settings, runner, upstream, clock, book, app = showcase
    async with await client_for(app) as c:
        ticket = (await sign_in(c, "someone@example.com")).json()["ticket"]
        auth = {"authorization": f"Bearer {ticket}"}
        assert (await c.get("/api/demo/me", headers=auth)).status_code == 200
        clock.now += settings.visitor_ttl_s + 1
        r = await c.get("/api/demo/me", headers=auth)
        assert r.status_code == 401
        assert r.json()["error"] == "signin_expired"

        ticket = (await sign_in(c, "someone@example.com")).json()["ticket"]
        auth = {"authorization": f"Bearer {ticket}"}
        assert (await c.post("/api/demo/signout", headers=auth)).status_code == 204
        assert (await c.get("/api/demo/me", headers=auth)).status_code == 401
        # a made-up ticket is no ticket
        r = await c.get("/api/demo/me", headers={"authorization": "Bearer nonsense"})
        assert r.status_code == 401


async def test_the_password_way_in(showcase):
    settings, runner, upstream, clock, book, app = showcase
    async with await client_for(app) as c:
        r = await c.post(
            "/api/demo/signin/login",
            json={"identifier": "someone@example.com", "password": "wrong"},
        )
        assert r.status_code == 400
        assert r.json()["error"] == "password_wrong"
        r = await c.post(
            "/api/demo/signin/login",
            json={"identifier": "someone@example.com", "password": "correct horse"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["visitor"]["channel"] == "email"
        assert upstream.revoked  # the login's key, revoked like the code's


async def test_switched_off_means_the_old_way(showcase):
    # DEMO_SIGNIN_REQUIRED=0: a visitor is a visitor, as before
    settings = make_settings(demo_signin_required=False)
    runner = FakeRunner()
    upstream = Upstream()
    clock = Clock()
    client = httpx.AsyncClient(transport=httpx.MockTransport(upstream.handler))
    manager = SessionManager(settings, runner, http=client, clock=clock)
    app = create_app(settings, manager, client=client)
    async with await client_for(app) as c:
        info = (await c.get("/api/demo/info")).json()
        assert info["signin_required"] is False
        r = await c.post("/api/demo/session", json={}, headers={"x-forwarded-for": "1.2.3.4"})
        assert r.status_code == 201
