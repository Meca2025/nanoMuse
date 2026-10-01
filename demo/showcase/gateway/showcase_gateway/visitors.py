"""Who is trying the showcase: a nanoMuse Cloud sign-in before a demo Muse.

The phone in the browser is a demo — a MobileGym with a lite web app in it, a long way from
the Android app — and the project wants to know who is trying it and be able to reach them.
So a visitor signs in to nanoMuse Cloud first (a code to a phone or an inbox, or the account's
password), the same account the apps use; a first sign-in creates the account, with its free
allowance, for the day the person installs the app.

The gateway asks the relay to verify the code the way the kept Muses did (accounts.py), notes
the account — its opaque id, the masked identifier the relay gives (``195****0404``,
``g…@gmail.com``), the channel — and hands the browser a *ticket*: a random token the module
keeps and presents when it asks for a demo Muse. The device key the relay issued for the
sign-in is revoked at once; the demo Muse talks to the showcase's model, not to the
account's allowance. Tickets and visitors live in SQLite on the gateway's volume
(``VISITOR_DB``); a ticket lasts ``VISITOR_TTL_S`` (thirty days), so a returning visitor is
not asked twice.
"""

from __future__ import annotations

import hashlib
import logging
import secrets
import sqlite3
import time
from dataclasses import dataclass
from typing import Any

import httpx

from .config import Settings
from .relay import relay_request
from .sessions import Refused

log = logging.getLogger("showcase.visitors")

DEVICE_NAME = "Showcase"  # what the relay's device list calls the sign-in, briefly


@dataclass
class Visitor:
    id: str  # the relay's account id (opaque)
    hint: str  # the masked identifier the relay gives — never the identifier itself
    channel: str  # "sms" | "email"
    first_seen: float
    last_seen: float
    sessions: int = 0  # demo Muses started
    created: bool = False  # the first sign-in here created the Cloud account

    def public(self) -> dict[str, Any]:
        return {"hint": self.hint, "channel": self.channel, "created": self.created}


