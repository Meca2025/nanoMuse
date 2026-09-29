"""Settings, all from the environment (or a `.env` you source before starting).

Every value has a development default so `python -m nanomuse_cloud` runs on a
laptop with nothing set: codes go to the log, the database is ./data/cloud.db,
and the upstream is whatever UPSTREAM_BASE / UPSTREAM_KEY say (without a key
the proxy answers 503, but sign-up still works, which is what the app tests
need).
"""

from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass, field


@dataclass(frozen=True)
class ModelSpec:
    """One model the relay offers. `id` is what the app sees and asks for;
    `upstream` is what the provider is asked for (usually the same)."""

    id: str
    name: str
    upstream: str
    kind: str = "chat"  # chat | image | video
    input_modalities: tuple[str, ...] = ("text",)
    output_modalities: tuple[str, ...] = ("text",)
    # Charged tokens = prompt × in_mult + completion × out_mult. Multipliers let
    # a cheap model stretch the grant further than an expensive one without the
    # account holder seeing money.
    in_mult: float = 1.0
    out_mult: float = 1.0
    # Images have no token count; each one costs this many tokens of grant.
    per_image: int = 0
    # Nor do clips: each accepted video task costs this many (billed per output
    # second upstream, so this is set for the short clips the app makes).
    per_clip: int = 0
    recommended: bool = False

    def to_public(self) -> dict:
        return {
            "id": self.id,
            "object": "model",
            "name": self.name,
            "owned_by": "nanomuse-cloud",
            "architecture": {
                "input_modalities": list(self.input_modalities),
                "output_modalities": list(self.output_modalities),
            },
            "nanomuse": {
                "kind": self.kind,
                "recommended": self.recommended,
                "in_mult": self.in_mult,
                "out_mult": self.out_mult,
                "per_image": self.per_image,
                "per_clip": self.per_clip,
            },
        }


# The menu a fresh account gets. Checked against the provider's own /models
# list: qwen3.8-27b takes pictures as input (so no separate vision model),
# qwen-image-3.0-pro draws, MiniMax-H3 makes clips through the video API
# (which the provider does not list; the app probes it).
DEFAULT_MODELS: tuple[ModelSpec, ...] = (
    ModelSpec(
        id="qwen3.8-27b", name="Qwen 3.8 27B", upstream="qwen3.8-27b",
        input_modalities=("text", "image"), recommended=True,
    ),
    ModelSpec(
        id="qwen3.8-flash", name="Qwen 3.8 Flash", upstream="qwen3.8-flash",
        input_modalities=("text", "image"), in_mult=0.3, out_mult=0.3,
    ),
    ModelSpec(
        id="qwen-image-3.0-pro", name="Qwen Image 3.0 Pro", upstream="qwen-image-3.0-pro",
        kind="image", output_modalities=("image",), per_image=30_000,
    ),
    ModelSpec(
        id="MiniMax/MiniMax-H3", name="MiniMax H3 (video)", upstream="MiniMax/MiniMax-H3",
        kind="video", input_modalities=("text", "image"), output_modalities=("video",), per_clip=200_000,
    ),
)


def _env(name: str, default: str = "") -> str:
    v = os.environ.get(name)
    return default if v is None or v == "" else v


def _int(name: str, default: int) -> int:
    return int(_env(name, str(default)))


def _models_from_env() -> tuple[ModelSpec, ...]:
    raw = _env("CLOUD_MODELS")
    if not raw:
        return DEFAULT_MODELS
    out = []
    for item in json.loads(raw):
        item = dict(item)
        for k in ("input_modalities", "output_modalities"):
            if k in item:
                item[k] = tuple(item[k])
        out.append(ModelSpec(**item))
    return tuple(out)


