"""The relay's rules: codes, keys, grants, budgets, and what a request costs.

Kept apart from the HTTP layer so the tests can drive it directly and so the
API module stays a thin translation of these calls into status codes.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import math
import re
import secrets
from dataclasses import dataclass

from .config import ModelSpec, Settings
from .crypto import IdentifierCrypto
from .db import Database, now
from .identifiers import BadIdentifier, Identifier, parse
from .senders import CodeSender, SendError, make_sender

log = logging.getLogger("nanomuse_cloud")

KEY_PREFIX = "nm_"

# What one request kind is called in the apps' usage breakdown; the ledger
# keeps the short names.
USAGE_KINDS = ("chat", "image", "video", "realtime")


def hash_password(password: str) -> str:
    """scrypt with a random salt: `scrypt$<salt>$<hash>`, both base64. The
    parameters are the library's recommended interactive ones; a check takes
    a few tens of milliseconds, which is what a sign-in should cost."""
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1, dklen=32)
    return "scrypt$" + base64.b64encode(salt).decode() + "$" + base64.b64encode(digest).decode()


def check_password(password: str, stored: str) -> bool:
    try:
        algo, salt_b64, hash_b64 = stored.split("$", 2)
        if algo != "scrypt":
            return False
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(hash_b64)
    except (ValueError, TypeError):
        return False
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1, dklen=len(expected))
    return hmac.compare_digest(digest, expected)


class CloudError(Exception):
    """An error the app should show. `status` is the HTTP status, `code` a stable
    machine-readable name the app can switch on (it has strings for each)."""

    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


def _strip_binary(messages: list) -> list:
    """Messages with pictures (data: URLs) replaced by a marker: the words are the sample."""
    out = []
    for m in messages:
        if not isinstance(m, dict):
            continue
        m = dict(m)
        content = m.get("content")
        if isinstance(content, list):
            parts = []
            for part in content:
                if isinstance(part, dict) and part.get("type") in ("image_url", "input_audio", "video_url", "video"):
                    parts.append({"type": part["type"], "omitted": True})
                elif isinstance(part, dict) and part.get("type") == "text":
                    parts.append({"type": "text", "text": str(part.get("text", ""))})
                else:
                    parts.append(part if isinstance(part, (str, int, float, bool)) else {"type": "other", "omitted": True})
            m["content"] = parts
        out.append(m)
    return out


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
    has_password: bool = False
    password_set_at: int | None = None
    # How and when this particular key was issued: a recent code sign-in may
    # set a password without knowing the old one (the reset path).
    via: str = "code"
    key_created_at: int = 0
    key_prefix: str = ""
    # Invitations (0.4): the code this person hands out, how many came, and the
    # credit earned — money for the days the cap is used up — with the clips.
    invite_code: str = ""
    invites: int = 0
    credit_uy: int = 0
    credit_used_uy: int = 0
    clips_bonus: int = 0
    # The person chose to contribute their conversations (0.4): only then does the
    # relay keep what was said, for the community's own model.
    contribute: bool = False

    @property
    def remaining(self) -> int:
        return max(0, self.granted - self.used)

    @property
    def credit_left_uy(self) -> int:
        return max(0, self.credit_uy - self.credit_used_uy)


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
        self.member_hashes: frozenset[str] = frozenset(i.hash(settings.hmac_key) for i in self._listed_identifiers())
        if settings.signup_open:
            log.info(
                "sign-up is open: %d member(s) without a cap, everyone else ¥%.2f a day",
                len(self.member_hashes),
                settings.daily_cap_cny,
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
            raise CloudError(403, "not_invited", "This relay is private; that address is not on its list")
        t = now()
        if self.db.codes_recent_for(ident.hash(self.s.hmac_key), t - 600) >= self.s.code_per_identifier_10m:
            raise CloudError(429, "code_too_often", "Too many codes for this address; wait a few minutes")
        if ip and self.db.codes_recent_for_ip(ip, t - 3600) >= self.s.code_per_ip_hour:
            raise CloudError(429, "code_too_often", "Too many codes from this network; wait an hour")
        code = f"{secrets.randbelow(1_000_000):06d}"
        self.db.insert_code(ident.hash(self.s.hmac_key), _sha256(code), ip, self.s.code_ttl_s)
        try:
            self.sender.send(ident, code)
        except SendError as e:
            raise CloudError(502, "send_failed", f"Could not send the code ({e})") from e

    def verify_code(self, ident: Identifier, code: str, device: str, invite: str = "") -> tuple[str, Caller, bool]:
        """Returns (api_key, caller, created). The key is shown once. `invite` is
        a friend's code; it counts only when this sign-in creates the account."""
        if not self.allowed(ident):
            raise CloudError(403, "not_invited", "This relay is private; that address is not on its list")
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
            self.db.add_event(account_id, "account.created", ident.channel)
            self._accept_invite(account_id, invite)
        elif account["disabled"]:
            raise CloudError(403, "account_disabled", "This account is disabled")

        key, caller = self._issue_key(account["id"], device, via="code")
        self.db.add_event(account["id"], "sign_in.code", device)
        return key, caller, created

    # -- invitations ------------------------------------------------------------------

    @staticmethod
    def normalize_invite(code: str) -> str:
        """Codes are eight letters and digits, shown in upper case; typed any way."""
        return re.sub(r"[^A-Z0-9]", "", (code or "").upper())[:8]

    def _accept_invite(self, new_account_id: str, invite: str) -> None:
        code = self.normalize_invite(invite)
        if not code:
            return
        inviter = self.db.account_by_invite_code(code)
        if inviter is None or inviter["id"] == new_account_id or inviter["disabled"]:
            # a wrong code is not an error: the person is signed in either way
            self.db.add_event(new_account_id, "invite.unknown")
            return
        bonus_uy = round(self.s.invite_bonus_cny * 1_000_000)
        self.db.record_invite(inviter["id"], new_account_id, bonus_uy, self.s.video_clips_per_invite)
        self.db.add_event(inviter["id"], "invite.accepted", new_account_id[:8])
        self.db.add_event(new_account_id, "invite.used", inviter["id"][:8])
        log.info("invite: %s brought %s (+¥%.2f)", inviter["id"][:8], new_account_id[:8], self.s.invite_bonus_cny)

    def invite_code_for(self, caller: Caller) -> str:
        """The account's code, made on first ask (no confusable letters)."""
        if caller.invite_code:
            return caller.invite_code
        alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
        for _ in range(20):
            code = "".join(secrets.choice(alphabet) for _ in range(8))
            if self.db.set_invite_code(caller.account_id, code):
                return code
            row = self.db.account(caller.account_id)
            if row is not None and row["invite_code"]:
                return str(row["invite_code"])
        raise CloudError(500, "invite_code", "Could not make an invite code; try again")

    def invite_view(self, caller: Caller) -> dict:
        code = self.invite_code_for(caller)
        return {
            "code": code,
            "url": self.s.invite_url + code if self.s.invite_url else "",
            "invites": caller.invites,
            "bonus_cny": self.s.invite_bonus_cny,
            "clips_per_invite": self.s.video_clips_per_invite,
            "credit_cny": self.s.uy_to_cny(caller.credit_uy),
            "credit_left_cny": self.s.uy_to_cny(caller.credit_left_uy),
            "friends": [{"hint": r["hint"], "joined_at": int(r["created_at"])} for r in self.db.invitees(caller.account_id)],
        }

    # -- video clips: the expensive part, counted per account ---------------------------

    def clips_allowed(self, caller: Caller) -> int | None:
        """How many clips this account may make in all; None = no limit."""
        if caller.member or self.s.video_clips_free <= 0:
            return None
        return self.s.video_clips_free + caller.clips_bonus

    def clips_view(self, caller: Caller) -> dict:
        allowed = self.clips_allowed(caller)
        used = self.db.video_clips_used(caller.account_id, now() - 3600)
        return {
            "unlimited": allowed is None,
            "allowed": allowed,
            "used": used,
            "left": None if allowed is None else max(0, allowed - used),
            "per_face": self.s.video_clips_per_invite or 4,
        }

    def check_clips(self, caller: Caller, n: int = 1) -> None:
        allowed = self.clips_allowed(caller)
        if allowed is None:
            return
        used = self.db.video_clips_used(caller.account_id, now() - 3600)
        if used + max(1, n) > allowed:
            self.db.add_event(caller.account_id, "budget.refused", "video_limit")
            raise CloudError(
                429,
                "video_limit",
                f"Your video allowance is used up ({allowed} clips — one animated face per account). "
                f"Each friend who signs up with your invite code adds {self.s.video_clips_per_invite} more, "
                "or add your own model key under Settings → Providers.",
            )

    def _issue_key(self, account_id: str, device: str, via: str) -> tuple[str, Caller]:
        key = KEY_PREFIX + secrets.token_urlsafe(30)
        self.db.insert_key(_sha256(key), key[:10], account_id, device, via=via)
        caller = self._caller(_sha256(key))
        assert caller is not None
        return key, caller

    # -- passwords --------------------------------------------------------------------

    def _check_new_password(self, password: str, ident_value: str = "") -> None:
        if len(password) < self.s.password_min_len:
            raise CloudError(400, "password_short", f"Use at least {self.s.password_min_len} characters")
        if len(password) > 128:
            raise CloudError(400, "password_long", "That password is too long")
        if len(set(password)) < 3:
            raise CloudError(400, "password_weak", "Use a few different characters")
        if ident_value and password.strip().lower() == ident_value.strip().lower():
            raise CloudError(400, "password_weak", "The password cannot be the address itself")

    def set_password(self, caller: Caller, password: str, current: str | None = None) -> None:
        """Set or change the password. When one is already set, the old one is
        needed — unless this key came from a code sign-in a few minutes ago,
        which is the "forgot it" path (the code proved the phone or mailbox)."""
        account = self.db.account(caller.account_id)
        if account is None:
            raise CloudError(404, "no_account", "No such account")
        self._check_new_password(password, self.crypto.decrypt(caller.account_id, account["identifier_enc"] or "") or "")
        stored = account["password_hash"] or ""
        if stored:
            fresh_code = caller.via == "code" and now() - caller.key_created_at <= self.s.password_reset_window_s
            if not fresh_code:
                if not current:
                    raise CloudError(400, "password_required", "Enter the current password (or sign in with a code first)")
                if not check_password(current, stored):
                    left = self.db.login_failed(caller.account_id, self.s.password_max_attempts, self.s.lockout_s)
                    raise CloudError(
                        400,
                        "password_wrong",
                        f"That is not the current password ({left} tries left)"
                        if left
                        else "Too many wrong tries; sign in with a code to reset it",
                    )
        self.db.set_password(caller.account_id, hash_password(password))
        self.db.add_event(caller.account_id, "password.set" if not stored else "password.changed")

    def clear_password(self, caller: Caller, current: str) -> None:
        account = self.db.account(caller.account_id)
        if account is None or not account["password_hash"]:
            return
        if not check_password(current, account["password_hash"]):
            raise CloudError(400, "password_wrong", "That is not the current password")
        self.db.set_password(caller.account_id, "")
        self.db.add_event(caller.account_id, "password.cleared")

    def login_password(self, ident: Identifier, password: str, device: str) -> tuple[str, Caller]:
        """Sign in on a new device with the password instead of waiting for a code."""
        if not self.allowed(ident):
            raise CloudError(403, "not_invited", "This relay is private; that address is not on its list")
        account = self.db.account_by_hash(ident.hash(self.s.hmac_key))
        if account is None:
            # Same answer as a wrong password: the sign-in form must not tell
            # whether a number has an account.
            hash_password("x")  # keep the timing alike
            self.db.add_event("", "sign_in.failed", ident.channel)
            raise CloudError(401, "bad_credentials", "That address and password do not match")
        if account["disabled"]:
            raise CloudError(403, "account_disabled", "This account is disabled")
        locked_until = account["locked_until"]
        if locked_until and int(locked_until) > now():
            raise CloudError(429, "locked", "Too many wrong passwords; wait a while or sign in with a code")
        if not account["password_hash"]:
            raise CloudError(400, "no_password", "This account has no password yet; sign in with a code and set one under Account")
        if not check_password(password, account["password_hash"]):
            left = self.db.login_failed(account["id"], self.s.password_max_attempts, self.s.lockout_s)
            self.db.add_event(account["id"], "sign_in.failed", device)
            if left == 0:
                raise CloudError(429, "locked", "Too many wrong passwords; wait a while or sign in with a code")
            raise CloudError(401, "bad_credentials", "That address and password do not match")
        self.db.login_succeeded(account["id"])
        key, caller = self._issue_key(account["id"], device, via="password")
        self.db.add_event(account["id"], "sign_in.password", device)
        return key, caller

    # -- keys -------------------------------------------------------------------------

    def _caller(self, key_hash: str) -> Caller | None:
        row = self.db.key(key_hash)
        if row is None or row["revoked_at"] is not None:
            return None
        return (
            Caller(
                key_hash=key_hash,
                account_id=row["account_id"],
                channel=row["channel"],
                hint=row["hint"],
                granted=int(row["granted"]),
                used=int(row["used"]),
                account_created_at=int(row["account_created_at"]),
                member=bool(row["account_unlimited"]) or row["id_hash"] in self.member_hashes,
                has_password=bool(row["password_hash"]),
                password_set_at=int(row["password_set_at"]) if row["password_set_at"] else None,
                via=row["via"] or "code",
                key_created_at=int(row["created_at"]),
                key_prefix=row["prefix"],
                invite_code=row["invite_code"] or "",
                invites=int(row["invites"] or 0),
                credit_uy=int(row["credit_uy"] or 0),
                credit_used_uy=int(row["credit_used_uy"] or 0),
                clips_bonus=int(row["clips_bonus"] or 0),
                contribute=bool(row["contribute"]),
            )
            if not row["account_disabled"]
            else None
        )

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
        self.db.add_event(caller.account_id, "sign_out")

    def sign_out_all(self, caller: Caller, keep_current: bool = True) -> int:
        """Every other device (or every device) signed out at once — what to do
        after losing a phone."""
        n = self.db.revoke_all_keys(caller.account_id, keep_hash=caller.key_hash if keep_current else None)
        self.db.add_event(caller.account_id, "sign_out.all", str(n))
        return n

    def revoke_session(self, caller: Caller, prefix: str) -> None:
        if not self.db.revoke_key_by_prefix(caller.account_id, prefix[:10]):
            raise CloudError(404, "no_session", "No such sign-in")
        self.db.add_event(caller.account_id, "sign_out", prefix[:10])

    def sessions(self, caller: Caller) -> list[dict]:
        """The live sign-ins of this account — one per device that has a key —
        with the one making the request marked."""
        out = []
        for k in self.db.keys_for(caller.account_id, live_only=True):
            out.append(
                {
                    "prefix": k["prefix"],
                    "device": k["device"],
                    "via": k["via"] or "code",
                    "created_at": int(k["created_at"]),
                    "last_used_at": int(k["last_used_at"]) if k["last_used_at"] else None,
                    "current": k["key_hash"] == caller.key_hash,
                }
            )
        out.sort(key=lambda s: (not s["current"], -(s["last_used_at"] or s["created_at"])))
        return out

    def events(self, caller: Caller, limit: int = 50) -> list[dict]:
        return [dict(r) for r in self.db.events_for(caller.account_id, max(1, min(limit, 200)))]

    def delete_account(self, caller: Caller) -> None:
        """The person's own request: every key stops working and nothing about them stays."""
        self.db.delete_account(caller.account_id)

    def usage(self, account_id: str, day_start: int) -> dict:
        """The breakdown behind the totals: by kind (chat, pictures, clips,
        calls) today and overall, and by model overall."""

        def rows(rs) -> list[dict]:
            out = []
            for r in rs:
                d = dict(r)
                d["cost_cny"] = self.s.uy_to_cny(int(d.pop("cost_uy", 0) or 0))
                for k in ("requests", "prompt_tokens", "completion_tokens", "charged"):
                    d[k] = int(d.get(k) or 0)
                out.append(d)
            return out

        return {
            "today": {"by_kind": rows(self.db.usage_by_kind(day_start, account_id))},
            "total": {
                "by_kind": rows(self.db.usage_by_kind(0, account_id)),
                "by_model": rows(self.db.usage_by_model(0, account_id)),
            },
            "kinds": list(USAGE_KINDS),
        }

    def me(self, caller: Caller) -> dict:
        t = now()
        day_start = self.s.day_start(t)
        spent_today_uy = self.db.spent_since(caller.account_id, day_start)
        spent_uy = self.db.spent_since(caller.account_id, 0)
        cap_cny = 0.0 if caller.member else self.s.daily_cap_cny
        return {
            "account": {
                # an opaque id (not the identifier): what nanoMuse Web keys a person's kept
                # Muse to, so a sign-in from another browser lands in the same one
                "id": caller.account_id,
                "channel": caller.channel,
                "hint": caller.hint,
                "created_at": caller.account_created_at,
                "member": caller.member,
                "has_password": caller.has_password,
                "password_set_at": caller.password_set_at,
                "sessions": len(self.db.keys_for(caller.account_id, live_only=True)),
                "signed_in_via": caller.via,
            },
            "usage": self.usage(caller.account_id, day_start),
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
                # credit (invites, the operator) is spent only once the day's cap is; what is left
                # of it, and what may still be spent today all told (None = no limit)
                "credit_left": self.s.uy_to_cny(caller.credit_left_uy),
                "left_today": None
                if caller.member or self.s.daily_cap_cny <= 0
                else self.s.uy_to_cny(max(0, self._cap_uy() + caller.credit_left_uy - spent_today_uy)),
            },
            "invite": self.invite_view(caller),
            "clips": self.clips_view(caller),
            "contribute": {"on": caller.contribute, "samples": self.db.sample_count(caller.account_id) if caller.contribute else 0},
            "models": [m.to_public() for m in self.s.models],
            "base_url": self.s.public_base,
            "recent": [self._ledger_row(r) for r in self.db.recent_ledger(caller.account_id)],
        }

    def _ledger_row(self, r) -> dict:
        d = dict(r)
        d["cost_cny"] = self.s.uy_to_cny(int(d.pop("cost_uy", 0) or 0))
        extra = d.pop("extra", "") or ""
        if extra:
            try:
                d["detail"] = json.loads(extra)
            except ValueError:
                pass
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
        try:
            self._check_budget(caller, minimum, cost_uy)
        except CloudError as e:
            if e.code in ("out_of_tokens", "daily_cap"):
                self.db.add_event(caller.account_id, "budget.refused", e.code)
            raise

    def _check_budget(self, caller: Caller, minimum: int, cost_uy: int) -> None:
        if not self.s.unlimited and caller.remaining < minimum:
            raise CloudError(
                402,
                "out_of_tokens",
                "Your nanoMuse Cloud grant is used up. Add your own model key under Settings → Providers to keep going.",
            )
        t = now()
        if self.s.per_minute_requests > 0 and self.db.requests_since(caller.account_id, t - 60) >= self.s.per_minute_requests:
            raise CloudError(429, "rate_limited", "Too many requests; slow down a little")
        day_start = self.s.day_start(t)
        if self.s.daily_cap_tokens > 0 and self.db.used_since(caller.account_id, day_start) >= self.s.daily_cap_tokens:
            raise CloudError(429, "daily_cap", "Today's share of the grant is used up; it resets at midnight")
        if not caller.member and self.s.daily_cap_cny > 0:
            # today's cap, stretched by whatever credit is left (invites, the operator)
            cap_uy = self._cap_uy()
            spent = self.db.spent_since(caller.account_id, day_start)
            room = cap_uy + caller.credit_left_uy
            if spent >= room or (cost_uy > 0 and spent + cost_uy > room):
                raise CloudError(
                    429,
                    "daily_cap",
                    f"Today's free ¥{self.s.daily_cap_cny:g} is used up; it resets at midnight (UTC{self.s.day_offset_h:+d}). "
                    f"Invite a friend for ¥{self.s.invite_bonus_cny:g} of credit (Account → Invite), "
                    "or add your own model key under Settings → Providers to keep going now.",
                )

    def _cap_uy(self) -> int:
        return round(self.s.daily_cap_cny * 1_000_000)

    def _cap_for(self, caller: Caller) -> tuple[int | None, int]:
        """(cap in micro-yuan or None for members, today's start) — what `db.charge` needs to draw on credit."""
        if caller.member or self.s.daily_cap_cny <= 0:
            return None, 0
        return self._cap_uy(), self.s.day_start(now())

    def charge_chat(self, caller: Caller, model: ModelSpec, prompt_tokens: int, completion_tokens: int, request_id: str) -> int:
        charged = math.ceil(prompt_tokens * model.in_mult + completion_tokens * model.out_mult)
        cost = model.chat_cost_uy(prompt_tokens, completion_tokens)
        cap_uy, day_start = self._cap_for(caller)
        self.db.charge(
            caller.account_id,
            "chat",
            model.id,
            prompt_tokens,
            completion_tokens,
            charged,
            request_id,
            cost_uy=cost,
            cap_uy=cap_uy,
            day_start=day_start,
        )
        return charged

    def charge_image(self, caller: Caller, model: ModelSpec, n: int, request_id: str, size: str | None = None) -> int:
        charged = model.per_image * max(1, n)
        cost = model.image_cost_uy(size) * max(1, n)
        cap_uy, day_start = self._cap_for(caller)
        self.db.charge(caller.account_id, "image", model.id, 0, 0, charged, request_id, cost_uy=cost, cap_uy=cap_uy, day_start=day_start)
        return charged

    def charge_video(self, caller: Caller, model: ModelSpec, request_id: str, cost_uy: int = 0) -> int:
        """One accepted task = one clip; the provider bills per output second, so
        `per_clip` is set for the short clips the app asks for and the money
        was priced from the seconds asked for when the task was submitted."""
        charged = model.per_clip
        cap_uy, day_start = self._cap_for(caller)
        self.db.charge(caller.account_id, "video", model.id, 0, 0, charged, request_id, cost_uy=cost_uy, cap_uy=cap_uy, day_start=day_start)
        return charged

    def note(self, account_id: str, kind: str, detail: str = "") -> None:
        """An event on the account's timeline (never message content)."""
        self.db.add_event(account_id, kind, detail)

    # -- contributed conversations ---------------------------------------------------------
    #
    # Off for everyone until they turn it on. With it on, each chat request's messages and
    # the model's reply are kept for the community's own model — nothing else changes, and
    # the person can turn it off and delete what they gave at any time. Never the person's
    # identity: samples carry the account id only, and are exported without it.

    SAMPLE_MAX_CHARS = 200_000

    def set_contribute(self, caller: Caller, on: bool) -> dict:
        if on != caller.contribute:
            self.db.set_contribute(caller.account_id, on)
            self.note(caller.account_id, "contribute.on" if on else "contribute.off")
        return {"on": on, "samples": self.db.sample_count(caller.account_id) if on else 0}

    def delete_samples(self, caller: Caller) -> int:
        n = self.db.delete_samples(caller.account_id)
        self.note(caller.account_id, "contribute.deleted", f"{n} conversations")
        return n

    def keep_sample(
        self,
        caller: Caller,
        model: str,
        messages: list,
        response: str,
        prompt_tokens: int,
        completion_tokens: int,
        meta: dict | None = None,
    ) -> None:
        """Called after a chat turn for a contributing account; anything else is a no-op."""
        if not caller.contribute:
            return
        request = json.dumps(_strip_binary(messages), ensure_ascii=False)
        if len(request) > self.SAMPLE_MAX_CHARS:
            request = request[: self.SAMPLE_MAX_CHARS]
        self.db.add_sample(
            caller.account_id,
            model,
            request,
            response[: self.SAMPLE_MAX_CHARS],
            prompt_tokens,
            completion_tokens,
            json.dumps(meta or {}, ensure_ascii=False),
        )

    def admin_samples(self, account_id: str | None = None, since: int = 0, limit: int = 100, before: int = 0) -> list[dict]:
        out = []
        for r in self.db.samples(account_id, since, limit, before):
            d = dict(r)
            d["request"] = json.loads(d["request"]) if d["request"] else []
            d["meta"] = json.loads(d["meta"]) if d["meta"] else {}
            out.append(d)
        return out

    def export_samples(self, since: int = 0):
        """Every contributed conversation as JSON lines, without the account id: the
        training set is about what was said, not who said it."""
        before = 0
        while True:
            rows = self.db.samples(None, since, 1000, before)
            if not rows:
                return
            for r in rows:
                d = {
                    "id": r["id"],
                    "ts": int(r["ts"]),
                    "model": r["model"],
                    "messages": json.loads(r["request"]) if r["request"] else [],
                    "response": r["response"],
                    "prompt_tokens": int(r["prompt_tokens"]),
                    "completion_tokens": int(r["completion_tokens"]),
                    "meta": json.loads(r["meta"]) if r["meta"] else {},
                }
                yield json.dumps(d, ensure_ascii=False) + "\n"
            before = int(rows[-1]["ts"])
            if len(rows) < 1000:
                return

    def estimate(
        self, caller: Caller, images: int = 0, clips: int = 0, image_model: str = "", video_model: str = "", size: str | None = None
    ) -> dict:
        """What a job would cost before it is started — the app asks before a new
        face (five pictures and, with video on, four clips) and shows the person
        the number next to what they have left today. Nothing is charged."""
        images = max(0, min(images, 50))
        clips = max(0, min(clips, 20))
        parts = []
        cost = 0
        if images:
            m = self.model_for(image_model, "image") if image_model else next((x for x in self.s.models if x.kind == "image"), None)
            if m is None:
                raise CloudError(404, "model_not_offered", "nanoMuse Cloud offers no image model")
            c = m.image_cost_uy(size) * images
            cost += c
            parts.append({"kind": "image", "model": m.id, "count": images, "cny": self.s.uy_to_cny(c)})
        if clips:
            m = self.model_for(video_model, "video") if video_model else next((x for x in self.s.models if x.kind == "video"), None)
            if m is None:
                raise CloudError(404, "model_not_offered", "nanoMuse Cloud offers no video model")
            c = m.video_cost_uy(m.clip_seconds) * clips
            cost += c
            parts.append({"kind": "video", "model": m.id, "count": clips, "seconds": m.clip_seconds, "cny": self.s.uy_to_cny(c)})
        day_start = self.s.day_start(now())
        spent = self.db.spent_since(caller.account_id, day_start)
        capped = not caller.member and self.s.daily_cap_cny > 0
        room = None if not capped else max(0, self._cap_uy() + caller.credit_left_uy - spent)
        clip_view = self.clips_view(caller)
        clips_ok = clip_view["unlimited"] or clips <= int(clip_view["left"] or 0)
        return {
            "cny": self.s.uy_to_cny(cost),
            "parts": parts,
            "left_today_cny": None if room is None else self.s.uy_to_cny(room),
            "credit_left_cny": self.s.uy_to_cny(caller.credit_left_uy),
            "affordable": (room is None or cost <= room) and clips_ok,
            "clips_ok": clips_ok,
            "clips": clip_view,
            "daily_cap_cny": 0.0 if caller.member else self.s.daily_cap_cny,
        }

    # -- admin ------------------------------------------------------------------------------

    def admin_credit(self, account_id: str, cny: float, clips: int = 0, note: str = "") -> dict:
        """Credit from the operator: a merged pull request, a reported bug, a
        promised refund. Spent only after the day's cap, never expires."""
        if self.db.account(account_id) is None:
            raise CloudError(404, "no_account", "No such account")
        if cny < 0 or cny > 1000 or clips < 0 or clips > 1000:
            raise CloudError(400, "bad_request", "Credit is between ¥0 and ¥1000, clips between 0 and 1000")
        self.db.add_credit(account_id, round(cny * 1_000_000), clips=clips, note=note)
        self.db.add_event(account_id, "credit.granted", f"¥{cny:g}" + (f" +{clips} clips" if clips else ""))
        a = dict(self.db.account(account_id))  # type: ignore[arg-type]
        a["identifier"] = self.crypto.decrypt(account_id, a.pop("identifier_enc", "")) or ""
        a.pop("id_hash", None)
        a.pop("password_hash", None)
        a["credit_cny"] = self.s.uy_to_cny(int(a.get("credit_uy") or 0))
        a["credit_left_cny"] = self.s.uy_to_cny(max(0, int(a.get("credit_uy") or 0) - int(a.get("credit_used_uy") or 0)))
        return a

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
            d["has_password"] = bool(d.pop("password_hash", ""))
            d.pop("failed_logins", None)
            locked_until = d.pop("locked_until", None)
            d["locked"] = bool(locked_until and int(locked_until) > t)
            d["disabled"] = bool(d["disabled"])
            d["unlimited"] = bool(d.get("unlimited"))
            d["listed"] = id_hash in self.member_hashes
            d["member"] = d["unlimited"] or d["listed"]
            d["spent_today_cny"] = self.s.uy_to_cny(int(d.pop("spent_today_uy", 0) or 0))
            d["spent_cny"] = self.s.uy_to_cny(int(d.pop("spent_uy", 0) or 0))
            self._credit_fields(d)
            d["contribute"] = bool(d.get("contribute"))
            out.append(d)
        return out

    def _credit_fields(self, d: dict) -> None:
        credit = int(d.pop("credit_uy", 0) or 0)
        used = int(d.pop("credit_used_uy", 0) or 0)
        d["credit_cny"] = self.s.uy_to_cny(credit)
        d["credit_left_cny"] = self.s.uy_to_cny(max(0, credit - used))
        d["invites"] = int(d.get("invites") or 0)
        d["clips_bonus"] = int(d.get("clips_bonus") or 0)

    def admin_usage(self, days: int = 14) -> list[dict]:
        t = now()
        since = self.s.day_start(t) - 86400 * max(0, days - 1)
        out = []
        for r in self.db.usage_by_day(since, self.s.day_offset_h * 3600):
            d = dict(r)
            d["cost_cny"] = self.s.uy_to_cny(int(d.pop("cost_uy", 0) or 0))
            out.append(d)
        return out

    def _rows_cny(self, rs) -> list[dict]:
        out = []
        for r in rs:
            d = dict(r)
            d["cost_cny"] = self.s.uy_to_cny(int(d.pop("cost_uy", 0) or 0))
            for k in ("requests", "prompt_tokens", "completion_tokens", "charged"):
                if k in d:
                    d[k] = int(d.get(k) or 0)
            out.append(d)
        return out

    def admin_overview(self, days: int = 30) -> dict:
        """The operator's dashboard in one call: how many people, how active,
        what it costs — today, this week, over `days` — split by kind and by
        model, plus the last sign-ins and refusals. Identifiers appear only as
        the masked hint; the detail endpoint decrypts one account at a time."""
        t = now()
        day_start = self.s.day_start(t)
        week_start = day_start - 6 * 86400
        since = day_start - 86400 * max(0, days - 1)

        def totals(s: int) -> dict:
            r = self.db.totals_since(s)
            return {
                "requests": int(r["requests"] or 0),
                "charged": int(r["charged"] or 0),
                "prompt_tokens": int(r["prompt_tokens"] or 0),
                "completion_tokens": int(r["completion_tokens"] or 0),
                "cost_cny": self.s.uy_to_cny(int(r["cost_uy"] or 0)),
                "active_accounts": self.db.active_accounts_since(s),
                "new_accounts": self.db.accounts_created_since(s),
                "by_kind": self._rows_cny(self.db.usage_by_kind(s)),
            }

        counts = self.db.event_counts(day_start)
        hints = {r["id"]: r["hint"] for r in self.db.list_accounts(limit=5000)}
        top = []
        for r in self.db.top_accounts_since(since):
            top.append(
                {
                    "account_id": r["account_id"],
                    "hint": hints.get(r["account_id"], "?"),
                    "requests": int(r["requests"] or 0),
                    "charged": int(r["charged"] or 0),
                    "cost_cny": self.s.uy_to_cny(int(r["cost_uy"] or 0)),
                }
            )
        events = []
        for r in self.db.events_recent(60):
            d = dict(r)
            d["hint"] = hints.get(d["account_id"], "") if d["account_id"] else ""
            events.append(d)
        return {
            "generated_at": t,
            "day_start": day_start,
            "accounts": self.db.account_counts(),
            "today": totals(day_start),
            "week": totals(week_start),
            "period": {"days": days, **totals(since), "by_model": self._rows_cny(self.db.usage_by_model(since))},
            "signals_today": {
                "sign_ins": counts.get("sign_in.code", 0) + counts.get("sign_in.password", 0),
                "sign_in_failures": counts.get("sign_in.failed", 0),
                "budget_refusals": counts.get("budget.refused", 0),
                "upstream_errors": counts.get("upstream.error", 0),
                "calls": counts.get("call.ended", 0),
            },
            "top_accounts": top,
            "events": events,
            # what the community chose to give: how many accounts contribute, how many turns so far
            "contributions": {"accounts": self.db.contributors(), "samples": self.db.sample_count()},
            "settings": self.admin_settings(),
        }

    def admin_account(self, account_id: str, days: int = 30) -> dict:
        """Everything the relay knows about one account, for the operator:
        the identifier in clear, spend by kind / model / day, the live
        sign-ins (device names only), the remembered devices, its timeline.
        What the person said to the model is not here — it was never kept."""
        row = self.db.account(account_id)
        if row is None:
            raise CloudError(404, "no_account", "No such account")
        t = now()
        day_start = self.s.day_start(t)
        since = day_start - 86400 * max(0, days - 1)
        a = dict(row)
        a["identifier"] = self.crypto.decrypt(account_id, a.pop("identifier_enc", "") or "") or ""
        id_hash = a.pop("id_hash", None)
        a.pop("password_hash", None)
        a["has_password"] = bool(row["password_hash"])
        a["disabled"] = bool(a["disabled"])
        a["unlimited"] = bool(a.get("unlimited"))
        a["listed"] = id_hash in self.member_hashes
        a["member"] = a["unlimited"] or a["listed"]
        a["locked"] = bool(row["locked_until"] and int(row["locked_until"]) > t)
        self._credit_fields(a)
        a["clips_used"] = self.db.video_clips_used(account_id, t - 3600)
        a["clips_allowed"] = None if a["member"] or self.s.video_clips_free <= 0 else self.s.video_clips_free + a["clips_bonus"]
        a["invited"] = [{"id": r["id"], "hint": r["hint"], "created_at": int(r["created_at"])} for r in self.db.invitees(account_id)]
        a["contribute"] = bool(a.get("contribute"))
        a["samples"] = self.db.sample_count(account_id) if a["contribute"] else 0
        spent_today = self.db.spent_since(account_id, day_start)
        return {
            "account": a,
            "spend": {
                "today_cny": self.s.uy_to_cny(spent_today),
                "total_cny": self.s.uy_to_cny(self.db.spent_since(account_id, 0)),
                "daily_cap_cny": 0.0 if a["member"] else self.s.daily_cap_cny,
                "used_today": self.db.used_since(account_id, day_start),
                "requests_total": self.db.requests_since(account_id, 0),
            },
            "usage": {
                "today": {"by_kind": self._rows_cny(self.db.usage_by_kind(day_start, account_id))},
                "period": {
                    "days": days,
                    "by_kind": self._rows_cny(self.db.usage_by_kind(since, account_id)),
                    "by_model": self._rows_cny(self.db.usage_by_model(since, account_id)),
                    "by_day": self._rows_cny(self.db.usage_by_day_for(account_id, since, self.s.day_offset_h * 3600)),
                },
                "total": {"by_kind": self._rows_cny(self.db.usage_by_kind(0, account_id))},
            },
            "sessions": [
                {
                    "prefix": k["prefix"],
                    "device": k["device"],
                    "via": k["via"] or "code",
                    "created_at": int(k["created_at"]),
                    "last_used_at": int(k["last_used_at"]) if k["last_used_at"] else None,
                    "revoked_at": int(k["revoked_at"]) if k["revoked_at"] else None,
                }
                for k in self.db.keys_for(account_id)
            ],
            "devices": [dict(d) for d in self.db.devices_for(account_id)],
            "recent": [self._ledger_row(r) for r in self.db.recent_ledger(account_id, limit=60)],
            "events": [dict(r) for r in self.db.events_for(account_id, 80)],
        }

    def admin_events(self, limit: int = 200, kinds: tuple[str, ...] | None = None) -> list[dict]:
        hints = {r["id"]: r["hint"] for r in self.db.list_accounts(limit=5000)}
        out = []
        for r in self.db.events_recent(max(1, min(limit, 1000)), kinds):
            d = dict(r)
            d["hint"] = hints.get(d["account_id"], "") if d["account_id"] else ""
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
            "invite_bonus_cny": self.s.invite_bonus_cny,
            "invite_url": self.s.invite_url,
            "video_clips_free": self.s.video_clips_free,
            "video_clips_per_invite": self.s.video_clips_per_invite,
            "allowed_identifiers": [s.strip() for s in self.s.allowed_identifiers.split(",") if s.strip()],
            "sender": self.s.sender,
            "password_min_len": self.s.password_min_len,
            "models": [m.id for m in self.s.models],
            "model_kinds": {m.id: m.kind for m in self.s.models},
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
