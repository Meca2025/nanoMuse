"""Waking a kept Muse only for its owner.

A slept account container (accounts.py) is started again when a request on its host proves
the account's token — the way the runtime itself accepts requests: ``Authorization: Bearer``,
the socket's first ``{"kind": "auth"}`` frame, a signed inline link (``?exp=&sig=``, see
``nanomuse/server/tickets.py``; the signature is checked here with the same recipe), or the
legacy ``?token=``. Anyone can type the address; only the person has the token, so only the
person can make the box spend a container on it.

A browser arriving with nothing but the address (the page itself carries no token; a
bookmark, say) gets ``WAKE_PAGE``: a few lines that take the token from the link's fragment
or from the app's own storage on this origin and ask ``POST /__wake`` with it, then reload.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import secrets
import time
from collections.abc import Callable

from starlette.requests import Request

Proof = Callable[[str], bool]

# the runtime's signed links (nanomuse/server/tickets.py): the same numbers
TICKET_MAX_AHEAD_S = 13 * 3600
TICKET_SIG_HEX = 32


def ticket_ok(
    token: str, path: str, exp: str | None, sig: str | None, now: float | None = None
) -> bool:
    if not exp or not sig or not exp.isdigit() or len(sig) != TICKET_SIG_HEX:
        return False
    now = time.time() if now is None else now
    when = int(exp)
    if when <= now or when > now + TICKET_MAX_AHEAD_S:
        return False
    mac = hmac.new(token.encode(), f"{when}\n{path}".encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(mac[:TICKET_SIG_HEX].encode(), sig.encode())


def proof_from_token(given: str | None) -> Proof | None:
    """``proves`` for a token in hand (a socket's first frame, a legacy query)."""
    if not given:
        return None
    return lambda token: secrets.compare_digest(given.encode(), token.encode())


def proof_from_http(request: Request) -> Proof:
    """``proves`` for an HTTP request: the bearer header, a signed link or ``?token=``."""
    auth = request.headers.get("authorization", "")
    bearer = auth[7:].strip() if auth.lower().startswith("bearer ") else ""
    legacy = request.query_params.get("token", "")
    exp, sig = request.query_params.get("exp"), request.query_params.get("sig")
    path = request.url.path

    def proves(token: str) -> bool:
        if bearer and secrets.compare_digest(bearer.encode(), token.encode()):
            return True
        if legacy and secrets.compare_digest(legacy.encode(), token.encode()):
            return True
        return bool(exp and sig) and ticket_ok(token, path, exp, sig)

    return proves


def token_from_first_frame(text: str | None) -> str | None:
    """The token in the socket's first frame — ``{"kind": "auth", "token": "…"}`` — or None."""
    if not text:
        return None
    try:
        data = json.loads(text)
    except ValueError:
        return None
    if not isinstance(data, dict) or data.get("kind") != "auth":
        return None
    token = data.get("token")
    return token if isinstance(token, str) and token else None


WAKE_PAGE = """<!doctype html><meta charset="utf-8"><title>nanoMuse</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
font:15px/1.5 system-ui,sans-serif;color:#1b1730;background:#f4f3fa;text-align:center;padding:24px">
<div><div style="font-size:40px">🐉</div><p id="m" style="margin:12px 0 4px;font-weight:600">Waking your Muse…</p>
<p id="s" style="margin:0;color:#6b6880">A few seconds.</p></div>
<script>
(async () => {
  const m = document.getElementById("m"), s = document.getElementById("s");
  const fromHash = (location.hash.slice(1).split("&").find((p) => p.startsWith("token=")) || "").slice(6);
  const token = fromHash || localStorage.getItem("nanomuse_token") || "";
  const signin = "__SIGNIN__";
  const again = (why) => {
    m.textContent = why;
    s.innerHTML = 'Sign in again at <a href="' + signin + '">' + signin.replace(/^https?:\\/\\//, "") + "</a>.";
  };
  if (!token) return again("Open your Muse from where you signed in.");
  try {
    const r = await fetch("/__wake", { method: "POST", headers: { Authorization: "Bearer " + token } });
    if (r.ok) return location.reload();
    const body = await r.json().catch(() => ({}));
    if (r.status === 401) return again(body.message || "That link is no longer yours.");
    m.textContent = body.message || "Could not wake your Muse.";
    s.textContent = "Try again in a moment.";
  } catch (e) {
    m.textContent = "Could not reach nanoMuse.";
    s.textContent = "Try again in a moment.";
  }
})();
</script></body>"""


def wake_page(signin_url: str) -> str:
    return WAKE_PAGE.replace("__SIGNIN__", signin_url)
