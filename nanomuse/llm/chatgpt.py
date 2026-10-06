"""The ChatGPT sign-in: the Codex OAuth flow (PKCE), the token store and refresh.

A person with a ChatGPT plan can let nanoMuse use it for chat and for the hands, the way
OpenAI's own Codex CLI does: the same client id, authorize and token URLs, scopes and
redirect; the tokens live in ``<data_dir>/chatgpt.json`` (mode 0600) and are refreshed
before they expire. The Codex backend has no image or video endpoints, so this covers chat
and vision only (contract C11). An honest word belongs next to it, printed on every login:

    OpenAI's terms cover using a ChatGPT plan inside OpenAI's own Codex; other apps have had
    this access cut off before (OpenCode, January 2026). If it stops working, an API key does.

The wire contract (CLI events, routes, the store's shape) is in the runtime team's
``CONTRACT-chatgpt.md``; the user-facing page is ``docs/configuration.md``.
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import os
import secrets
import sys
import time
from collections.abc import Awaitable, Callable
from contextlib import contextmanager
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import IO, Any
from urllib.parse import parse_qs, urlencode, urlparse

import httpx
from loguru import logger

# --------------------------------------------------------------------------- constants
CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann"
AUTHORIZE_URL = "https://auth.openai.com/oauth/authorize"
TOKEN_URL = "https://auth.openai.com/oauth/token"
REDIRECT_PORT = 1455
REDIRECT_PATH = "/auth/callback"
REDIRECT_URI = f"http://localhost:{REDIRECT_PORT}{REDIRECT_PATH}"
SCOPE = "openid profile email offline_access"
ORIGINATOR = "nanomuse"
CLAIM_PATH = "https://api.openai.com/auth"
ACCOUNT_CLAIM = "chatgpt_account_id"
PLAN_CLAIM = "chatgpt_plan_type"

RESPONSES_URL = "https://chatgpt.com/backend-api/codex/responses"
MODELS_URL = "https://chatgpt.com/backend-api/codex/models"
MODELS_CLIENT_VERSION = "99.99.99"

DEFAULT_MODEL = "gpt-5.6-sol"
BUILTIN_MODELS: tuple[str, ...] = ("gpt-5.6-sol", "gpt-5.4", "gpt-5.4-mini")
#: what the sign-in covers (the Codex backend has no image or video endpoints)
CAPABILITIES: tuple[str, ...] = ("chat", "vision")

STORE_FILE = "chatgpt.json"
#: a token this close to expiry is refreshed before it is used
REFRESH_MARGIN_S = 60
LOGIN_TIMEOUT_S = 600

HONESTY_LINE = (
    "OpenAI's terms cover using a ChatGPT plan inside OpenAI's own Codex; other apps have had "
    "this access cut off before (OpenCode, January 2026). If it stops working, an API key does."
)
HONESTY_LINE_ZH = (
    "OpenAI 的条款只允许在它自己的 Codex 里使用 ChatGPT 订阅；其他应用的这条路曾被切断过"
    "（OpenCode，2026 年 1 月）。如果哪天不能用了，API key 还能用。"
)

_PLAN_LABELS = {"plus": "ChatGPT Plus", "pro": "ChatGPT Pro", "team": "ChatGPT Team"}


def _platform() -> str:
    return sys.platform


def plan_label(plan: str) -> str:
    """``plus`` → "ChatGPT Plus"; an unknown or missing plan is just "ChatGPT"."""
    p = (plan or "").strip().lower()
    if p in _PLAN_LABELS:
        return _PLAN_LABELS[p]
    if p in ("", "free", "unknown"):
        return "ChatGPT"
    return f"ChatGPT {p.capitalize()}"


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def claims(access: str) -> dict[str, Any]:
    """The JWT's payload, decoded without verification (we only read our own claims)."""
    parts = access.split(".")
    if len(parts) < 2 or not parts[1]:
        return {}
    try:
        raw = base64.urlsafe_b64decode(parts[1] + "=" * (-len(parts[1]) % 4))
        data = json.loads(raw)
    except (ValueError, TypeError):
        return {}
    return data if isinstance(data, dict) else {}


