"""SQLite storage: accounts, keys, codes, the token ledger.

One file, WAL mode, one connection guarded by a lock — the relay is I/O bound
on the upstream, not on SQLite. Identifiers (phone / e-mail) are never stored;
only their HMAC and a masked hint for the account page.
"""

from __future__ import annotations

import sqlite3
import threading
import time
import uuid
from contextlib import contextmanager
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS accounts (
    id            TEXT PRIMARY KEY,
    id_hash       TEXT NOT NULL UNIQUE,
    channel       TEXT NOT NULL,          -- phone | email
    hint          TEXT NOT NULL,          -- 138****1234 / a***@example.com
    created_at    INTEGER NOT NULL,
    granted       INTEGER NOT NULL DEFAULT 0,
    used          INTEGER NOT NULL DEFAULT 0,
    disabled      INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS api_keys (
    key_hash      TEXT PRIMARY KEY,
    prefix        TEXT NOT NULL,
    account_id    TEXT NOT NULL REFERENCES accounts(id),
    device        TEXT NOT NULL DEFAULT '',
    created_at    INTEGER NOT NULL,
    last_used_at  INTEGER,
    revoked_at    INTEGER
);
CREATE INDEX IF NOT EXISTS api_keys_account ON api_keys(account_id);
CREATE TABLE IF NOT EXISTS codes (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    id_hash       TEXT NOT NULL,
    code_hash     TEXT NOT NULL,
    ip            TEXT NOT NULL DEFAULT '',
    created_at    INTEGER NOT NULL,
    expires_at    INTEGER NOT NULL,
    attempts      INTEGER NOT NULL DEFAULT 0,
    used          INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS codes_id_hash ON codes(id_hash, created_at);
CREATE INDEX IF NOT EXISTS codes_ip ON codes(ip, created_at);
CREATE TABLE IF NOT EXISTS ledger (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id    TEXT NOT NULL REFERENCES accounts(id),
    ts            INTEGER NOT NULL,
    kind          TEXT NOT NULL,          -- grant | chat | image | adjust
    model         TEXT NOT NULL DEFAULT '',
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    charged       INTEGER NOT NULL,       -- positive = spent, negative = granted
    request_id    TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ledger_account_ts ON ledger(account_id, ts);
"""


def now() -> int:
    return int(time.time())


class Database:
    def __init__(self, path: str):
        if path != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self._conn.row_factory = sqlite3.Row
        self._lock = threading.RLock()
        with self._lock:
            # executescript commits on its own; keep it outside tx().
            self._conn.execute("PRAGMA journal_mode=WAL")
            self._conn.execute("PRAGMA foreign_keys=ON")
            self._conn.executescript(SCHEMA)

    @contextmanager
    def tx(self):
        with self._lock:
            self._conn.execute("BEGIN")
            try:
                yield self._conn
            except Exception:
                self._conn.execute("ROLLBACK")
                raise
            else:
                self._conn.execute("COMMIT")

    def close(self) -> None:
        self._conn.close()

    # -- codes -------------------------------------------------------------

    def codes_recent_for(self, id_hash: str, since: int) -> int:
        with self._lock:
            r = self._conn.execute(
                "SELECT COUNT(*) FROM codes WHERE id_hash=? AND created_at>=?", (id_hash, since)
            ).fetchone()
        return int(r[0])

    def codes_recent_for_ip(self, ip: str, since: int) -> int:
        with self._lock:
            r = self._conn.execute(
                "SELECT COUNT(*) FROM codes WHERE ip=? AND created_at>=?", (ip, since)
            ).fetchone()
        return int(r[0])

    def insert_code(self, id_hash: str, code_hash: str, ip: str, ttl_s: int) -> None:
        t = now()
        with self.tx() as c:
            # A new code supersedes the old ones for this identifier.
            c.execute("UPDATE codes SET used=1 WHERE id_hash=? AND used=0", (id_hash,))
            c.execute(
                "INSERT INTO codes(id_hash, code_hash, ip, created_at, expires_at) VALUES (?,?,?,?,?)",
                (id_hash, code_hash, ip, t, t + ttl_s),
            )
            c.execute("DELETE FROM codes WHERE expires_at < ?", (t - 86400,))

    def live_code(self, id_hash: str) -> sqlite3.Row | None:
        with self._lock:
            return self._conn.execute(
                "SELECT * FROM codes WHERE id_hash=? AND used=0 AND expires_at>=? ORDER BY id DESC LIMIT 1",
                (id_hash, now()),
            ).fetchone()

    def bump_attempts(self, code_id: int) -> int:
        with self.tx() as c:
            c.execute("UPDATE codes SET attempts=attempts+1 WHERE id=?", (code_id,))
            r = c.execute("SELECT attempts FROM codes WHERE id=?", (code_id,)).fetchone()
        return int(r[0])

    def consume_code(self, code_id: int) -> None:
        with self.tx() as c:
            c.execute("UPDATE codes SET used=1 WHERE id=?", (code_id,))

    # -- accounts ------------------------------------------------------------

    def account_by_hash(self, id_hash: str) -> sqlite3.Row | None:
        with self._lock:
            return self._conn.execute("SELECT * FROM accounts WHERE id_hash=?", (id_hash,)).fetchone()

    def account(self, account_id: str) -> sqlite3.Row | None:
        with self._lock:
            return self._conn.execute("SELECT * FROM accounts WHERE id=?", (account_id,)).fetchone()

    def create_account(self, id_hash: str, channel: str, hint: str, grant: int) -> sqlite3.Row:
        account_id = str(uuid.uuid4())
        t = now()
        with self.tx() as c:
            c.execute(
                "INSERT INTO accounts(id, id_hash, channel, hint, created_at, granted) VALUES (?,?,?,?,?,?)",
                (account_id, id_hash, channel, hint, t, grant),
            )
            if grant:
                c.execute(
                    "INSERT INTO ledger(account_id, ts, kind, charged) VALUES (?,?,?,?)",
                    (account_id, t, "grant", -grant),
                )
        return self.account(account_id)  # type: ignore[return-value]

    def grant(self, account_id: str, tokens: int, kind: str = "grant") -> None:
        with self.tx() as c:
            c.execute("UPDATE accounts SET granted=granted+? WHERE id=?", (tokens, account_id))
            c.execute(
                "INSERT INTO ledger(account_id, ts, kind, charged) VALUES (?,?,?,?)",
                (account_id, now(), kind, -tokens),
            )

    def set_disabled(self, account_id: str, disabled: bool) -> None:
        with self.tx() as c:
            c.execute("UPDATE accounts SET disabled=? WHERE id=?", (1 if disabled else 0, account_id))

    def list_accounts(self, limit: int = 200) -> list[sqlite3.Row]:
        with self._lock:
            return self._conn.execute(
                "SELECT * FROM accounts ORDER BY created_at DESC LIMIT ?", (limit,)
            ).fetchall()

    # -- keys ----------------------------------------------------------------

    def insert_key(self, key_hash: str, prefix: str, account_id: str, device: str) -> None:
        with self.tx() as c:
            c.execute(
                "INSERT INTO api_keys(key_hash, prefix, account_id, device, created_at) VALUES (?,?,?,?,?)",
                (key_hash, prefix, account_id, device[:80], now()),
            )

    def key(self, key_hash: str) -> sqlite3.Row | None:
        with self._lock:
            return self._conn.execute(
                "SELECT k.*, a.disabled AS account_disabled, a.granted, a.used, a.channel, a.hint, a.created_at AS account_created_at "
                "FROM api_keys k JOIN accounts a ON a.id=k.account_id WHERE k.key_hash=?",
                (key_hash,),
            ).fetchone()

    def touch_key(self, key_hash: str) -> None:
        with self.tx() as c:
            c.execute("UPDATE api_keys SET last_used_at=? WHERE key_hash=?", (now(), key_hash))

    def revoke_key(self, key_hash: str) -> None:
        with self.tx() as c:
            c.execute("UPDATE api_keys SET revoked_at=? WHERE key_hash=? AND revoked_at IS NULL", (now(), key_hash))

    def keys_for(self, account_id: str) -> list[sqlite3.Row]:
        with self._lock:
            return self._conn.execute(
                "SELECT * FROM api_keys WHERE account_id=? ORDER BY created_at", (account_id,)
            ).fetchall()

    # -- usage -----------------------------------------------------------------

    def charge(self, account_id: str, kind: str, model: str, prompt_tokens: int, completion_tokens: int, charged: int, request_id: str) -> None:
        charged = max(0, int(charged))
        with self.tx() as c:
            c.execute("UPDATE accounts SET used=used+? WHERE id=?", (charged, account_id))
            c.execute(
                "INSERT INTO ledger(account_id, ts, kind, model, prompt_tokens, completion_tokens, charged, request_id) VALUES (?,?,?,?,?,?,?,?)",
                (account_id, now(), kind, model, prompt_tokens, completion_tokens, charged, request_id),
            )

    def used_since(self, account_id: str, since: int) -> int:
        with self._lock:
            r = self._conn.execute(
                "SELECT COALESCE(SUM(charged),0) FROM ledger WHERE account_id=? AND ts>=? AND charged>0",
                (account_id, since),
            ).fetchone()
        return int(r[0])

    def requests_since(self, account_id: str, since: int) -> int:
        with self._lock:
            r = self._conn.execute(
                "SELECT COUNT(*) FROM ledger WHERE account_id=? AND ts>=? AND kind IN ('chat','image')",
                (account_id, since),
            ).fetchone()
        return int(r[0])

    def recent_ledger(self, account_id: str, limit: int = 30) -> list[sqlite3.Row]:
        with self._lock:
            return self._conn.execute(
                "SELECT ts, kind, model, prompt_tokens, completion_tokens, charged FROM ledger WHERE account_id=? ORDER BY id DESC LIMIT ?",
                (account_id, limit),
            ).fetchall()
