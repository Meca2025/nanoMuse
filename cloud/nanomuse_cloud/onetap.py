"""Sign in with the phone's own number — 号码认证服务's H5 一键登录, no SDK in any app.

The carrier vouches for the SIM the page is loaded over, so the person types the middle
four digits of the number the carrier shows (the H5 flow's safeguard against a shared
hotspot) and nothing else: no code to wait for, no SMS sent. It needs mobile data on; the
web SDK cannot force a phone on Wi-Fi onto the cellular path, so the page says so and
offers the code instead.

The pieces, and what each one holds:

    app      makes `verifier` (random) and `state` = sha256(verifier), opens
             {PUBLIC_BASE}/app/onetap.html?state=…  in a WebView
    page     POST /v1/auth/onetap/token            → the SDK's accessToken / jwtToken
             (GetAuthToken — the relay's key, cached; the tokens are short-lived and
             good for nothing but this page's carrier call)
             SDK: checkLoginAvailable → getLoginToken → the carrier's dialog → spToken
             POST /v1/auth/onetap/verify {state, sp_token, device, invite}
             → GetPhoneWithToken → the number → Cloud.sign_in(via="onetap"); the key is
             kept under `state` for five minutes, the page gets the masked number only
             then navigates to nanomuse://onetap/done
    app      POST /v1/auth/onetap/claim {verifier} → the key and the account, once

The page never holds the key; whoever sees the URL (with `state`) cannot claim it without
`verifier`, which never leaves the app. Grants live in memory: the relay is one process.
"""

from __future__ import annotations

import collections
import hashlib
import logging
import secrets
import threading
import time

import httpx

from .config import Settings
from .identifiers import BadIdentifier, Identifier, parse
from .senders import aliyun_common_params, aliyun_signed_query
from .service import Cloud, CloudError

log = logging.getLogger("nanomuse.cloud.onetap")

ENDPOINT = "https://dypnsapi.aliyuncs.com/"
GRANT_TTL_S = 300
TOKEN_REUSE_S = 8 * 60  # AccessToken lives 10 minutes; hand the same one out for eight
STATE_RE_LEN = 64  # sha256 hex


