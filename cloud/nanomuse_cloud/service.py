"""The relay's rules: codes, keys, grants, budgets, and what a request costs.

Kept apart from the HTTP layer so the tests can drive it directly and so the
API module stays a thin translation of these calls into status codes.
"""

from __future__ import annotations

import hashlib
import json
import logging
import math
import secrets
from dataclasses import dataclass

from .config import ModelSpec, Settings
from .db import Database, now
from .identifiers import BadIdentifier, Identifier, parse
from .senders import CodeSender, SendError, make_sender

log = logging.getLogger("nanomuse_cloud")

KEY_PREFIX = "nm_"


class CloudError(Exception):
    """An error the app should show. `status` is the HTTP status, `code` a stable
    machine-readable name the app can switch on (it has strings for each)."""

    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


@dataclass(frozen=True)
class Caller:
    key_hash: str
    account_id: str
    channel: str
    hint: str
    granted: int
    used: int
    account_created_at: int

    @property
    def remaining(self) -> int:
        return max(0, self.granted - self.used)


def _sha256(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()


class Cloud:
    def __init__(self, settings: Settings, db: Database | None = None, sender: CodeSender | None = None):
        self.s = settings
        self.db = db or Database(settings.database)
        self.sender = sender or make_sender(settings)
        if settings.dev_mode:
            log.warning("CLOUD_SECRET is not set: development mode, identifiers hashed with a fixed key")

    # -- sign-up -------------------------------------------------------------------

    def request_code(self, ident: Identifier, ip: str) -> None:
        t = now()
        if self.db.codes_recent_for(ident.hash(self.s.hmac_key), t - 600) >= self.s.code_per_identifier_10m:
            raise CloudError(429, "code_too_often", "Too many codes for this number; wait a few minutes")
        if ip and self.db.codes_recent_for_ip(ip, t - 3600) >= self.s.code_per_ip_hour:
            raise CloudError(429, "code_too_often", "Too many codes from this network; wait an hour")
        code = f"{secrets.randbelow(1_000_000):06d}"
        self.db.insert_code(ident.hash(self.s.hmac_key), _sha256(code), ip, self.s.code_ttl_s)
        try:
            self.sender.send(ident, code)
        except SendError as e:
            raise CloudError(502, "send_failed", f"Could not send the code ({e})") from e

    def verify_code(self, ident: Identifier, code: str, device: str) -> tuple[str, Caller, bool]:
        """Returns (api_key, caller, created). The key is shown once."""
        id_hash = ident.hash(self.s.hmac_key)
        row = self.db.live_code(id_hash)
        if row is None:
            raise CloudError(400, "code_expired", "The code has expired; ask for a new one")
        attempts = self.db.bump_attempts(int(row["id"]))
        if attempts > self.s.code_max_attempts:
            self.db.consume_code(int(row["id"]))
            raise CloudError(400, "code_expired", "Too many tries; ask for a new code")
        if not secrets.compare_digest(row["code_hash"], _sha256(code.strip())):
            raise CloudError(400, "code_wrong", "That code is not right")
        self.db.consume_code(int(row["id"]))

        account = self.db.account_by_hash(id_hash)
        created = account is None
        if account is None:
            account = self.db.create_account(id_hash, ident.channel, ident.hint, self.s.signup_tokens)
        elif account["disabled"]:
            raise CloudError(403, "account_disabled", "This account is disabled")

        key = KEY_PREFIX + secrets.token_urlsafe(30)
        self.db.insert_key(_sha256(key), key[:10], account["id"], device)
        caller = self._caller(_sha256(key))
        assert caller is not None
        return key, caller, created

    # -- keys -------------------------------------------------------------------------

    def _caller(self, key_hash: str) -> Caller | None:
        row = self.db.key(key_hash)
        if row is None or row["revoked_at"] is not None:
            return None
        return Caller(
            key_hash=key_hash,
            account_id=row["account_id"],
            channel=row["channel"],
            hint=row["hint"],
            granted=int(row["granted"]),
            used=int(row["used"]),
            account_created_at=int(row["account_created_at"]),
        ) if not row["account_disabled"] else None

    def authenticate(self, bearer: str | None) -> Caller:
        if not bearer or not bearer.startswith(KEY_PREFIX):
            raise CloudError(401, "bad_key", "Sign in again in the app")
        caller = self._caller(_sha256(bearer))
        if caller is None:
            raise CloudError(401, "bad_key", "This key is no longer valid; sign in again in the app")
        self.db.touch_key(caller.key_hash)
        return caller

    def sign_out(self, caller: Caller) -> None:
        self.db.revoke_key(caller.key_hash)

    def me(self, caller: Caller) -> dict:
        t = now()
        day_start = t - (t % 86400)
        return {
            "account": {
                "channel": caller.channel,
                "hint": caller.hint,
                "created_at": caller.account_created_at,
            },
            "tokens": {
                "granted": caller.granted,
                "used": caller.used,
                "remaining": caller.remaining,
                "used_today": self.db.used_since(caller.account_id, day_start),
                "daily_cap": self.s.daily_cap_tokens,
            },
            "models": [m.to_public() for m in self.s.models],
            "base_url": self.s.public_base,
            "recent": [dict(r) for r in self.db.recent_ledger(caller.account_id)],
        }

    # -- budget -------------------------------------------------------------------------

    def model_for(self, model_id: str, kind: str) -> ModelSpec:
        m = self.s.model(model_id)
        if m is None or m.kind != kind:
            offered = ", ".join(x.id for x in self.s.models if x.kind == kind)
            raise CloudError(404, "model_not_offered", f"nanoMuse Cloud does not offer {model_id!r}; choose one of: {offered}")
        return m

    def check_budget(self, caller: Caller, minimum: int = 1) -> None:
        if caller.remaining < minimum:
            raise CloudError(402, "out_of_tokens", "Your nanoMuse Cloud grant is used up. Add your own model key under Settings → Providers to keep going.")
        t = now()
        if self.db.requests_since(caller.account_id, t - 60) >= self.s.per_minute_requests:
            raise CloudError(429, "rate_limited", "Too many requests; slow down a little")
        if self.db.used_since(caller.account_id, t - (t % 86400)) >= self.s.daily_cap_tokens:
            raise CloudError(429, "daily_cap", "Today's share of the grant is used up; it resets at midnight UTC")

    def charge_chat(self, caller: Caller, model: ModelSpec, prompt_tokens: int, completion_tokens: int, request_id: str) -> int:
        charged = math.ceil(prompt_tokens * model.in_mult + completion_tokens * model.out_mult)
        self.db.charge(caller.account_id, "chat", model.id, prompt_tokens, completion_tokens, charged, request_id)
        return charged

    def charge_image(self, caller: Caller, model: ModelSpec, n: int, request_id: str) -> int:
        charged = model.per_image * max(1, n)
        self.db.charge(caller.account_id, "image", model.id, 0, 0, charged, request_id)
        return charged

    # -- admin ------------------------------------------------------------------------------

    def admin_resolve(self, account_id: str = "", identifier: str = "") -> str:
        """Operators may name an account by its id or by the phone/e-mail itself."""
        if identifier:
            try:
                ident = parse(identifier)
            except BadIdentifier as e:
                raise CloudError(400, "bad_identifier", str(e)) from e
            row = self.db.account_by_hash(ident.hash(self.s.hmac_key))
        else:
            row = self.db.account(account_id)
        if row is None:
            raise CloudError(404, "no_account", "No such account")
        return row["id"]

    def admin_grant(self, account_id: str, tokens: int) -> dict:
        if self.db.account(account_id) is None:
            raise CloudError(404, "no_account", "No such account")
        self.db.grant(account_id, tokens, kind="adjust")
        a = self.db.account(account_id)
        return dict(a)  # type: ignore[arg-type]

    def admin_accounts(self) -> list[dict]:
        return [dict(r) for r in self.db.list_accounts()]

    def admin_disable(self, account_id: str, disabled: bool) -> None:
        if self.db.account(account_id) is None:
            raise CloudError(404, "no_account", "No such account")
        self.db.set_disabled(account_id, disabled)


def estimate_tokens(text: str) -> int:
    """When the upstream sends no usage: a rough count, erring high.
    CJK runs at about one token per character, English at about one per four."""
    if not text:
        return 0
    cjk = sum(1 for ch in text if "\u4e00" <= ch <= "\u9fff")
    return cjk + math.ceil((len(text) - cjk) / 3.5)


def prompt_chars(messages: list) -> int:
    total = 0
    for m in messages or []:
        c = m.get("content") if isinstance(m, dict) else None
        if isinstance(c, str):
            total += len(c)
        elif isinstance(c, list):
            for part in c:
                if isinstance(part, dict):
                    if part.get("type") == "text":
                        total += len(part.get("text") or "")
                    elif part.get("type") == "image_url":
                        total += 4000  # one image ≈ a thousand tokens of context
    return total


def usage_from_json(obj: dict) -> tuple[int, int] | None:
    u = obj.get("usage") if isinstance(obj, dict) else None
    if not isinstance(u, dict):
        return None
    try:
        return int(u.get("prompt_tokens") or 0), int(u.get("completion_tokens") or 0)
    except (TypeError, ValueError):
        return None


def dumps(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
