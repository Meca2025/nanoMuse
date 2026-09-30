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
import math
import os
from dataclasses import dataclass, field


@dataclass(frozen=True)
class ModelSpec:
    """One model the relay offers. `id` is what the app sees and asks for;
    `upstream` is what the provider is asked for (usually the same)."""

    id: str
    name: str
    upstream: str
    kind: str = "chat"  # chat | image | video | realtime
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
    # What the provider bills the operator, in yuan — the list price of the
    # Beijing region unless CLOUD_MODELS says otherwise. Chat: per million
    # tokens in and out (one yuan per million tokens is one micro-yuan per
    # token, which is how the ledger stores money). Images: per picture, the
    # 2k tier for anything wider than 1k. Video: per output second.
    price_in: float = 0.0
    price_out: float = 0.0
    price_image: float = 0.0
    price_image_2k: float = 0.0
    price_second: float = 0.0
    # The clip length when the app does not say (`parameters.duration` absent):
    # Wan 2.2 always makes five seconds, MiniMax four at the least.
    clip_seconds: float = 4.0
    # Real-time (a call): the provider counts audio and picture frames as their
    # own kinds of token, priced apart from text. Per million tokens, as above;
    # `price_in` / `price_out` stay the text prices. Audio tokens weigh more on
    # the grant too (the multipliers), so the token view stays roughly honest.
    price_audio_in: float = 0.0
    price_audio_out: float = 0.0
    price_image_in: float = 0.0
    audio_in_mult: float = 1.0
    audio_out_mult: float = 1.0

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
                "clip_seconds": self.clip_seconds,
                "price_cny": {
                    "per_m_input": self.price_in,
                    "per_m_output": self.price_out,
                    "per_image": self.price_image,
                    "per_image_2k": self.price_image_2k,
                    "per_second": self.price_second,
                    "per_m_audio_in": self.price_audio_in,
                    "per_m_audio_out": self.price_audio_out,
                    "per_m_image_in": self.price_image_in,
                },
            },
        }

    # -- what one request costs, in micro-yuan (1e-6 CNY; integers in the ledger) --

    def chat_cost_uy(self, prompt_tokens: int, completion_tokens: int) -> int:
        return round(max(0, prompt_tokens) * self.price_in + max(0, completion_tokens) * self.price_out)

    def image_cost_uy(self, size: str | None = None) -> int:
        price = self.price_image
        if self.price_image_2k and size and _max_side(size) > 1400:
            price = self.price_image_2k
        return round(price * 1_000_000)

    def video_cost_uy(self, seconds: float) -> int:
        return round(max(0.0, seconds) * self.price_second * 1_000_000)

    def realtime_cost_uy(self, u: RealtimeUsage) -> int:
        """One answer of a call, from the provider's `response.done` usage. Text
        and pictures in at their rates, audio in and out at theirs; the text the
        model speaks alongside its audio is not billed by the provider."""
        image_price = self.price_image_in or self.price_in
        text_out = u.text_out if u.audio_out == 0 else 0
        return round(
            u.text_in * self.price_in
            + u.audio_in * (self.price_audio_in or self.price_in)
            + u.image_in * image_price
            + text_out * self.price_out
            + u.audio_out * (self.price_audio_out or self.price_out)
        )

    def realtime_charged(self, u: RealtimeUsage) -> int:
        return math.ceil(
            (u.text_in + u.image_in) * self.in_mult
            + u.audio_in * self.audio_in_mult
            + u.text_out * self.out_mult
            + u.audio_out * self.audio_out_mult
        )