def account_from(access: str) -> tuple[str, str]:
    """``(account_id, plan)`` from the access token's auth claim; empty when absent."""
    auth = claims(access).get(CLAIM_PATH)
    if not isinstance(auth, dict):
        return "", ""
    return str(auth.get(ACCOUNT_CLAIM) or ""), str(auth.get(PLAN_CLAIM) or "").lower()


class ChatGPTError(Exception):
    """A failure with a stable ``code`` (the CLI's ``error`` event carries it)."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


# --------------------------------------------------------------------------- the store
@dataclass
class Token:
    access: str
    refresh: str
    #: Unix seconds
    expires_at: int
    account_id: str
    plan: str = ""
    label: str = "ChatGPT"
    obtained_at: int = 0

    def expires_within(self, seconds: int) -> bool:
        return self.expires_at - int(time.time()) <= seconds

    @property
    def expires_in(self) -> int:
        return max(0, self.expires_at - int(time.time()))

    def to_dict(self) -> dict[str, Any]:
        return {"version": 1, **asdict(self)}

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Token | None:
        try:
            access = str(data["access"])
            refresh = str(data.get("refresh") or "")
            expires_at = int(data.get("expires_at") or 0)
        except (KeyError, TypeError, ValueError):
            return None
        if not access:
            return None
        plan = str(data.get("plan") or "")
        return cls(
            access=access,
            refresh=refresh,
            expires_at=expires_at,
            account_id=str(data.get("account_id") or ""),
            plan=plan,
            label=str(data.get("label") or plan_label(plan)),
            obtained_at=int(data.get("obtained_at") or 0),
        )

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> Token:
        """A token endpoint's answer (exchange or refresh) as a stored token."""
        access = str(payload.get("access_token") or "")
        if not access:
            raise ChatGPTError("exchange_failed", "the token response carries no access token")
        account_id, plan = account_from(access)
        if not account_id:
            raise ChatGPTError(
                "no_account", "the token carries no ChatGPT account; is a plan on this account?"
            )
        try:
            expires_in = int(payload.get("expires_in") or 3600)
        except (TypeError, ValueError):
            expires_in = 3600
        now = int(time.time())
        return cls(
            access=access,
            refresh=str(payload.get("refresh_token") or ""),
            expires_at=now + expires_in,
            account_id=account_id,
            plan=plan,
            label=plan_label(plan),
            obtained_at=now,
        )

    def public(self) -> dict[str, Any]:
        """What may be shown: never the tokens."""
        return {
            "label": self.label,
            "plan": self.plan,
            "account_id": self.account_id,
            "expires_at": self.expires_at,
            "expires_in": self.expires_in,
        }


