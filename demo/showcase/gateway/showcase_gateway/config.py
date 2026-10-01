"""Settings, all from the environment (see ``../.env.example``)."""

from __future__ import annotations

import os
from dataclasses import dataclass
from urllib.parse import urlparse

# Model providers a visitor may point their own key at. Anything else is refused so that the
# gateway cannot be used to reach arbitrary hosts from the server.
DEFAULT_BYOK_HOSTS = (
    "dashscope.aliyuncs.com",
    "maas.aliyuncs.com",  # 百炼 dedicated endpoints: <id>.<region>.maas.aliyuncs.com
    "api.deepseek.com",
    "api.openai.com",
    "open.bigmodel.cn",
    "api.moonshot.cn",
    "api.siliconflow.cn",
    "ark.cn-beijing.volces.com",
    "api.minimax.chat",
    "openrouter.ai",
    "api.anthropic.com",
    "generativelanguage.googleapis.com",
    "api.groq.com",
    "api.mistral.ai",
)


def _str(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def _int(name: str, default: int) -> int:
    raw = _str(name)
    return int(raw) if raw else default


def _float(name: str, default: float) -> float:
    raw = _str(name)
    return float(raw) if raw else default


def _bool(name: str, default: bool) -> bool:
    raw = _str(name).lower()
    if not raw:
        return default
    return raw in ("1", "true", "yes", "on")


@dataclass(frozen=True)
class Lane:
    """One upstream model: the main one, or the one that operates the phone."""

    provider: str  # "openai" (chat completions) or "openai_responses"
    model: str
    base_url: str
    api_key: str

    @property
    def configured(self) -> bool:
        return bool(self.model and self.base_url and self.api_key)


TEXT_ONLY_FAMILIES = ("deepseek",)
SIGHTED_FALLBACK = "qwen3.8-27b"


def sighted_default(main_model: str) -> str:
    """The operator lane's model when ``GUI_MODEL`` is not set.

    Hands reads a screenshot at every step, so the lane needs a model that takes images. The
    main lane's model serves when it does; a text-only family (DeepSeek) falls back to Model
    Studio's sighted ``qwen3.8-27b`` on the same host and key.
    """
    family = main_model.lower()
    if any(family.startswith(prefix) for prefix in TEXT_ONLY_FAMILIES):
        return SIGHTED_FALLBACK
    return main_model


@dataclass(frozen=True)
class Settings:
    # --- how the outside reaches us
    public_scheme: str
    site_host: str
    session_domain: str  # sessions live at <id>.<session_domain>
    public_port: str  # "" on 80/443; ":8000" in development
    listen_host: str
    listen_port: int
    trust_proxy: bool  # take the visitor's address from X-Forwarded-For (set by Caddy)
    # development only — in production Caddy serves both
    site_dir: str  # the built MobileGym
    cdn_dir: str  # MobileGym's companion dataset, for /cdn/*

    # --- the containers
    sessions_network: str
    image: str
    internal_url: str  # how a container reaches this gateway; "" → the network's gateway address
    container_port: int
    memory: str
    cpus: str
    pids: int
    extra_env: dict[str, str]

    # --- session policy
    session_ttl_s: int
    idle_ttl_s: int
    start_timeout_s: int
    max_sessions: int
    per_ip_active: int
    per_ip_daily: int

    # --- the models and their budget
    main: Lane
    gui: Lane
    session_requests: int
    session_tokens: int
    daily_requests: int
    daily_tokens: int
    byok_enabled: bool
    byok_hosts: tuple[str, ...]

    # --- pictures for a new look of the Muse (images.py); image_model "" → none drawn here
    image_model: str
    image_api_key: str
    image_base_url: str  # Model Studio's native API root
    image_per_session: int
    daily_images: int
    # --- clips of the chosen face (clips.py); video_model "" → stills only
    video_model: str
    video_api_key: str
    video_base_url: str  # Model Studio's native API root
    clips_per_session: int
    daily_clips: int

    # --- trial credentials for the phone app (see trials.py)
    trial_enabled: bool
    trial_db: str
    trial_tokens: int  # lifetime budget of one trial
    trial_per_ip_daily: int  # new trials per address per day
    trial_daily_new: int  # new trials per day, all told
    trial_daily_tokens: int  # what all trials together may spend in a day
    trial_rpm: int  # requests per minute per trial

    # nanoMuse Web: a kept Muse per Cloud account (accounts.py)
    web_enabled: bool
    web_relay_url: str  # the relay as the gateway calls it for sign-in
    web_relay_internal_url: str  # the relay as the containers reach it (same Docker network)
    web_network: str  # a network with a way out, shared with the relay
    web_db: str
    web_image: str  # "" → the showcase image
    web_max_accounts: int
    web_max_running: int
    web_idle_stop_s: int
    web_memory: str
    web_cpus: str
    web_device_name: str
    web_slug_salt: str

    @classmethod
    def from_env(cls) -> Settings:
        main = Lane(
            provider=_str("MAIN_PROVIDER", "openai"),
            model=_str("MAIN_MODEL", "deepseek-v4-pro"),
            base_url=_str("MAIN_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1"),
            api_key=_str("MAIN_API_KEY"),
        )
        gui = Lane(
            provider=_str("GUI_PROVIDER", main.provider),
            model=_str("GUI_MODEL", sighted_default(main.model)),
            base_url=_str("GUI_BASE_URL", main.base_url),
            api_key=_str("GUI_API_KEY", main.api_key),
        )
        extra: dict[str, str] = {}
        for item in _str("SESSION_EXTRA_ENV").split(","):
            if "=" in item:
                key, _, value = item.partition("=")
                extra[key.strip()] = value.strip()
        hosts = tuple(h.strip().lower() for h in _str("BYOK_ALLOWED_HOSTS").split(",") if h.strip())
        # the Muse's new looks are drawn with qwen-image on Model Studio; on by itself when the
        # demo key is a Model Studio key (the same key draws), else only when IMAGE_MODEL says so
        main_host = (urlparse(main.base_url).hostname or "").lower()
        on_model_studio = main_host.endswith("aliyuncs.com")
        return cls(
            public_scheme=_str("PUBLIC_SCHEME", "https"),
            site_host=_str("SITE_HOST", "localhost"),
            session_domain=_str("SESSION_DOMAIN", "s.localhost"),
            public_port=_str("PUBLIC_PORT"),
            listen_host=_str("LISTEN_HOST", "0.0.0.0"),
            listen_port=_int("LISTEN_PORT", 8000),
            trust_proxy=_bool("TRUST_PROXY", True),
            site_dir=_str("SITE_DIR"),
            cdn_dir=_str("CDN_DIR"),
            sessions_network=_str("SESSIONS_NETWORK", "nanomuse-sessions"),
            image=_str("NANOMUSE_IMAGE", "ghcr.io/nano-muse/nanomuse:latest"),
            internal_url=_str("INTERNAL_URL"),
            container_port=_int("CONTAINER_PORT", 8787),
            memory=_str("CONTAINER_MEMORY", "512m"),
            cpus=_str("CONTAINER_CPUS", "1"),
            pids=_int("CONTAINER_PIDS", 256),
            extra_env=extra,
            session_ttl_s=_int("SESSION_TTL_S", 1800),
            idle_ttl_s=_int("IDLE_TTL_S", 600),
            start_timeout_s=_int("START_TIMEOUT_S", 40),
            max_sessions=_int("MAX_SESSIONS", 20),
            per_ip_active=_int("PER_IP_ACTIVE", 1),
            per_ip_daily=_int("PER_IP_DAILY", 6),
            main=main,
            gui=gui,
            session_requests=_int("SESSION_LLM_REQUESTS", 60),
            session_tokens=_int("SESSION_LLM_TOKENS", 300_000),
            daily_requests=_int("DAILY_LLM_REQUESTS", 3000),
            daily_tokens=_int("DAILY_LLM_TOKENS", 6_000_000),
            byok_enabled=_bool("BYOK_ENABLED", True),
            byok_hosts=hosts or DEFAULT_BYOK_HOSTS,
            image_model=_str("IMAGE_MODEL", "qwen-image-3.0" if on_model_studio else ""),
            image_api_key=_str("IMAGE_API_KEY", main.api_key),
            image_base_url=_str("IMAGE_BASE_URL", "https://dashscope.aliyuncs.com/api/v1"),
            image_per_session=_int("IMAGE_PER_SESSION", 12),
            daily_images=_int("DAILY_IMAGES", 400),
            video_model=_str("VIDEO_MODEL", "wan2.2-i2v-flash" if on_model_studio else ""),
            video_api_key=_str("VIDEO_API_KEY", _str("IMAGE_API_KEY", main.api_key)),
            video_base_url=_str(
                "VIDEO_BASE_URL", _str("IMAGE_BASE_URL", "https://dashscope.aliyuncs.com/api/v1")
            ),
            clips_per_session=_int("CLIPS_PER_SESSION", 4),
            daily_clips=_int("DAILY_CLIPS", 120),
            trial_enabled=_bool("TRIAL_ENABLED", False),
            trial_db=_str("TRIAL_DB", "/data/trials.db"),
            trial_tokens=_int("TRIAL_TOKENS", 1_000_000),
            trial_per_ip_daily=_int("TRIAL_PER_IP_DAILY", 5),
            trial_daily_new=_int("TRIAL_DAILY_NEW", 200),
            trial_daily_tokens=_int("TRIAL_DAILY_TOKENS", 20_000_000),
            trial_rpm=_int("TRIAL_RPM", 30),
            web_enabled=_bool("WEB_ENABLED", False),
            web_relay_url=_str("WEB_RELAY_URL", "https://cloud.nanomuse.cn").rstrip("/"),
            web_relay_internal_url=_str(
                "WEB_RELAY_INTERNAL_URL", "http://nanomuse-relay:8787"
            ).rstrip("/"),
            web_network=_str("WEB_NETWORK", "nanomuse-web"),
            web_db=_str("WEB_DB", "/data/web.db"),
            web_image=_str("WEB_IMAGE"),
            web_max_accounts=_int("WEB_MAX_ACCOUNTS", 60),
            web_max_running=_int("WEB_MAX_RUNNING", 12),
            web_idle_stop_s=_int("WEB_IDLE_STOP_S", 6 * 3600),
            web_memory=_str("WEB_CONTAINER_MEMORY", "640m"),
            web_cpus=_str("WEB_CONTAINER_CPUS", "1"),
            web_device_name=_str("WEB_DEVICE_NAME", "Web"),
            web_slug_salt=_str("WEB_SLUG_SALT", "nanomuse-web"),
        )

    def session_origin(self, sid: str) -> str:
        return f"{self.public_scheme}://{sid}.{self.session_domain}{self.public_port}"

    def site_origin(self) -> str:
        """The showcase site itself — the phone in the browser."""
        return f"{self.public_scheme}://{self.site_host}{self.public_port}"

    def trial_base_url(self, trial_id: str, lane: str = "main") -> str:
        """Where a phone points its OpenAI-compatible client for a trial."""
        return (
            f"{self.public_scheme}://{self.site_host}{self.public_port}/llm/trial/{trial_id}/{lane}"
        )

    def lane(self, name: str) -> Lane | None:
        return {"main": self.main, "gui": self.gui}.get(name)