@dataclass(frozen=True)
class RealtimeUsage:
    """The token counts of one real-time answer, by kind, as the provider
    reports them in `response.done` (`usage.input_token_details` /
    `usage.output_token_details`)."""

    text_in: int = 0
    audio_in: int = 0
    image_in: int = 0
    text_out: int = 0
    audio_out: int = 0

    @property
    def input_tokens(self) -> int:
        return self.text_in + self.audio_in + self.image_in

    @property
    def output_tokens(self) -> int:
        return self.text_out + self.audio_out

    def to_json(self) -> dict:
        return {"text_in": self.text_in, "audio_in": self.audio_in, "image_in": self.image_in, "text_out": self.text_out, "audio_out": self.audio_out}

    @classmethod
    def from_response_done(cls, event: dict) -> RealtimeUsage | None:
        resp = event.get("response") if isinstance(event, dict) else None
        u = resp.get("usage") if isinstance(resp, dict) else None
        if not isinstance(u, dict):
            return None

        def n(*path) -> int:
            cur = u
            for p in path:
                cur = cur.get(p) if isinstance(cur, dict) else None
            try:
                return max(0, int(cur or 0))
            except (TypeError, ValueError):
                return 0

        text_in = n("input_token_details", "text_tokens")
        audio_in = n("input_token_details", "audio_tokens")
        image_in = n("input_token_details", "image_tokens")
        text_out = n("output_token_details", "text_tokens")
        audio_out = n("output_token_details", "audio_tokens")
        if text_in + audio_in + image_in == 0:
            text_in = n("input_tokens")
        if text_out + audio_out == 0:
            text_out = n("output_tokens")
        return cls(text_in, audio_in, image_in, text_out, audio_out)


def _max_side(size: str) -> int:
    """The longer side of "1024x1024" / "1664*928"; 0 when unreadable."""
    try:
        parts = [int(p) for p in size.lower().replace("*", "x").split("x")[:2]]
    except ValueError:
        return 0
    return max(parts) if parts else 0


# The menu a fresh account gets. Checked against the provider's own /models
# list: qwen3.8-27b takes pictures as input (so no separate vision model),
# qwen-image-3.0 draws, Wan 2.2 makes clips through the video API (which the
# provider does not list; the app probes it). Prices are the provider's
# Beijing list prices (help.aliyun.com/zh/model-studio/model-pricing, 2026-09):
# 27B ¥3 / ¥12 per million tokens, Flash ¥0.8 / ¥2.7, qwen-image-3.0 ¥0.18 a
# picture at 1k and 2k alike (the Pro tier is ¥0.25 / ¥0.5), wan2.2-i2v-flash
# ¥0.10 a second at 480P for a fixed five seconds (MiniMax-H3, the 0.3 default,
# was ¥0.5 a second: a new face cost ¥8 in clips, now ¥2). wan2.2-t2v-plus is
# the sibling the app asks for when a clip starts from words: ¥0.14 a second.
DEFAULT_MODELS: tuple[ModelSpec, ...] = (
    ModelSpec(
        id="qwen3.8-27b", name="Qwen 3.8 27B", upstream="qwen3.8-27b",
        input_modalities=("text", "image"), recommended=True,
        price_in=3.0, price_out=12.0,
    ),
    ModelSpec(
        id="qwen3.8-flash", name="Qwen 3.8 Flash", upstream="qwen3.8-flash",
        input_modalities=("text", "image"), in_mult=0.3, out_mult=0.3,
        price_in=0.8, price_out=2.7,
    ),
    ModelSpec(
        id="qwen-image-3.0", name="Qwen Image 3.0", upstream="qwen-image-3.0",
        kind="image", output_modalities=("image",), per_image=30_000, recommended=True,
        price_image=0.18, price_image_2k=0.18,
    ),
    ModelSpec(
        id="wan2.2-i2v-flash", name="Wan 2.2 Flash (video)", upstream="wan2.2-i2v-flash",
        kind="video", input_modalities=("text", "image"), output_modalities=("video",), per_clip=200_000,
        recommended=True, price_second=0.10, clip_seconds=5.0,
    ),
    ModelSpec(
        id="wan2.2-t2v-plus", name="Wan 2.2 Plus (video from words)", upstream="wan2.2-t2v-plus",
        kind="video", input_modalities=("text",), output_modalities=("video",), per_clip=200_000,
        price_second=0.14, clip_seconds=5.0,
    ),
    # Calls: Qwen Omni real-time, over the provider's OpenAI-shaped WebSocket.
    # Hears and speaks (16 kHz in, 24 kHz out), sees camera frames at 1 fps.
    # Prices are the Beijing list (2026-09): Flash ¥3.3 text/picture in,
    # ¥27 audio in, ¥20 text out, ¥107 audio out per million tokens; a second
    # of speech is about 25 tokens, so an hour of talking both ways is a few
    # yuan. The 3.8 generation is priced the same until the list says otherwise.
    ModelSpec(
        id="qwen3.5-omni-flash-realtime", name="Qwen 3.5 Omni Flash (realtime)", upstream="qwen3.5-omni-flash-realtime",
        kind="realtime", input_modalities=("text", "audio", "image"), output_modalities=("text", "audio"),
        recommended=True, price_in=3.3, price_out=20.0, price_audio_in=27.0, price_audio_out=107.0, price_image_in=3.3,
        audio_in_mult=8.0, audio_out_mult=8.0,
    ),
    ModelSpec(
        id="qwen3.8-omni-flash-realtime", name="Qwen 3.8 Omni Flash (realtime)", upstream="qwen3.8-omni-flash-realtime",
        kind="realtime", input_modalities=("text", "audio", "image"), output_modalities=("text", "audio"),
        price_in=3.3, price_out=20.0, price_audio_in=27.0, price_audio_out=107.0, price_image_in=3.3,
        audio_in_mult=8.0, audio_out_mult=8.0,
    ),
)


