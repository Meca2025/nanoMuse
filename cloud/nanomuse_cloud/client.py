"""Who is at the other end of a request: the network address and the client software.

The relay keeps, next to what it already kept (sign-ins, requests, events, devices, kept
turns), the address a request came from and the user agent that made it — for the
operator's page, where every record of an account can be read, and for telling abuse
from use. Nothing else is derived from them here: no geolocation, no fingerprint.

The request layer (HTTP middleware, the hub's socket handler) sets the current
``ClientInfo`` in a context variable; the database writes read it when they add a row
that has a place for it. Code running outside a request (tests, maintenance) sees the
empty default and writes empty strings.
"""

from __future__ import annotations

from collections.abc import Mapping
from contextvars import ContextVar, Token
from dataclasses import dataclass

UA_MAX = 160
LANG_MAX = 40


@dataclass(frozen=True)
class ClientInfo:
    ip: str = ""
    ua: str = ""  # the User-Agent header, cut to UA_MAX
    lang: str = ""  # Accept-Language, cut to LANG_MAX

    @property
    def platform(self) -> str:
        return platform_of(self.ua)


_NOBODY = ClientInfo()
_current: ContextVar[ClientInfo | None] = ContextVar("nanomuse_cloud_client", default=None)


def current() -> ClientInfo:
    return _current.get() or _NOBODY


def set_current(info: ClientInfo) -> Token:
    return _current.set(info)


def reset(token: Token) -> None:
    _current.reset(token)


def from_headers(headers: Mapping[str, str], peer_host: str | None) -> ClientInfo:
    """What the proxy in front (Caddy) says the visitor's address is — the first hop of
    ``X-Forwarded-For`` — else the socket's peer; the two headers that name the client."""
    fwd = headers.get("x-forwarded-for") or ""
    ip = fwd.split(",")[0].strip() if fwd else (peer_host or "")
    return ClientInfo(
        ip=ip[:64],
        ua=(headers.get("user-agent") or "")[:UA_MAX],
        lang=(headers.get("accept-language") or "")[:LANG_MAX],
    )


def platform_of(ua: str) -> str:
    """The app behind a request, from the user agent the clients send: the Android app,
    the runtime on each system (which serves the web app, the desktop and the harness),
    a browser, or something else."""
    ua = str(ua or "")
    if ua.startswith("nanoMuse-Android"):
        return "android"
    if ua.startswith("nanoMuse/"):
        system = ua[ua.find("(") + 1 : ua.find(")")].lower() if "(" in ua and ")" in ua else ""
        return {"windows": "windows", "darwin": "macos", "linux": "linux"}.get(system, "runtime")
    if ua.startswith("Mozilla/"):
        return "browser"
    return "other"


def client_version(ua: str) -> str:
    """The version the client names in its user agent (``nanoMuse-Android/0.1.26 …``,
    ``nanoMuse/0.1.26 (linux)``), or an empty string."""
    ua = str(ua or "")
    head = ua.split(" ", 1)[0]
    if "/" in head and head.startswith("nanoMuse"):
        return head.split("/", 1)[1][:24]
    return ""