class VisitorStore:
    """SQLite: one row per visitor, one per ticket (hashed). ``:memory:`` in tests."""

    def __init__(self, path: str) -> None:
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.executescript(
            """CREATE TABLE IF NOT EXISTS visitors (
                 id TEXT PRIMARY KEY, hint TEXT NOT NULL DEFAULT '',
                 channel TEXT NOT NULL DEFAULT '', first_seen REAL NOT NULL,
                 last_seen REAL NOT NULL, sessions INTEGER NOT NULL DEFAULT 0,
                 created INTEGER NOT NULL DEFAULT 0);
               CREATE TABLE IF NOT EXISTS tickets (
                 hash TEXT PRIMARY KEY, visitor TEXT NOT NULL, issued_at REAL NOT NULL,
                 expires_at REAL NOT NULL);"""
        )
        self.db.commit()

    def get(self, visitor_id: str) -> Visitor | None:
        row = self.db.execute("SELECT * FROM visitors WHERE id = ?", (visitor_id,)).fetchone()
        return self._visitor(row) if row else None

    def put(self, v: Visitor) -> None:
        self.db.execute(
            """INSERT INTO visitors (id, hint, channel, first_seen, last_seen, sessions, created)
               VALUES (?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET hint=excluded.hint, channel=excluded.channel,
                 last_seen=excluded.last_seen, sessions=excluded.sessions""",
            (v.id, v.hint, v.channel, v.first_seen, v.last_seen, v.sessions, int(v.created)),
        )
        self.db.commit()

    def count(self) -> int:
        return int(self.db.execute("SELECT COUNT(*) FROM visitors").fetchone()[0])

    def count_since(self, when: float) -> int:
        row = self.db.execute("SELECT COUNT(*) FROM visitors WHERE last_seen >= ?", (when,))
        return int(row.fetchone()[0])

    def issue(self, visitor_id: str, now: float, ttl_s: int) -> str:
        token = secrets.token_urlsafe(32)
        self.db.execute(
            "INSERT INTO tickets (hash, visitor, issued_at, expires_at) VALUES (?, ?, ?, ?)",
            (_hash(token), visitor_id, now, now + ttl_s),
        )
        self.db.execute("DELETE FROM tickets WHERE expires_at < ?", (now,))
        self.db.commit()
        return token

    def redeem(self, token: str, now: float) -> Visitor | None:
        row = self.db.execute(
            "SELECT visitor FROM tickets WHERE hash = ? AND expires_at > ?", (_hash(token), now)
        ).fetchone()
        return self.get(row["visitor"]) if row else None

    def revoke(self, token: str) -> None:
        self.db.execute("DELETE FROM tickets WHERE hash = ?", (_hash(token),))
        self.db.commit()

    @staticmethod
    def _visitor(row: sqlite3.Row) -> Visitor:
        return Visitor(
            id=row["id"],
            hint=row["hint"],
            channel=row["channel"],
            first_seen=row["first_seen"],
            last_seen=row["last_seen"],
            sessions=int(row["sessions"]),
            created=bool(row["created"]),
        )


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class VisitorBook:
    """The sign-in and the tickets."""

    def __init__(
        self,
        settings: Settings,
        store: VisitorStore,
        http: httpx.AsyncClient | None = None,
        clock=time.time,
    ) -> None:
        self.s = settings
        self.store = store
        self.http = http or httpx.AsyncClient(timeout=15)
        self.clock = clock

    @property
    def required(self) -> bool:
        return self.s.demo_signin_required

    async def _relay(self, method: str, path: str, body: dict | None, ip: str, key: str = ""):
        return await relay_request(self.http, self.s.web_relay_url, method, path, body, ip, key)

    async def request_code(self, identifier: str, ip: str) -> None:
        await self._relay("POST", "/v1/auth/code", {"identifier": identifier}, ip)

    async def verify(
        self, identifier: str, code: str, ip: str, invite: str = ""
    ) -> tuple[str, Visitor]:
        """The code the relay sent → a ticket for this browser. ``invite`` is a friend's
        code, passed along only when given."""
        payload: dict[str, str] = {"identifier": identifier, "code": code, "device": DEVICE_NAME}
        if invite:
            payload["invite"] = invite
        data = await self._relay("POST", "/v1/auth/verify", payload, ip)
        return await self._admit(data, ip)

    async def login(self, identifier: str, password: str, ip: str) -> tuple[str, Visitor]:
        """The password way in, for accounts that set one; the relay's answer is passed on."""
        payload = {"identifier": identifier, "password": password, "device": DEVICE_NAME}
        data = await self._relay("POST", "/v1/auth/login", payload, ip)
        return await self._admit(data, ip)

    async def _admit(self, data: dict[str, Any], ip: str) -> tuple[str, Visitor]:
        info = data.get("account") if isinstance(data.get("account"), dict) else {}
        visitor_id = str(info.get("id") or "")
        if not visitor_id:
            raw = f"{info.get('channel')}|{info.get('hint')}|{info.get('created_at')}"
            visitor_id = hashlib.sha256(raw.encode()).hexdigest()[:24]
        now = self.clock()
        visitor = self.store.get(visitor_id)
        if visitor is None:
            visitor = Visitor(
                id=visitor_id,
                hint=str(info.get("hint") or ""),
                channel=str(info.get("channel") or ""),
                first_seen=now,
                last_seen=now,
                created=bool(data.get("created")),
            )
            log.info("visitor %s signed in for the first time (%s)", visitor.hint, visitor.channel)
        else:
            visitor.hint = str(info.get("hint") or visitor.hint)
            visitor.channel = str(info.get("channel") or visitor.channel)
            visitor.last_seen = now
            log.info("visitor %s is back", visitor.hint)
        self.store.put(visitor)
        # the key the relay issued for this sign-in is not needed: the demo Muse talks to the
        # showcase's model. Revoke it so the account's device list does not fill up with
        # "Showcase" entries (best effort — an old relay without the route changes nothing).
        key = str(data.get("api_key") or "")
        if key:
            try:
                await self._relay("POST", "/v1/auth/sign-out", None, ip, key)
            except Refused as exc:
                log.info("could not revoke the sign-in key (%s); it idles", exc.code)
        return self.store.issue(visitor.id, now, self.s.visitor_ttl_s), visitor

    def check(self, ticket: str | None) -> Visitor:
        """The visitor behind a ticket, or a refusal the page turns into the sign-in."""
        if not ticket:
            raise Refused(401, "signin_required", "Sign in to nanoMuse Cloud to start a demo.")
        visitor = self.store.redeem(ticket, self.clock())
        if visitor is None:
            raise Refused(401, "signin_expired", "Your sign-in has lapsed; sign in again.")
        return visitor

    def sign_out(self, ticket: str | None) -> None:
        if ticket:
            self.store.revoke(ticket)

    def started(self, visitor: Visitor) -> None:
        visitor.sessions += 1
        visitor.last_seen = self.clock()
        self.store.put(visitor)

    def stats(self) -> dict[str, Any]:
        now = self.clock()
        return {
            "signin_required": self.required,
            "visitors": self.store.count(),
            "visitors_7d": self.store.count_since(now - 7 * 86400),
        }