class OneTap:
    def __init__(self, settings: Settings, cloud: Cloud, http: httpx.Client | None = None) -> None:
        self.s = settings
        self.cloud = cloud
        self.http = http or httpx.Client(timeout=15)
        self._lock = threading.Lock()
        self._grants: dict[str, tuple[float, dict]] = {}
        self._token: tuple[float, dict] | None = None
        self._ip_hits: dict[str, collections.deque[float]] = {}

    # -- what the apps ask first ------------------------------------------------------

    @property
    def enabled(self) -> bool:
        return bool(self.s.onetap_scheme and self.s.aliyun_access_key_id and self.s.aliyun_access_key_secret)

    def view(self) -> dict:
        return {"enabled": self.enabled, "sdk_url": self.s.onetap_sdk_url if self.enabled else ""}

    # -- Aliyun ------------------------------------------------------------------------

    def _rpc(self, action: str, **params: str) -> dict:
        q = aliyun_signed_query(
            self.s.aliyun_access_key_secret,
            {**aliyun_common_params(self.s.aliyun_access_key_id), "Action": action, **params},
        )
        try:
            r = self.http.get(ENDPOINT + "?" + q)
            body = r.json()
        except (httpx.HTTPError, ValueError) as e:
            log.error("onetap %s: request failed: %s", action, e)
            raise CloudError(502, "onetap_unavailable", "The carrier service did not answer") from e
        if body.get("Code") != "OK":
            # the code, never the token or the number
            log.warning("onetap %s rejected: %s %s", action, body.get("Code"), str(body.get("Message"))[:120])
            raise CloudError(502, "onetap_failed", "The carrier could not confirm the number", {"aliyun": str(body.get("Code"))})
        return body

    def token(self, ip: str) -> dict:
        """The SDK's two tokens for the page — one GetAuthToken every eight minutes at most."""
        if not self.enabled:
            raise CloudError(404, "onetap_off", "This relay does not offer sign-in with the phone's number")
        self._count(ip)
        with self._lock:
            if self._token and time.monotonic() - self._token[0] < TOKEN_REUSE_S:
                return dict(self._token[1])
        origin = self.s.public_base.rstrip("/")
        body = self._rpc(
            "GetAuthToken",
            Url=origin + "/",
            Origin=origin,
            SceneCode=self.s.onetap_scheme,
            BizType="1",
        )
        info = body.get("TokenInfo") or {}
        out = {
            "access_token": str(info.get("AccessToken") or ""),
            "jwt_token": str(info.get("JwtToken") or ""),
            "sdk_url": self.s.onetap_sdk_url,
        }
        if not out["access_token"] or not out["jwt_token"]:
            raise CloudError(502, "onetap_failed", "The carrier service gave no token")
        with self._lock:
            self._token = (time.monotonic(), out)
        return dict(out)

    def _count(self, ip: str) -> None:
        """Token requests per network: the page asks once per attempt, so this is generous."""
        if not ip:
            return
        now = time.monotonic()
        with self._lock:
            hits = self._ip_hits.setdefault(ip, collections.deque())
            while hits and now - hits[0] > 3600:
                hits.popleft()
            if len(hits) >= self.s.onetap_per_ip_hour:
                raise CloudError(429, "onetap_too_often", "Too many attempts from this network; wait an hour")
            hits.append(now)
            if len(self._ip_hits) > 5000:  # a long-running relay: forget quiet networks
                for k in [k for k, v in self._ip_hits.items() if not v or now - v[-1] > 3600]:
                    del self._ip_hits[k]

    # -- the page's result, the app's claim ---------------------------------------------

    def verify(self, state: str, sp_token: str, device: str, invite: str = "") -> dict:
        """The carrier's token becomes a signed-in device; the key waits for the app."""
        if not self.enabled:
            raise CloudError(404, "onetap_off", "This relay does not offer sign-in with the phone's number")
        if len(state) != STATE_RE_LEN or any(c not in "0123456789abcdef" for c in state):
            raise CloudError(400, "bad_state", "The page was opened without the app's state")
        if not sp_token or len(sp_token) > 2048:
            raise CloudError(400, "bad_token", "The carrier gave no token")
        body = self._rpc("GetPhoneWithToken", SpToken=sp_token)
        mobile = str((body.get("Data") or {}).get("Mobile") or "").strip()
        try:
            ident: Identifier = parse(mobile)
        except BadIdentifier as e:
            log.warning("onetap: the carrier returned something that is not a mainland number")
            raise CloudError(502, "onetap_failed", "The carrier returned no usable number") from e
        if ident.channel != "phone":
            raise CloudError(502, "onetap_failed", "The carrier returned no usable number")
        key, caller, created = self.cloud.sign_in(ident, device[:80], "onetap", invite[:32])
        reply = {"api_key": key, "created": created, **self.cloud.me(caller)}
        with self._lock:
            self._sweep()
            self._grants[state] = (time.monotonic(), reply)
        return {"ok": True, "hint": ident.hint, "created": created}

    def claim(self, verifier: str) -> dict:
        """The app's one chance at the key: the grant is gone once given or after five minutes."""
        if not verifier or len(verifier) > 256:
            raise CloudError(400, "bad_verifier", "No verifier")
        state = hashlib.sha256(verifier.encode()).hexdigest()
        with self._lock:
            self._sweep()
            item = self._grants.pop(state, None)
        if item is None:
            raise CloudError(404, "not_ready", "The sign-in has not completed, or the grant expired")
        return item[1]

    def _sweep(self) -> None:
        cutoff = time.monotonic() - GRANT_TTL_S
        for k in [k for k, (t, _) in self._grants.items() if t < cutoff]:
            del self._grants[k]


def new_verifier() -> str:
    """What an app makes before opening the page (the tests use it; the phone has its own)."""
    return secrets.token_urlsafe(32)


def state_of(verifier: str) -> str:
    return hashlib.sha256(verifier.encode()).hexdigest()
