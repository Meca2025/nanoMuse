"""SQLite storage: accounts, keys, codes, the token ledger.

One file, WAL mode, one connection guarded by a lock — the relay is I/O bound
on the upstream, not on SQLite. Identifiers (phone / e-mail) are stored as
their HMAC (the lookup key), a masked hint for the account page, and — so the
operator can tell who is who — encrypted with a key derived from the
deployment secret (`identifier_enc`, see crypto.py); a copied database file
shows none of them.
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
    disabled      INTEGER NOT NULL DEFAULT 0,
    identifier_enc TEXT NOT NULL DEFAULT '',  -- AES-GCM of the phone / address, base64
    unlimited     INTEGER NOT NULL DEFAULT 0   -- a member: no daily money cap (set by the operator)
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
    kind          TEXT NOT NULL,          -- grant | chat | image | video | adjust
    model         TEXT NOT NULL DEFAULT '',
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    charged       INTEGER NOT NULL,       -- positive = spent, negative = granted
    request_id    TEXT NOT NULL DEFAULT '',
    cost_uy       INTEGER NOT NULL DEFAULT 0  -- what the provider bills for it, in micro-yuan
);
CREATE INDEX IF NOT EXISTS ledger_account_ts ON ledger(account_id, ts);
CREATE TABLE IF NOT EXISTS devices (
    account_id    TEXT NOT NULL REFERENCES accounts(id),
    id            TEXT NOT NULL,           -- chosen by the device, stable across restarts
    name          TEXT NOT NULL,
    kind          TEXT NOT NULL,           -- phone | computer
    os            TEXT NOT NULL DEFAULT '',
    version       TEXT NOT NULL DEFAULT '',
    actions       TEXT NOT NULL DEFAULT '[]',
    first_seen    INTEGER NOT NULL,
    last_seen     INTEGER NOT NULL,
    PRIMARY KEY (account_id, id)
);
CREATE TABLE IF NOT EXISTS video_tasks (
    task_id       TEXT PRIMARY KEY,        -- the provider's id; polled by its owner only
    account_id    TEXT NOT NULL REFERENCES accounts(id),
    model         TEXT NOT NULL DEFAULT '',
    created_at    INTEGER NOT NULL,
    charged       INTEGER NOT NULL DEFAULT 0,  -- set when the task was first seen SUCCEEDED
    cost_uy       INTEGER NOT NULL DEFAULT 0   -- priced at submission from the seconds asked for
);
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
            self._migrate()

    def _migrate(self) -> None:
        """Columns added after the first release; CREATE TABLE IF NOT EXISTS leaves old files alone."""
        def cols(table: str) -> set[str]:
            return {r["name"] for r in self._conn.execute(f"PRAGMA table_info({table})").fetchall()}

        if "identifier_enc" not in cols("accounts"):
            self._conn.execute("ALTER TABLE accounts ADD COLUMN identifier_enc TEXT NOT NULL DEFAULT ''")
        if "unlimited" not in cols("accounts"):
            self._conn.execute("ALTER TABLE accounts ADD COLUMN unlimited INTEGER NOT NULL DEFAULT 0")
        if "charged" not in cols("video_tasks"):
            self._conn.execute("ALTER TABLE video_tasks ADD COLUMN charged INTEGER NOT NULL DEFAULT 0")
        if "cost_uy" not in cols("video_tasks"):
            self._conn.execute("ALTER TABLE video_tasks ADD COLUMN cost_uy INTEGER NOT NULL DEFAULT 0")
        if "cost_uy" not in cols("ledger"):
            self._conn.execute("ALTER TABLE ledger ADD COLUMN cost_uy INTEGER NOT NULL DEFAULT 0")

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

    @staticmethod
    def new_account_id() -> str:
        return str(uuid.uuid4())

    def create_account(
        self, id_hash: str, channel: str, hint: str, grant: int, identifier_enc: str = "", account_id: str | None = None
    ) -> sqlite3.Row:
        account_id = account_id or self.new_account_id()
        t = now()
        with self.tx() as c:
            c.execute(
                "INSERT INTO accounts(id, id_hash, channel, hint, created_at, granted, identifier_enc) VALUES (?,?,?,?,?,?,?)",
                (account_id, id_hash, channel, hint, t, grant, identifier_enc),
            )
            if grant:
                c.execute(
                    "INSERT INTO ledger(account_id, ts, kind, charged) VALUES (?,?,?,?)",
                    (account_id, t, "grant", -grant),
                )
        return self.account(account_id)  # type: ignore[return-value]

    def delete_account(self, account_id: str) -> None:
        """Everything about one person: keys, ledger, devices, pending codes, the row itself."""
        with self.tx() as c:
            row = c.execute("SELECT id_hash FROM accounts WHERE id=?", (account_id,)).fetchone()
            if row is None:
                return
            c.execute("DELETE FROM codes WHERE id_hash=?", (row["id_hash"],))
            c.execute("DELETE FROM video_tasks WHERE account_id=?", (account_id,))
            c.execute("DELETE FROM devices WHERE account_id=?", (account_id,))
            c.execute("DELETE FROM ledger WHERE account_id=?", (account_id,))
            c.execute("DELETE FROM api_keys WHERE account_id=?", (account_id,))
            c.execute("DELETE FROM accounts WHERE id=?", (account_id,))

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

    def set_unlimited(self, account_id: str, unlimited: bool) -> None:
        with self.tx() as c:
            c.execute("UPDATE accounts SET unlimited=? WHERE id=?", (1 if unlimited else 0, account_id))

    def list_accounts(self, limit: int = 200) -> list[sqlite3.Row]:
        with self._lock:
            return self._conn.execute(
                "SELECT * FROM accounts ORDER BY created_at DESC LIMIT ?", (limit,)
            ).fetchall()

    def admin_accounts(self, day_start: int, limit: int = 500) -> list[sqlite3.Row]:
        """The operator's view: each account with today's spend (tokens and
        money), when it was last seen, how many keys (sign-ins) are live and
        how many devices it remembers."""
        with self._lock:
            return self._conn.execute(
                """SELECT a.*,
                          (SELECT COALESCE(SUM(l.charged),0) FROM ledger l
                             WHERE l.account_id=a.id AND l.ts>=? AND l.charged>0) AS used_today,
                          (SELECT COALESCE(SUM(l.cost_uy),0) FROM ledger l
                             WHERE l.account_id=a.id AND l.ts>=? AND l.cost_uy>0) AS spent_today_uy,
                          (SELECT COALESCE(SUM(l.cost_uy),0) FROM ledger l
                             WHERE l.account_id=a.id AND l.cost_uy>0) AS spent_uy,
                          (SELECT COUNT(*) FROM ledger l
                             WHERE l.account_id=a.id AND l.kind IN ('chat','image','video')) AS requests,
                          (SELECT MAX(k.last_used_at) FROM api_keys k WHERE k.account_id=a.id) AS last_active_at,
                          (SELECT COUNT(*) FROM api_keys k WHERE k.account_id=a.id AND k.revoked_at IS NULL) AS live_keys,
                          (SELECT COUNT(*) FROM devices d WHERE d.account_id=a.id) AS device_count
                   FROM accounts a ORDER BY a.created_at DESC LIMIT ?""",
                (day_start, day_start, limit),
            ).fetchall()

    def usage_by_day(self, since: int, day_offset_s: int = 0) -> list[sqlite3.Row]:
        """Charged tokens and money per local day and kind, for the admin page's
        totals. `day` is the UNIX time the local day starts."""
        with self._lock:
            return self._conn.execute(
                """SELECT ((ts + ?) - (ts + ?) % 86400 - ?) AS day, kind, COUNT(*) AS requests,
                          SUM(charged) AS charged, SUM(cost_uy) AS cost_uy
                   FROM ledger WHERE ts>=? AND charged>0 GROUP BY day, kind ORDER BY day DESC""",
                (day_offset_s, day_offset_s, day_offset_s, since),
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
                "SELECT k.*, a.disabled AS account_disabled, a.granted, a.used, a.channel, a.hint, a.created_at AS account_created_at, "
                "a.id_hash, a.unlimited AS account_unlimited "
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

    def charge(
        self, account_id: str, kind: str, model: str, prompt_tokens: int, completion_tokens: int,
        charged: int, request_id: str, cost_uy: int = 0,
    ) -> None:
        charged = max(0, int(charged))
        cost_uy = max(0, int(cost_uy))
        with self.tx() as c:
            c.execute("UPDATE accounts SET used=used+? WHERE id=?", (charged, account_id))
            c.execute(
                "INSERT INTO ledger(account_id, ts, kind, model, prompt_tokens, completion_tokens, charged, request_id, cost_uy) "
                "VALUES (?,?,?,?,?,?,?,?,?)",
                (account_id, now(), kind, model, prompt_tokens, completion_tokens, charged, request_id, cost_uy),
            )

    def used_since(self, account_id: str, since: int) -> int:
        with self._lock:
            r = self._conn.execute(
                "SELECT COALESCE(SUM(charged),0) FROM ledger WHERE account_id=? AND ts>=? AND charged>0",
                (account_id, since),
            ).fetchone()
        return int(r[0])

    def spent_since(self, account_id: str, since: int) -> int:
        """Money (micro-yuan) the account cost the operator since `since`."""
        with self._lock:
            r = self._conn.execute(
                "SELECT COALESCE(SUM(cost_uy),0) FROM ledger WHERE account_id=? AND ts>=? AND cost_uy>0",
                (account_id, since),
            ).fetchone()
        return int(r[0])

    def requests_since(self, account_id: str, since: int) -> int:
        with self._lock:
            r = self._conn.execute(
                "SELECT COUNT(*) FROM ledger WHERE account_id=? AND ts>=? AND kind IN ('chat','image','video')",
                (account_id, since),
            ).fetchone()
        return int(r[0])

    def recent_ledger(self, account_id: str, limit: int = 30) -> list[sqlite3.Row]:
        with self._lock:
            return self._conn.execute(
                "SELECT ts, kind, model, prompt_tokens, completion_tokens, charged, cost_uy FROM ledger WHERE account_id=? ORDER BY id DESC LIMIT ?",
                (account_id, limit),
            ).fetchall()

    # -- devices (the hub) ---------------------------------------------------------

    def upsert_device(self, account_id: str, device_id: str, name: str, kind: str, os: str, version: str, actions: str) -> None:
        t = now()
        with self.tx() as c:
            c.execute(
                """INSERT INTO devices(account_id, id, name, kind, os, version, actions, first_seen, last_seen)
                   VALUES(?,?,?,?,?,?,?,?,?)
                   ON CONFLICT(account_id, id) DO UPDATE SET
                     name=excluded.name, kind=excluded.kind, os=excluded.os, version=excluded.version,
                     actions=excluded.actions, last_seen=excluded.last_seen""",
                (account_id, device_id, name, kind, os, version, actions, t, t),
            )

    def touch_device(self, account_id: str, device_id: str) -> None:
        with self.tx() as c:
            c.execute("UPDATE devices SET last_seen=? WHERE account_id=? AND id=?", (now(), account_id, device_id))

    def devices_for(self, account_id: str) -> list[sqlite3.Row]:
        with self._lock:
            return self._conn.execute(
                "SELECT id, name, kind, os, version, actions, first_seen, last_seen FROM devices WHERE account_id=? ORDER BY last_seen DESC",
                (account_id,),
            ).fetchall()

    def forget_device(self, account_id: str, device_id: str) -> None:
        with self.tx() as c:
            c.execute("DELETE FROM devices WHERE account_id=? AND id=?", (account_id, device_id))

    # -- video tasks (the provider's async API, relayed) --------------------------

    def insert_video_task(self, task_id: str, account_id: str, model: str, cost_uy: int = 0) -> None:
        t = now()
        with self.tx() as c:
            c.execute(
                "INSERT OR REPLACE INTO video_tasks(task_id, account_id, model, created_at, cost_uy) VALUES (?,?,?,?,?)",
                (task_id, account_id, model, t, max(0, int(cost_uy))),
            )
            c.execute("DELETE FROM video_tasks WHERE created_at < ?", (t - 3 * 86400,))

    def video_task(self, task_id: str) -> sqlite3.Row | None:
        with self._lock:
            return self._conn.execute("SELECT * FROM video_tasks WHERE task_id=?", (task_id,)).fetchone()

    def mark_video_charged(self, task_id: str) -> bool:
        """True the first time only, so a clip is charged once however often it is polled."""
        with self.tx() as c:
            cur = c.execute("UPDATE video_tasks SET charged=1 WHERE task_id=? AND charged=0", (task_id,))
            return cur.rowcount == 1
