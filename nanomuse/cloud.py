"""nanoMuse Cloud from the runtime: sign in with a code, look at the account, the models
the relay offers, and the hub's address.

The relay (``cloud/`` in this repository, ``docs/cloud.md``) is one more OpenAI-compatible
provider to the agent — ``<base_url>/v1`` with the account key — so signing in here is the
same first step the phone offers: *Sign in with e-mail — free*. The key is kept in the
vault under :data:`CLOUD_KEY`; nothing here ever shows it to the model.
"""

from __future__ import annotations

import platform
from typing import Any

import httpx

from nanomuse import __version__

CLOUD_KEY = "NANOMUSE_CLOUD_KEY"
DEFAULT_MODEL = "qwen3.8-27b"

MESSAGES = {
    "bad_identifier": "Enter an e-mail address.",
    "code_wrong": "That code is not right.",
    "code_expired": "That code has expired; ask for a new one.",
    "code_too_often": "Too many codes were sent; wait a few minutes.",
    "not_invited": "This relay is private; that address is not on its list.",
    "send_failed": "The code could not be sent; try again in a moment.",
    "bad_key": "Sign in again.",
    "out_of_tokens": "This account has used its tokens.",
    "account_disabled": "This account is disabled.",
    "model_not_offered": "That model is not offered here.",
    "rate_limited": "Too many requests; slow down a little.",
    "daily_cap": "Today's allowance is used up; more tomorrow — or invite a friend for ¥3 of credit.",
    "video_limit": "The video allowance is used up; a friend signing up with your invite code adds more clips.",
    "upstream": "The model provider did not answer.",
    "upstream_unconfigured": "nanoMuse Cloud has no model key configured.",
    "offline": "nanoMuse Cloud cannot be reached.",
    "bad_credentials": "That address and password do not match.",
    "no_password": "This account has no password yet; sign in with a code and set one under Account.",
    "locked": "Too many wrong passwords; wait a while or sign in with a code.",
    "password_short": "Use at least 8 characters.",
    "password_weak": "Choose a stronger password.",
    "password_wrong": "That is not the current password.",
    "password_required": "Enter the current password.",
    "no_session": "That sign-in is already gone.",
}


class CloudError(Exception):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message

    def describe(self) -> str:
        return MESSAGES.get(self.code, self.message or self.code)


def hub_url(base_url: str) -> str:
    base = base_url.rstrip("/")
    return base.replace("https://", "wss://", 1).replace("http://", "ws://", 1) + "/v1/hub"


def model_url(base_url: str) -> str:
    return base_url.rstrip("/") + "/v1"


def realtime_url(base_url: str) -> str:
    """The relay's call socket (``?model=`` is appended by the caller)."""
    base = base_url.rstrip("/")
    return base.replace("https://", "wss://", 1).replace("http://", "ws://", 1) + "/v1/realtime"