class TokenStore:
    """``<data_dir>/chatgpt.json``, written 0600 on POSIX; a lock file beside it so the proxy
    and the runtime never refresh at the same time."""

    def __init__(self, path: Path):
        self.path = Path(path)

    @classmethod
    def in_dir(cls, data_dir: Path) -> TokenStore:
        return cls(Path(data_dir) / STORE_FILE)

    def load(self) -> Token | None:
        try:
            data = json.loads(self.path.read_text("utf-8"))
        except FileNotFoundError:
            return None
        except (OSError, json.JSONDecodeError) as exc:
            logger.warning("could not read {}: {}", self.path, exc)
            return None
        return Token.from_dict(data) if isinstance(data, dict) else None

    def save(self, token: Token) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(token.to_dict(), fh, ensure_ascii=False, indent=1)
        if _platform() != "win32":
            os.chmod(tmp, 0o600)
        os.replace(tmp, self.path)

    def clear(self) -> bool:
        """Remove the store; True when there was one."""
        try:
            self.path.unlink()
        except FileNotFoundError:
            return False
        for extra in (self.path.with_suffix(".tmp"), self.path.with_suffix(".lock")):
            try:
                extra.unlink()
            except OSError:
                pass
        return True

    @contextmanager
    def lock(self) -> Any:
        """An exclusive lock on ``chatgpt.lock`` (``fcntl`` on POSIX; a best effort elsewhere)."""
        self.path.parent.mkdir(parents=True, exist_ok=True)
        fh: IO[str] = open(self.path.with_suffix(".lock"), "a+", encoding="utf-8")
        locked = False
        try:
            # `sys.platform` itself, so mypy on Windows drops the fcntl branch
            if sys.platform != "win32":
                import fcntl

                fcntl.flock(fh.fileno(), fcntl.LOCK_EX)
                locked = True
            yield
        finally:
            if locked and sys.platform != "win32":
                import fcntl

                fcntl.flock(fh.fileno(), fcntl.LOCK_UN)
            fh.close()


# --------------------------------------------------------------------------- refresh
class Auth:
    """The access token for a request: the stored one, refreshed under the lock when it is
    about to expire. A refresh the server refuses (400/401) clears the store."""

    def __init__(
        self,
        store: TokenStore,
        http: httpx.AsyncClient | None = None,
        token_url: str = TOKEN_URL,
        margin_s: int = REFRESH_MARGIN_S,
    ):
        self.store = store
        self._http = http
        self.token_url = token_url
        self.margin_s = margin_s

    @property
    def http(self) -> httpx.AsyncClient:
        if self._http is None:
            self._http = httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=10.0))
        return self._http

    async def close(self) -> None:
        if self._http is not None:
            await self._http.aclose()
            self._http = None

    def signed_in(self) -> bool:
        return self.store.load() is not None

    async def token(self, force_refresh: bool = False) -> Token:
        """A usable token, or :class:`ChatGPTError` ``not_signed_in``."""
        token = self.store.load()
        if token is None:
            raise ChatGPTError("not_signed_in", "not signed in; run `nanomuse chatgpt login`")
        if not force_refresh and not token.expires_within(self.margin_s):
            return token
        return await self.refresh(token)

    async def refresh(self, current: Token | None = None) -> Token:
        current = current or self.store.load()
        if current is None:
            raise ChatGPTError("not_signed_in", "not signed in; run `nanomuse chatgpt login`")
        with self.store.lock():
            # another process may have refreshed while we waited for the lock
            latest = self.store.load()
            if latest is not None and latest.access != current.access:
                if not latest.expires_within(self.margin_s):
                    return latest
                current = latest
            if not current.refresh:
                self.store.clear()
                raise ChatGPTError("not_signed_in", "the sign-in cannot be renewed; sign in again")
            data = {
                "grant_type": "refresh_token",
                "refresh_token": current.refresh,
                "client_id": CLIENT_ID,
            }
            try:
                r = await self.http.post(
                    self.token_url,
                    data=data,
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                )
            except httpx.HTTPError as exc:
                raise ChatGPTError("network", f"could not reach the token endpoint: {exc}") from exc
            if r.status_code in (400, 401):
                self.store.clear()
                logger.warning("ChatGPT refresh refused ({}); signed out", r.status_code)
                raise ChatGPTError(
                    "not_signed_in", "ChatGPT sign-in no longer valid; run nanomuse chatgpt login"
                )
            if r.status_code != 200:
                raise ChatGPTError(
                    "refresh_failed", f"token refresh failed with HTTP {r.status_code}"
                )
            payload = r.json()
            token = Token.from_payload(payload if isinstance(payload, dict) else {})
            if not token.refresh:
                token.refresh = current.refresh
            self.store.save(token)
            logger.info("ChatGPT token refreshed ({})", token.label)
            return token


