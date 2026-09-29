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
from .crypto import IdentifierCrypto
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
    # A member has no daily money cap: on the operator's list (ALLOWED_IDENTIFIERS,
    # matched by the identifier's hash) or flagged on the account by the operator.
    member: bool = False

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
        self.crypto = IdentifierCrypto(settings.identifier_key)
        if settings.dev_mode:
            log.warning("CLOUD_SECRET is not set: development mode, identifiers hashed with a fixed key")
        if settings.unlimited:
            log.warning("SIGNUP_TOKENS=0: no token ceiling, usage is metered only")
        # The members' identifiers, hashed once so a request can be matched
        # against the list without ever seeing the plaintext.
        self.member_hashes: frozenset[str] = frozenset(
            i.hash(settings.hmac_key) for i in self._listed_identifiers()
        )
        if settings.signup_open:
            log.info(
                "sign-up is open: %d member(s) without a cap, everyone else ¥%.2f a day",
                len(self.member_hashes), settings.daily_cap_cny,
            )
        else:
            log.warning("SIGNUP_OPEN=0: private relay, only the %d listed identifier(s) may sign in", len(self.member_hashes))

    # -- sign-up -------------------------------------------------------------------

    def _listed_identifiers(self) -> list[Identifier]:
        out = []
        for item in self.s.allowed_identifiers.split(","):
            if not item.strip():
                continue
            try:
                out.append(parse(item))
            except BadIdentifier:
                log.warning("ALLOWED_IDENTIFIERS has an entry that is neither a number nor an address; ignored")
        return out

    def listed(self, ident: Identifier) -> bool:
        """On the operator's list (ALLOWED_IDENTIFIERS)."""
        return ident.hash(self.s.hmac_key) in self.member_hashes

    def allowed(self, ident: Identifier) -> bool:
        """May this identifier sign in? Anyone when sign-up is open; else members only."""
        return self.s.signup_open or self.listed(ident)

    def request_code(self, ident: Identifier, ip: str) -> None:
        if not self.allowed(ident):
            raise CloudError(403, "not_invited", "This relay is private; that number or address is not on its list")
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
        if not self.allowed(ident):
            raise CloudError(403, "not_invited", "This relay is private; that number or address is not on its list")
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
            account_id = self.db.new_account_id()
            enc = self.crypto.encrypt(account_id, ident.value)
            account = self.db.create_account(id_hash, ident.channel, ident.hint, self.s.signup_tokens, enc, account_id=account_id)
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
            member=bool(row["account_unlimited"]) or row["id_hash"] in self.member_hashes,
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

    def delete_account(self, caller: Caller) -> None:
        """The person's own request: every key stops working and nothing about them stays."""
        self.db.delete_account(caller.account_id)

    def me(self, caller: Caller) -> dict:
        t = now()
        day_start = self.s.day_start(t)
        spent_today_uy = self.db.spent_since(caller.account_id, day_start)
        spent_uy = self.db.spent_since(caller.account_id, 0)
        cap_cny = 0.0 if caller.member else self.s.daily_cap_cny
        return {
            "account": {
                "channel": caller.channel,
                "hint": caller.hint,
                "created_at": caller.account_created_at,
                "member": caller.member,
            },
            "tokens": {
                # `unlimited` first: when it is true the app shows 「不限」 and
                # ignores granted/remaining (kept so older builds still parse).
                "unlimited": self.s.unlimited,
                "granted": caller.granted,
                "used": caller.used,
                "remaining": caller.remaining,
                "used_today": self.db.used_since(caller.account_id, day_start),
                "daily_cap": self.s.daily_cap_tokens,
            },
            # Money, as the provider bills the operator: today's spend against
            # the daily cap (0 = none, which is what members get), the total,
            # and the rate the apps use to show dollars next to yuan.
            "spend": {
                "currency": "CNY",
                "today": self.s.uy_to_cny(spent_today_uy),
                "total": self.s.uy_to_cny(spent_uy),
                "daily_cap": cap_cny,
                "unlimited": caller.member or self.s.daily_cap_cny <= 0,
                "usd_cny": self.s.usd_cny,
                "today_usd": self.s.cny_to_usd(self.s.uy_to_cny(spent_today_uy)),
                "daily_cap_usd": self.s.cny_to_usd(cap_cny),
                "day_offset_h": self.s.day_offset_h,
                "resets_at": day_start + 86400,
            },
            "models": [m.to_public() for m in self.s.models],
            "base_url": self.s.public_base,
            "recent": [self._ledger_row(r) for r in self.db.recent_ledger(caller.account_id)],
        }

    def _ledger_row(self, r) -> dict:
        d = dict(r)
        d["cost_cny"] = self.s.uy_to_cny(int(d.pop("cost_uy", 0) or 0))
        return d

    # -- budget -------------------------------------------------------------------------

    def model_for(self, model_id: str, kind: str) -> ModelSpec:
        m = self.s.model(model_id)
        if m is None or m.kind != kind:
            offered = ", ".join(x.id for x in self.s.models if x.kind == kind)
            raise CloudError(404, "model_not_offered", f"nanoMuse Cloud does not offer {model_id!r}; choose one of: {offered}")
        return m

    def check_budget(self, caller: Caller, minimum: int = 1, cost_uy: int = 0) -> None:
        """Each limit is off when its setting is 0; the per-minute one guards the
        operator's bill against a runaway loop even on an unlimited relay.
        `cost_uy` is what the request is known to cost up front (a picture, a
        clip) so it is refused before the money is spent rather than after."""
        if not self.s.unlimited and caller.remaining < minimum:
            raise CloudError(402, "out_of_tokens", "Your nanoMuse Cloud grant is used up. Add your own model key under Settings → Providers to keep going.")
        t = now()
        if self.s.per_minute_requests > 0 and self.db.requests_since(caller.account_id, t - 60) >= self.s.per_minute_requests:
            raise CloudError(429, "rate_limited", "Too many requests; slow down a little")
        day_start = self.s.day_start(t)
        if self.s.daily_cap_tokens > 0 and self.db.used_since(caller.account_id, day_start) >= self.s.daily_cap_tokens:
            raise CloudError(429, "daily_cap", "Today's share of the grant is used up; it resets at midnight")
        if not caller.member and self.s.daily_cap_cny > 0:
            cap_uy = round(self.s.daily_cap_cny * 1_000_000)
            spent = self.db.spent_since(caller.account_id, day_start)
            if spent >= cap_uy or (cost_uy > 0 and spent + cost_uy > cap_uy):
                raise CloudError(
                    429, "daily_cap",
                    f"Today's free ¥{self.s.daily_cap_cny:g} is used up; it resets at midnight (UTC{self.s.day_offset_h:+d}). "
                    "Add your own model key under Settings → Providers to keep going now.",
                )

    def charge_chat(self, caller: Caller, model: ModelSpec, prompt_tokens: int, completion_tokens: int, request_id: str) -> int:
        charged = math.ceil(prompt_tokens * model.in_mult + completion_tokens * model.out_mult)
        cost = model.chat_cost_uy(prompt_tokens, completion_tokens)
        self.db.charge(caller.account_id, "chat", model.id, prompt_tokens, completion_tokens, charged, request_id, cost_uy=cost)
        return charged

    def charge_image(self, caller: Caller, model: ModelSpec, n: int, request_id: str, size: str | None = None) -> int:
        charged = model.per_image * max(1, n)
        cost = model.image_cost_uy(size) * max(1, n)
        self.db.charge(caller.account_id, "image", model.id, 0, 0, charged, request_id, cost_uy=cost)
        return charged

    def charge_video(self, caller: Caller, model: ModelSpec, request_id: str, cost_uy: int = 0) -> int:
        """One accepted task = one clip; the provider bills per output second, so
        `per_clip` is set for the short clips the app asks for and the money
        was priced from the seconds asked for when the task was submitted."""
        charged = model.per_clip
        self.db.charge(caller.account_id, "video", model.id, 0, 0, charged, request_id, cost_uy=cost_uy)
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
        a = dict(self.db.account(account_id))  # type: ignore[arg-type]
        a["identifier"] = self.crypto.decrypt(account_id, a.pop("identifier_enc", "")) or ""
        a.pop("id_hash", None)
        return a

    def admin_accounts(self) -> list[dict]:
        """With the identifier in clear (decrypted here, for the admin token
        only); the hash and ciphertext stay out of the reply. `member` says
        whether the account escapes the daily cap, and why."""
        t = now()
        out = []
        for r in self.db.admin_accounts(self.s.day_start(t)):
            d = dict(r)
            d["identifier"] = self.crypto.decrypt(d["id"], d.pop("identifier_enc", "")) or ""
            id_hash = d.pop("id_hash", None)
            d["disabled"] = bool(d["disabled"])
            d["unlimited"] = bool(d.get("unlimited"))
            d["listed"] = id_hash in self.member_hashes
            d["member"] = d["unlimited"] or d["listed"]
            d["spent_today_cny"] = self.s.uy_to_cny(int(d.pop("spent_today_uy", 0) or 0))
            d["spent_cny"] = self.s.uy_to_cny(int(d.pop("spent_uy", 0) or 0))
            out.append(d)
        return out

    def admin_usage(self, days: int = 14) -> list[dict]:
        t = now()
        since = self.s.day_start(t) - 86400 * max(0, days - 1)
        out = []
        for r in self.db.usage_by_day(since, self.s.day_offset_h * 3600):
            d = dict(r)
            d["cost_cny"] = self.s.uy_to_cny(int(d.pop("cost_uy", 0) or 0))
            out.append(d)
        return out

    def admin_settings(self) -> dict:
        return {
            "unlimited": self.s.unlimited,
            "signup_tokens": self.s.signup_tokens,
            "daily_cap_tokens": self.s.daily_cap_tokens,
            "per_minute_requests": self.s.per_minute_requests,
            "signup_open": self.s.signup_open,
            "daily_cap_cny": self.s.daily_cap_cny,
            "daily_cap_usd": self.s.cny_to_usd(self.s.daily_cap_cny),
            "usd_cny": self.s.usd_cny,
            "day_offset_h": self.s.day_offset_h,
            "allowed_identifiers": [s.strip() for s in self.s.allowed_identifiers.split(",") if s.strip()],
            "sender": self.s.sender,
            "models": [m.id for m in self.s.models],
            "prices": {m.id: m.to_public()["nanomuse"]["price_cny"] for m in self.s.models},
        }

    def admin_disable(self, account_id: str, disabled: bool) -> None:
        if self.db.account(account_id) is None:
            raise CloudError(404, "no_account", "No such account")
        self.db.set_disabled(account_id, disabled)

    def admin_unlimited(self, account_id: str, unlimited: bool) -> None:
        """Make an account a member (no daily cap) without touching the server's
        environment — the operator's way of letting one more person in fully."""
        if self.db.account(account_id) is None:
            raise CloudError(404, "no_account", "No such account")
        self.db.set_unlimited(account_id, unlimited)

    def admin_delete(self, account_id: str) -> None:
        if self.db.account(account_id) is None:
            raise CloudError(404, "no_account", "No such account")
        self.db.delete_account(account_id)


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