class CloudClient:
    """The relay's account API. One instance per relay; the key may change (sign in/out)."""

    def __init__(self, base_url: str, api_key: str = "", timeout: float = 30.0):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self._client = httpx.AsyncClient(
            timeout=timeout,
            headers={
                "User-Agent": f"nanoMuse/{__version__} ({platform.system()})",
                "Accept": "application/json",
            },
        )

    @property
    def hub_url(self) -> str:
        return hub_url(self.base_url)

    async def close(self) -> None:
        await self._client.aclose()

    async def _request(
        self, method: str, path: str, body: dict[str, Any] | None = None, token: str | None = None
    ) -> dict[str, Any]:
        headers = {}
        tok = self.api_key if token is None else token
        if tok:
            headers["Authorization"] = f"Bearer {tok}"
        try:
            response = await self._client.request(
                method, self.base_url + path, json=body, headers=headers
            )
        except httpx.TimeoutException:
            raise CloudError(0, "timeout", f"{self.base_url} did not answer in time") from None
        except httpx.HTTPError as exc:
            raise CloudError(0, "offline", f"Cannot reach {self.base_url}: {exc}") from None
        if response.status_code >= 400:
            try:
                err = response.json().get("error", {})
            except ValueError:
                err = {}
            raise CloudError(
                response.status_code,
                str(err.get("code") or f"http_{response.status_code}"),
                str(err.get("message") or response.text[:200]),
            )
        if not response.content.strip():
            return {}
        data = response.json()
        return data if isinstance(data, dict) else {"data": data}

    # ------------------------------------------------------------------ account
    async def request_code(self, identifier: str) -> None:
        await self._request("POST", "/v1/auth/code", {"identifier": identifier}, token="")

    async def verify(
        self, identifier: str, code: str, device: str, invite: str = ""
    ) -> dict[str, Any]:
        """→ ``{api_key, account{channel,hint}, tokens{…}, models[…]}``; the key is kept on
        this client from then on. ``invite`` is a friend's code; it counts for a new account
        only and the relay ignores it otherwise."""
        body: dict[str, Any] = {"identifier": identifier, "code": code, "device": device}
        if invite.strip():
            body["invite"] = invite.strip()
        data = await self._request("POST", "/v1/auth/verify", body, token="")
        key = str(data.get("api_key") or "")
        if key:
            self.api_key = key
        return data

    async def login(self, identifier: str, password: str, device: str) -> dict[str, Any]:
        """The password way in, for accounts that set one; same reply as ``verify``."""
        data = await self._request(
            "POST",
            "/v1/auth/login",
            {"identifier": identifier, "password": password, "device": device},
            token="",
        )
        key = str(data.get("api_key") or "")
        if key:
            self.api_key = key
        return data

    async def set_password(self, password: str, current: str | None = None) -> None:
        """Set or change the account password (``current`` when one exists, unless this key
        came from a code sign-in just now); an empty password with ``current`` removes it."""
        body: dict[str, Any] = {"password": password}
        if current is not None:
            body["current"] = current
        await self._request("POST", "/v1/auth/password", body)

    async def me(self) -> dict[str, Any]:
        return await self._request("GET", "/v1/me")

    async def sessions(self) -> list[dict[str, Any]]:
        data = await self._request("GET", "/v1/me/sessions")
        sessions = data.get("sessions")
        return sessions if isinstance(sessions, list) else []

    async def revoke_session(self, prefix: str) -> None:
        await self._request("DELETE", f"/v1/me/sessions/{prefix}")

    async def sign_out_all(self, everything: bool = False) -> int:
        data = await self._request("POST", "/v1/auth/sign-out-all", {"all": everything})
        if everything:
            self.api_key = ""
        return int(data.get("signed_out") or 0)

    async def events(self, limit: int = 50) -> list[dict[str, Any]]:
        data = await self._request("GET", f"/v1/me/events?limit={int(limit)}")
        events = data.get("events")
        return events if isinstance(events, list) else []

    async def sign_out(self) -> None:
        try:
            await self._request("POST", "/v1/auth/sign-out", {})
        finally:
            self.api_key = ""

    async def delete_account(self) -> None:
        try:
            await self._request("POST", "/v1/auth/delete", {})
        finally:
            self.api_key = ""

    async def devices(self) -> list[dict[str, Any]]:
        data = await self._request("GET", "/v1/devices")
        devices = data.get("devices")
        return devices if isinstance(devices, list) else []

    async def models(self) -> list[dict[str, Any]]:
        data = await self._request("GET", "/v1/models")
        models = data.get("data")
        return models if isinstance(models, list) else []

    @staticmethod
    def recommended_model(models: list[dict[str, Any]]) -> str:
        """The relay's recommended chat model, else the default when it is offered, else the
        first chat model."""
        chat = [
            m
            for m in models
            if (m.get("architecture") or {}).get("output_modalities", ["text"]) == ["text"]
        ]
        for m in chat:
            if (m.get("nanomuse") or {}).get("recommended"):
                return str(m["id"])
        if any(m.get("id") == DEFAULT_MODEL for m in chat):
            return DEFAULT_MODEL
        return str(chat[0]["id"]) if chat else DEFAULT_MODEL


__all__ = [
    "CLOUD_KEY",
    "DEFAULT_MODEL",
    "MESSAGES",
    "CloudClient",
    "CloudError",
    "hub_url",
    "model_url",
]