# Ids older app builds still send, and what answers them now. Video is not
# aliased: a MiniMax-shaped request body does not fit Wan, and the app's probe
# simply finds the old model gone and stops animating.
LEGACY_MODEL_IDS: dict[str, str] = {"qwen-image-3.0-pro": "qwen-image-3.0"}


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
    # The provider's real-time (call) socket, OpenAI Realtime-shaped; `?model=`
    # is appended. Same key. REALTIME_ENABLED=0 switches calls off.
    realtime_base: str = field(default_factory=lambda: _env("UPSTREAM_REALTIME_BASE", "wss://dashscope.aliyuncs.com/api-ws/v1/realtime"))
    realtime_enabled: bool = field(default_factory=lambda: _env("REALTIME_ENABLED", "1") not in ("0", "false", "no"))
    # A call may run this long before the relay hangs up (the provider's own
    # ceiling is two hours); the budget is re-checked after every answer.
    realtime_max_s: int = field(default_factory=lambda: _int("REALTIME_MAX_S", 3600))
    upstream_timeout_s: float = field(default_factory=lambda: float(_env("UPSTREAM_TIMEOUT_S", "180")))
    # JSON object merged into every chat request for fields the app did not set.
    # Qwen 3.x models think by default and a one-line answer can cost a
    # thousand reasoning tokens, so the shipped default turns that off; the app
    # can still ask for it explicitly.
    chat_defaults: dict = field(default_factory=lambda: json.loads(_env("CHAT_DEFAULTS", '{"enable_thinking": false}')))

    # The token grant, the older allowance. SIGNUP_TOKENS=0 (the default since
    # the money cap below took over) means no token ceiling: usage is still
    # metered and shown, nothing is refused for lack of tokens. DAILY_CAP_TOKENS=0
    # and PER_MINUTE_REQUESTS=0 likewise switch those two checks off.
    signup_tokens: int = field(default_factory=lambda: _int("SIGNUP_TOKENS", 0))
    daily_cap_tokens: int = field(default_factory=lambda: _int("DAILY_CAP_TOKENS", 0))
    per_minute_requests: int = field(default_factory=lambda: _int("PER_MINUTE_REQUESTS", 30))
    max_request_bytes: int = field(default_factory=lambda: _int("MAX_REQUEST_BYTES", 6 * 1024 * 1024))

    # The hub (multi-device): one WebSocket frame may carry a file or a
    # screenshot, base64-encoded; uvicorn's own cap (--ws-max-size) must be at
    # least this. HUB_ENABLED=0 turns the hub and the console off.
    hub_enabled: bool = field(default_factory=lambda: _env("HUB_ENABLED", "1") not in ("0", "false", "no"))
    hub_frame_limit: int = field(default_factory=lambda: _int("HUB_FRAME_LIMIT", 16 * 1024 * 1024))

    # Money. Everyone who signs in may spend DAILY_CAP_CNY yuan of the
    # operator's provider bill a day (0 = no cap), counted at the list prices
    # above across chat, pictures and clips; the members below are exempt.
    # The day turns at midnight in the DAY_OFFSET_H time zone (8 = Beijing).
    # USD_CNY is for display only: the apps show both currencies.
    daily_cap_cny: float = field(default_factory=lambda: float(_env("DAILY_CAP_CNY", "15")))
    day_offset_h: int = field(default_factory=lambda: _int("DAY_OFFSET_H", 8))
    usd_cny: float = field(default_factory=lambda: float(_env("USD_CNY", "7.1")))
    # Invitations. Every account has a code; a person who signs up with it
    # earns the inviter INVITE_BONUS_CNY of credit — money spent only once the
    # day's cap is used up, and never expiring — plus VIDEO_CLIPS_PER_INVITE
    # more clips. The operator can grant credit too (issues, pull requests).
    # INVITE_URL is the link the apps offer to share; the code is appended.
    invite_bonus_cny: float = field(default_factory=lambda: float(_env("INVITE_BONUS_CNY", "3")))
    invite_url: str = field(default_factory=lambda: _env("INVITE_URL", "https://nanomuse.cn/web/?invite="))
    # Video is the expensive part: an account may make VIDEO_CLIPS_FREE clips
    # in all (4 = one animated face, the app's four moods), plus what invites
    # and the operator add. 0 = no limit. Members have none.
    video_clips_free: int = field(default_factory=lambda: _int("VIDEO_CLIPS_FREE", 4))
    video_clips_per_invite: int = field(default_factory=lambda: _int("VIDEO_CLIPS_PER_INVITE", 4))

    code_ttl_s: int = field(default_factory=lambda: _int("CODE_TTL_S", 600))
    code_per_identifier_10m: int = field(default_factory=lambda: _int("CODE_PER_IDENTIFIER_10M", 3))
    # Passwords are optional on top of the code: someone who set one may sign
    # in with it on a new device without waiting for a message. After this
    # many wrong tries in a row the password is locked for LOCKOUT_S seconds
    # (a code still works, and setting a new password clears the lock).
    password_min_len: int = field(default_factory=lambda: _int("PASSWORD_MIN_LEN", 8))
    password_max_attempts: int = field(default_factory=lambda: _int("PASSWORD_MAX_ATTEMPTS", 5))
    lockout_s: int = field(default_factory=lambda: _int("LOCKOUT_S", 900))
    # How long after a code sign-in a password may be set without the old one
    # (the "forgot my password" path: sign in with a code, set a new one).
    password_reset_window_s: int = field(default_factory=lambda: _int("PASSWORD_RESET_WINDOW_S", 1800))
    # Members: phone numbers / e-mail addresses (comma-separated) that have no
    # daily cap — the operator and friends. Normalised like the identifiers
    # themselves, so "139 0000 1111" works. With SIGNUP_OPEN=0 the relay is
    # private and only members may sign in at all (the pre-release behaviour).
    allowed_identifiers: str = field(default_factory=lambda: _env("ALLOWED_IDENTIFIERS"))
    signup_open: bool = field(default_factory=lambda: _env("SIGNUP_OPEN", "1") not in ("0", "false", "no"))
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
        # Phones from before 0.4 still ask for the model the menu used to carry;
        # same API shape, so the cheaper sibling answers in its place.
        alias = LEGACY_MODEL_IDS.get(model_id)
        if alias and alias != model_id:
            return self.model(alias)
        return None

    @property
    def unlimited(self) -> bool:
        return self.signup_tokens <= 0

    def day_start(self, t: int) -> int:
        """The start (as a UNIX time) of the local day `t` falls in."""
        off = self.day_offset_h * 3600
        return t - ((t + off) % 86400)

    def uy_to_cny(self, uy: int) -> float:
        return round(uy / 1_000_000, 4)

    def cny_to_usd(self, cny: float) -> float:
        return round(cny / self.usd_cny, 4) if self.usd_cny > 0 else 0.0

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