# --------------------------------------------------------------------------- login
_CALLBACK_PAGE = (
    "<!doctype html><meta charset=utf-8><title>nanoMuse</title>"
    "<body style='font-family:system-ui;margin:3em'><h2>{title}</h2><p>{text}</p></body>"
)


@dataclass
class CallbackResult:
    code: str = ""
    state: str = ""
    error: str = ""


class LoginFlow:
    """One PKCE authorization-code sign-in.

    ``url`` is what the person opens; :meth:`wait` listens on the loopback port for the
    callback (and, when a ``paste`` reader is given, reads the pasted callback URL from it,
    whichever comes first); :meth:`finish` exchanges the code and stores the token. The
    URLs and the port are parameters so tests run the whole flow against a local fake."""

    def __init__(
        self,
        store: TokenStore,
        *,
        authorize_url: str = AUTHORIZE_URL,
        token_url: str = TOKEN_URL,
        redirect_uri: str = REDIRECT_URI,
        port: int = REDIRECT_PORT,
        originator: str = ORIGINATOR,
        http: httpx.AsyncClient | None = None,
    ):
        self.store = store
        self.authorize_url = authorize_url
        self.token_url = token_url
        self.redirect_uri = redirect_uri
        self.port = port
        self.originator = originator
        self._http = http
        self.verifier = _b64url(os.urandom(32))
        self.challenge = _b64url(hashlib.sha256(self.verifier.encode("ascii")).digest())
        self.state = _b64url(secrets.token_bytes(16))
        self._server: asyncio.base_events.Server | None = None
        self._result: asyncio.Future[CallbackResult] | None = None

    @property
    def url(self) -> str:
        params = {
            "response_type": "code",
            "client_id": CLIENT_ID,
            "redirect_uri": self.redirect_uri,
            "scope": SCOPE,
            "code_challenge": self.challenge,
            "code_challenge_method": "S256",
            "state": self.state,
            "id_token_add_organizations": "true",
            "codex_cli_simplified_flow": "true",
            "originator": self.originator,
        }
        return f"{self.authorize_url}?{urlencode(params)}"

    @property
    def callback_url(self) -> str:
        return f"http://localhost:{self.port}{REDIRECT_PATH}"

    # -- the loopback listener
    async def listen(self) -> bool:
        """Bind the callback port; False when it is taken (the paste fallback remains)."""
        loop = asyncio.get_running_loop()
        self._result = loop.create_future()
        try:
            self._server = await asyncio.start_server(self._serve, "127.0.0.1", self.port)
        except OSError:
            self._server = None
            return False
        return True

    async def _serve(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        try:
            request_line = await asyncio.wait_for(reader.readline(), 10)
            while True:
                line = await asyncio.wait_for(reader.readline(), 10)
                if line in (b"\r\n", b"\n", b""):
                    break
            parts = request_line.decode("latin-1").split()
            target = parts[1] if len(parts) >= 2 else "/"
            status, body = self._handle(target)
            payload = body.encode("utf-8")
            writer.write(
                f"HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\n"
                f"Content-Length: {len(payload)}\r\nConnection: close\r\n\r\n".encode("latin-1")
                + payload
            )
            await writer.drain()
        except (TimeoutError, OSError, UnicodeDecodeError, IndexError):
            pass
        finally:
            writer.close()

    def _handle(self, target: str) -> tuple[str, str]:
        parsed = urlparse(target)
        if parsed.path != REDIRECT_PATH:
            return "404 Not Found", _CALLBACK_PAGE.format(title="Not here", text="")
        result = self._parse_callback(target)
        if self._result is not None and not self._result.done():
            self._result.set_result(result)
        if result.error:
            return "400 Bad Request", _CALLBACK_PAGE.format(
                title="Sign-in did not finish", text=result.error
            )
        if result.state != self.state:
            return "400 Bad Request", _CALLBACK_PAGE.format(
                title="Sign-in did not finish", text="The request did not match; try again."
            )
        return "200 OK", _CALLBACK_PAGE.format(
            title="Signed in", text="You can close this tab and go back to nanoMuse."
        )

    @staticmethod
    def _parse_callback(url: str) -> CallbackResult:
        qs = parse_qs(urlparse(url.strip()).query)
        return CallbackResult(
            code=(qs.get("code") or [""])[0],
            state=(qs.get("state") or [""])[0],
            error=(qs.get("error_description") or qs.get("error") or [""])[0],
        )

    async def wait(
        self,
        timeout: float = LOGIN_TIMEOUT_S,
        paste: Callable[[], Awaitable[str | None]] | None = None,
    ) -> CallbackResult:
        """The callback's code and state, from the port or from ``paste`` (an async reader
        returning one pasted line, or None when it has nothing), whichever comes first."""
        waits: set[asyncio.Future[Any]] = set()
        if self._result is not None and self._server is not None:
            waits.add(asyncio.ensure_future(self._result))
        if paste is not None:
            waits.add(asyncio.ensure_future(paste()))
        if not waits:
            raise ChatGPTError("port_busy", f"port {self.port} is in use and nothing to read from")
        deadline = time.monotonic() + timeout
        try:
            while waits:
                left = deadline - time.monotonic()
                if left <= 0:
                    break
                done, waits = await asyncio.wait(
                    waits, timeout=left, return_when=asyncio.FIRST_COMPLETED
                )
                for task in done:
                    value = task.result()
                    if isinstance(value, CallbackResult):
                        return value
                    if value:  # a pasted callback URL
                        return self._parse_callback(str(value))
                    # the paste reader had nothing (stdin closed): keep waiting on the rest
            raise ChatGPTError("timeout", "no sign-in arrived in time")
        finally:
            for task in waits:
                task.cancel()
            await self.close()

    async def close(self) -> None:
        if self._server is not None:
            self._server.close()
            try:
                await self._server.wait_closed()
            except Exception:  # pragma: no cover
                pass
            self._server = None

    # -- the exchange
    async def finish(self, result: CallbackResult) -> Token:
        """Check the state, exchange the code, store the token."""
        if result.error:
            raise ChatGPTError("cancelled", result.error)
        if not result.code:
            raise ChatGPTError("cancelled", "the callback carried no code")
        if result.state != self.state:
            raise ChatGPTError("state_mismatch", "the callback's state does not match this login")
        data = {
            "grant_type": "authorization_code",
            "client_id": CLIENT_ID,
            "code": result.code,
            "code_verifier": self.verifier,
            "redirect_uri": self.redirect_uri,
        }
        http = self._http or httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=10.0))
        try:
            r = await http.post(
                self.token_url,
                data=data,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
        except httpx.HTTPError as exc:
            raise ChatGPTError(
                "exchange_failed", f"could not reach the token endpoint: {exc}"
            ) from exc
        finally:
            if self._http is None:
                await http.aclose()
        if r.status_code != 200:
            raise ChatGPTError(
                "exchange_failed", f"token exchange failed with HTTP {r.status_code}"
            )
        payload = r.json()
        token = Token.from_payload(payload if isinstance(payload, dict) else {})
        self.store.save(token)
        logger.info("ChatGPT sign-in stored ({})", token.label)
        return token


__all__ = [
    "AUTHORIZE_URL",
    "BUILTIN_MODELS",
    "CAPABILITIES",
    "CLIENT_ID",
    "DEFAULT_MODEL",
    "HONESTY_LINE",
    "HONESTY_LINE_ZH",
    "MODELS_URL",
    "REDIRECT_PORT",
    "REDIRECT_URI",
    "RESPONSES_URL",
    "STORE_FILE",
    "TOKEN_URL",
    "Auth",
    "CallbackResult",
    "ChatGPTError",
    "LoginFlow",
    "Token",
    "TokenStore",
    "account_from",
    "claims",
    "plan_label",
]