@dataclass(frozen=True)
class Settings:
    database: str = field(default_factory=lambda: _env("CLOUD_DB", "./data/cloud.db"))
    # HMAC key for hashing phone numbers / e-mail addresses. Required outside
    # development: without it identifiers are hashed with a fixed string and
    # a leaked database would be trivially reversible for phone numbers.
    secret: str = field(default_factory=lambda: _env("CLOUD_SECRET"))
    admin_token: str = field(default_factory=lambda: _env("CLOUD_ADMIN_TOKEN"))
    # What the app should put in the provider's base URL, without /v1.
    public_base: str = field(default_factory=lambda: _env("PUBLIC_BASE", "http://127.0.0.1:8787"))

    upstream_base: str = field(default_factory=lambda: _env("UPSTREAM_BASE", "https://dashscope.aliyuncs.com/compatible-mode/v1"))
    upstream_key: str = field(default_factory=lambda: _env("UPSTREAM_KEY"))
    # DashScope's native host, for drawing (its OpenAI-compatible host has no
    # images endpoint). Same key.
    dashscope_base: str = field(default_factory=lambda: _env("DASHSCOPE_BASE", "https://dashscope.aliyuncs.com/api/v1"))
    upstream_timeout_s: float = field(default_factory=lambda: float(_env("UPSTREAM_TIMEOUT_S", "180")))
    # JSON object merged into every chat request for fields the app did not set.
    # Qwen 3.x models think by default and a one-line answer can cost a
    # thousand reasoning tokens, so the shipped default turns that off; the app
    # can still ask for it explicitly.
    chat_defaults: dict = field(default_factory=lambda: json.loads(_env("CHAT_DEFAULTS", '{"enable_thinking": false}')))

    # The grant. SIGNUP_TOKENS=0 means no ceiling at all (a private relay for a
    # few people, paid for by its operator): usage is still metered and shown,
    # nothing is refused for lack of tokens. DAILY_CAP_TOKENS=0 and
    # PER_MINUTE_REQUESTS=0 likewise switch those two checks off.
    signup_tokens: int = field(default_factory=lambda: _int("SIGNUP_TOKENS", 1_000_000))
    daily_cap_tokens: int = field(default_factory=lambda: _int("DAILY_CAP_TOKENS", 300_000))
    per_minute_requests: int = field(default_factory=lambda: _int("PER_MINUTE_REQUESTS", 30))
    max_request_bytes: int = field(default_factory=lambda: _int("MAX_REQUEST_BYTES", 6 * 1024 * 1024))

    # The hub (multi-device): one WebSocket frame may carry a file or a
    # screenshot, base64-encoded; uvicorn's own cap (--ws-max-size) must be at
    # least this. HUB_ENABLED=0 turns the hub and the console off.
    hub_enabled: bool = field(default_factory=lambda: _env("HUB_ENABLED", "1") not in ("0", "false", "no"))
    hub_frame_limit: int = field(default_factory=lambda: _int("HUB_FRAME_LIMIT", 16 * 1024 * 1024))

    code_ttl_s: int = field(default_factory=lambda: _int("CODE_TTL_S", 600))
    code_per_identifier_10m: int = field(default_factory=lambda: _int("CODE_PER_IDENTIFIER_10M", 3))
    # A private relay: only these phone numbers / e-mail addresses may sign in (comma-separated;
    # empty means anyone). Normalised like the identifiers themselves, so "139 0000 1111" works.
    allowed_identifiers: str = field(default_factory=lambda: _env("ALLOWED_IDENTIFIERS"))
    code_per_ip_hour: int = field(default_factory=lambda: _int("CODE_PER_IP_HOUR", 10))
    code_max_attempts: int = field(default_factory=lambda: _int("CODE_MAX_ATTEMPTS", 5))
    # One phone/e-mail = one grant; a second device signing in with the same
    # identifier shares the account and gets a second key, not a second grant.

    sender: str = field(default_factory=lambda: _env("CODE_SENDER", "log"))  # log | smtp | aliyun
    smtp_host: str = field(default_factory=lambda: _env("SMTP_HOST"))
    smtp_port: int = field(default_factory=lambda: _int("SMTP_PORT", 465))
    smtp_user: str = field(default_factory=lambda: _env("SMTP_USER"))
    smtp_password: str = field(default_factory=lambda: _env("SMTP_PASSWORD"))
    smtp_from: str = field(default_factory=lambda: _env("SMTP_FROM"))
    aliyun_access_key_id: str = field(default_factory=lambda: _env("ALIYUN_ACCESS_KEY_ID"))
    aliyun_access_key_secret: str = field(default_factory=lambda: _env("ALIYUN_ACCESS_KEY_SECRET"))
    aliyun_sms_sign: str = field(default_factory=lambda: _env("ALIYUN_SMS_SIGN"))
    aliyun_sms_template: str = field(default_factory=lambda: _env("ALIYUN_SMS_TEMPLATE"))

    models: tuple[ModelSpec, ...] = field(default_factory=_models_from_env)

    def model(self, model_id: str) -> ModelSpec | None:
        for m in self.models:
            if m.id == model_id:
                return m
        return None

    @property
    def unlimited(self) -> bool:
        return self.signup_tokens <= 0

    @property
    def dev_mode(self) -> bool:
        return not self.secret

    @property
    def hmac_key(self) -> bytes:
        return (self.secret or "nanomuse-cloud-dev-not-secret").encode()

    @property
    def identifier_key(self) -> bytes:
        """32 bytes for AES-GCM over the stored phone numbers / addresses,
        derived from the same secret so one value keeps the whole database."""
        return hashlib.sha256(b"nanomuse-cloud/identifier:" + self.hmac_key).digest()
