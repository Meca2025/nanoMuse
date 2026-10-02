"""The models under the operator's key, read from the provider — for members to pick from.

A member may name any model of the right kind (config.unlisted_model); until 0.10 they had to
know the id and type it. The relay now asks the provider's own ``GET /models`` (the
OpenAI-shaped list every compatible endpoint has) with the operator's key, sorts what comes
back into chat, image and video by the shape of the id, and lists the usable ones in
``GET /v1/models`` for members after the menu, marked ``listed: false`` and ``catalog: true``
— so the apps' pickers show them and the person chooses rather than types.

What the provider lists carries no modalities (``id``, ``object``, ``owned_by`` and a date), so
the sorting is by name: ``image`` in the id is a picture model, ``t2v``/``i2v`` and their kin a
clip model, speech / transcription / embedding / reranking / live-translation ids are left
out (they do not answer chat completions), everything else is a chat model, with a vision
hint for the families known to read pictures. A wrong guess costs nothing: the kind is checked
again when the model is used, and an id a member types still works as before.

Cached for ``CLOUD_CATALOG_TTL_S`` (an hour); a provider that does not answer leaves the last
good list in place, or none. ``CLOUD_CATALOG=0`` switches the whole thing off.
"""

from __future__ import annotations

import asyncio
import logging
import re
import time
from dataclasses import dataclass, field

import httpx

from .config import MODEL_ID_RE

log = logging.getLogger("nanomuse_cloud.catalog")

# ids that are not chat, picture or clip models — spoken, heard, embedded, translated live
_NOT_FOR_US = re.compile(
    r"(^|[-/_.])(tts|asr|speech|audio|realtime|s2s|livetranslate|embedding|rerank|omni|sambert|"
    r"cosyvoice|paraformer|sensevoice|whisper|sre-gpu|voice|vc|vd)([-/_.]|$)"
)
_VIDEO = re.compile(r"(^|[-/_.])(t2v|i2v|kf2v|s2v|r2v|v2v|video|animate|seedance|veo|sora)([-/_.]|$)")
_IMAGE = re.compile(r"(^|[-/_.])(image|t2i|i2i|seedream|flux|stable-diffusion|sdxl|dall-e|imagen|z-image)([-/_.]|$)|image")
# chat models known to read pictures: the VL and QVQ lines, OCR, the GUI model, the Qwen
# generations that are multimodal from the start (3.5 on), Kimi K2.5 on, GPT-4o/5, Gemini, Claude
_VISION = re.compile(
    r"(^|[-/_.])(vl|qvq|vision|ocr|gui|gpt-4o|gpt-5|gemini|claude|kimi-k2\.[5-9]|kimi-k[3-9])([-/_.]|$)|qwen3\.[5-9]|qwen[4-9]"
)


def classify(model_id: str) -> tuple[str, bool]:
    """The kind of model an id names — ``chat``, ``image``, ``video`` or ``other`` — and, for
    chat, whether it is known to read pictures."""
    mid = model_id.strip().lower()
    if not mid or not MODEL_ID_RE.match(model_id.strip()):
        return "other", False
    bare = mid.rsplit("/", 1)[-1]  # a vendor prefix (``vanchin/deepseek-v3``) says nothing of the kind
    if _VIDEO.search(bare):
        return "video", False
    if _IMAGE.search(bare):
        return "image", False
    if _NOT_FOR_US.search(bare):
        return "other", False
    return "chat", bool(_VISION.search(bare))


@dataclass
class Entry:
    id: str
    kind: str
    vision: bool = False


@dataclass
class Catalog:
    """The provider's list, sorted and cached; one fetch at a time."""

    ttl_s: int = 3600
    entries: list[Entry] = field(default_factory=list)
    fetched_at: float = 0.0
    error: str = ""
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    @property
    def fresh(self) -> bool:
        return bool(self.fetched_at) and time.time() - self.fetched_at < self.ttl_s

    async def get(self, http: httpx.AsyncClient, base: str, key: str) -> list[Entry]:
        """The usable models under the key, from the cache when it is fresh."""
        if self.fresh:
            return self.entries
        async with self._lock:
            # another request may have refreshed it while this one waited for the lock
            if not self.fresh:
                await self._refresh(http, base, key)
        return self.entries

    async def _refresh(self, http: httpx.AsyncClient, base: str, key: str) -> None:
        if not base or not key:
            self.error = "upstream_unconfigured"
            self.fetched_at = time.time()  # do not ask again for a while
            return
        try:
            r = await http.get(f"{base.rstrip('/')}/models", headers={"Authorization": f"Bearer {key}"}, timeout=10.0)
            r.raise_for_status()
            data = r.json()
        except (httpx.HTTPError, ValueError) as exc:
            # the last good list stands; a provider that is down is asked again in a tenth of the time
            self.error = type(exc).__name__
            self.fetched_at = time.time() - self.ttl_s * 0.9
            log.info("catalog: the provider's /models did not answer (%s); %d models kept", self.error, len(self.entries))
            return
        rows = data.get("data") if isinstance(data, dict) else data
        ids = sorted({str(m.get("id") or "") for m in rows if isinstance(m, dict)} if isinstance(rows, list) else set())
        out: list[Entry] = []
        for mid in ids:
            kind, vision = classify(mid)
            if kind != "other":
                out.append(Entry(id=mid, kind=kind, vision=vision))
        self.entries = out
        self.error = ""
        self.fetched_at = time.time()
        log.info("catalog: %d models under the key, %d usable", len(ids), len(out))
