"""One call to nanoMuse Cloud's relay, the way the gateway makes them.

Shared by the kept Muses (accounts.py) and the visitors' sign-in (visitors.py): the
visitor's address goes along as ``X-Forwarded-For`` — and, when given, the browser string as
``User-Agent`` — so the relay's own rate limits and records see the person and not the
gateway, and the relay's refusals come back with their own code and message, for the page to
show in the visitor's language. For the header to arrive as sent, the gateway must reach the
relay directly (``WEB_RELAY_URL=http://nanomuse-relay:8787`` on the shared Docker network):
Caddy in front of the public name replaces ``X-Forwarded-For`` from a client it does not
trust with that client's own address, and the relay would see the gateway.
"""

from __future__ import annotations

from typing import Any

import httpx

from .sessions import Refused


class RelayError(Refused):
    """The relay said no; passed to the browser with the relay's own code and message."""


async def relay_request(
    http: httpx.AsyncClient,
    base_url: str,
    method: str,
    path: str,
    body: dict | None,
    ip: str,
    key: str = "",
    ua: str = "",
) -> Any:
    headers = {"Content-Type": "application/json", "X-Forwarded-For": ip}
    if ua:
        headers["User-Agent"] = ua[:200]
    if key:
        headers["Authorization"] = f"Bearer {key}"
    try:
        r = await http.request(method, f"{base_url}{path}", json=body, headers=headers)
    except httpx.HTTPError as exc:
        raise Refused(
            502, "relay_unreachable", "nanoMuse Cloud is not reachable right now."
        ) from exc
    if r.status_code >= 400:
        try:
            err = r.json().get("error", {})
        except ValueError:
            err = {}
        raise RelayError(
            r.status_code if r.status_code < 500 else 502,
            str(err.get("code") or "relay_error"),
            str(err.get("message") or "nanoMuse Cloud refused the request."),
        )
    if r.status_code == 204 or not r.content:
        return {}
    return r.json()
