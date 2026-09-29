"""A call with the Muse: the browser's microphone and camera, the provider's real-time model.

    WS /ws/call?token=…&video=1

The app streams PCM16 microphone audio (16 kHz) as ``input_audio_buffer.append`` events
and, on a video call, one JPEG frame a second as ``input_image_buffer.append``; the model
answers with ``response.audio.delta`` (PCM 24 kHz) which the app plays. The protocol is the
provider's (OpenAI Realtime-shaped) and passes through this bridge untouched — except that
the bridge

* decides where the call goes: nanoMuse Cloud's ``/v1/realtime`` when signed in (the
  account is metered there), else straight to the provider when the configured model
  provider is Alibaba's Bailian (the person's own key);
* opens the session with the Muse's identity — name, personality, what it remembers about
  the person — so the voice on the line is the same agent as the chat;
* writes what was said into the main chat as ``user`` / ``assistant`` events flagged
  ``via: "call"``, so a call is part of the conversation history and the Muse can refer
  back to it later;
* tells the app the cost after every answer (the relay's ``nanomuse`` block on
  ``response.done``) and why a call ended.

Audio never touches the disk here: frames are forwarded and dropped.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import time
from typing import TYPE_CHECKING, Any

import websockets
from fastapi import WebSocket
from starlette.websockets import WebSocketDisconnect, WebSocketState

from nanomuse.cloud import CLOUD_KEY, CloudError, realtime_url
from nanomuse.logger import logger

if TYPE_CHECKING:
    from nanomuse.server.service import MuseService

BAILIAN_HOSTS = ("dashscope.aliyuncs.com", "dashscope-intl.aliyuncs.com", "maas.qwencloudapi.com")
BAILIAN_REALTIME = "wss://dashscope.aliyuncs.com/api-ws/v1/realtime"
BAILIAN_INTL_REALTIME = "wss://dashscope-intl.aliyuncs.com/api-ws/v1/realtime"
DEFAULT_MODEL = "qwen3.5-omni-flash-realtime"
DEFAULT_VOICE = "Cherry"
VOICES = ("Cherry", "Serena", "Ethan", "Chelsie", "Tina", "Momo", "Vivian", "Moon", "Bella")

CALL_PROMPT = """You are {name}, {owner}'s own personal agent, and this is a {kind} call with them — you can hear them{sees}.
Speak the way a close, capable friend does on the phone: natural, warm, concise. One to three sentences unless they ask for detail. Never read out lists or markdown; say things.
Answer in the language they speak to you in.
{personality}{memories}{extra}
If they ask you to do something that needs your tools (files, the browser, other devices, the calendar), say you will do it after the call and what you will do; you cannot use tools while on the line."""


class CallBridge:
    """Where calls go and how they are recorded. One per runtime; a call is one socket."""

    def __init__(self, svc: MuseService):
        self.svc = svc
        self.active = 0
        self.last: dict[str, Any] | None = None

    # ------------------------------------------------------------------ what the app sees
    def view(self) -> dict[str, Any]:
        route = self._route(raise_=False)
        s = self.svc.settings.cloud
        models = self._cloud_models()
        return {
            "available": route is not None,
            "source": route["source"] if route else None,
            "reason": route.get("reason", "") if route else self._why_not(),
            "model": route["model"] if route else (s.realtime_model or DEFAULT_MODEL),
            "voice": s.realtime_voice or DEFAULT_VOICE,
            "voices": list(VOICES),
            "models": models,
            "active": self.active,
            "last": self.last,
        }

    def _cloud_models(self) -> list[dict[str, Any]]:
        """The relay's real-time models, from the last ``/v1/me`` it showed (cached by the
        hub service), so the picker has names and prices without another round trip."""
        me = getattr(self.svc.hub, "last_me", None) or {}
        out = []
        for m in me.get("models") or []:
            nm = m.get("nanomuse") or {}
            if nm.get("kind") == "realtime":
                out.append(
                    {
                        "id": m.get("id"),
                        "name": m.get("name"),
                        "recommended": bool(nm.get("recommended")),
                    }
                )
        return out

    def _why_not(self) -> str:
        if not self.svc.hub.signed_in:
            return "sign_in"
        return "no_route"

    def _route(self, raise_: bool = True) -> dict[str, Any] | None:
        """Where this call connects: the relay when signed in; the person's own Bailian key
        when the chat model is Bailian; otherwise nowhere."""
        s = self.svc.settings.cloud
        model = s.realtime_model or ""
        if self.svc.hub.signed_in:
            key = self.svc.app.vault.get(CLOUD_KEY) or ""
            if key:
                url = realtime_url(self.svc.hub.cloud.base_url)
                if not model:
                    for m in self._cloud_models():
                        if m.get("recommended"):
                            model = str(m["id"])
                            break
                model = model or DEFAULT_MODEL
                return {
                    "source": "cloud",
                    "url": f"{url}?model={model}",
                    "key": key,
                    "model": model,
                }
        llm = self.svc.settings.llm
        base = (llm.base_url or "").lower()
        if any(h in base for h in BAILIAN_HOSTS):
            key = str(self.svc.app.vault.resolve(llm.api_key or "", strict=False) or "")
            if key:
                host = BAILIAN_INTL_REALTIME if "intl" in base else BAILIAN_REALTIME
                model = model or DEFAULT_MODEL
                return {"source": "own", "url": f"{host}?model={model}", "key": key, "model": model}
        if raise_:
            raise CloudError(
                412,
                "no_call_route",
                "Calls need nanoMuse Cloud (sign in) or a Bailian model key as the provider.",
            )
        return None

    # ------------------------------------------------------------------ the session opener
    def instructions(self, video: bool) -> str:
        a = self.svc.settings.agent
        profile = getattr(self.svc, "profile", None)
        # the personality, tone and tagline are already folded into the agent's
        # instructions by the profile (service._apply_profile); they come along in `extra`
        personality = ""
        memories = ""
        memory = getattr(self.svc.app, "memory", None)
        if memory is not None and self.svc.settings.memory.enabled:
            with contextlib.suppress(Exception):
                items = memory.relevant(
                    "a phone call with the user, their life and plans", limit=12
                )
                if items:
                    memories = (
                        "\nWhat you remember about them:\n"
                        + "\n".join(f"- {m.render()}" for m in items)
                        + "\n"
                    )
        extra = ""
        if a.user_profile.strip():
            extra += f"\nAbout them: {a.user_profile.strip()}\n"
        if a.instructions.strip():
            extra += f"\n{a.instructions.strip()}\n"
        owner = str(getattr(profile, "user_name", "") or "").strip() or "the user"
        return CALL_PROMPT.format(
            name=a.name,
            owner=owner,
            kind="video" if video else "voice",
            sees=" and see what their camera shows" if video else "",
            personality=personality,
            memories=memories,
            extra=extra,
        )

    def session_update(self, video: bool) -> dict[str, Any]:
        s = self.svc.settings.cloud
        return {
            "type": "session.update",
            "session": {
                "modalities": ["text", "audio"],
                "voice": s.realtime_voice or DEFAULT_VOICE,
                "instructions": self.instructions(video),
                "input_audio_format": "pcm16",
                "output_audio_format": "pcm16",
                "input_audio_transcription": {"model": "gummy-realtime-v1"},
                "turn_detection": {
                    "type": "server_vad",
                    "threshold": 0.5,
                    "prefix_padding_ms": 300,
                    "silence_duration_ms": 700,
                },
            },
        }

    # ------------------------------------------------------------------ one call
    async def serve(self, ws: WebSocket) -> None:
        """``ws`` is accepted here. Frames go both ways until either side hangs up."""
        await ws.accept()
        video = ws.query_params.get("video", "") in ("1", "true", "yes")
        try:
            route = self._route()
        except CloudError as exc:
            await self._send(
                ws,
                {
                    "type": "error",
                    "error": {"type": "nanomuse", "code": exc.code, "message": exc.describe()},
                },
            )
            await ws.close(code=4412)
            return
        assert route is not None
        headers = {"Authorization": f"Bearer {route['key']}", "OpenAI-Beta": "realtime=v1"}
        try:
            upstream = await websockets.connect(
                route["url"], additional_headers=headers, open_timeout=20, max_size=16 * 1024 * 1024
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("call: could not connect ({})", type(exc).__name__)
            await self._send(
                ws,
                {
                    "type": "error",
                    "error": {
                        "type": "nanomuse",
                        "code": "offline",
                        "message": "The call could not be connected; try again in a moment.",
                    },
                },
            )
            await ws.close(code=4502)
            return

        self.active += 1
        started = time.time()
        thread_id = self.svc.ui.thread()
        turns = 0
        cost = 0.0
        user_text: list[str] = []
        muse_text: list[str] = []
        stop = asyncio.Event()
        reason = "hung_up"
        self.svc.bus.publish(
            {
                "kind": "call",
                "state": "started",
                "source": route["source"],
                "model": route["model"],
                "video": video,
            }
        )
        self.svc.ui.emit(
            {
                "type": "notice",
                "text": f"📞 {'Video' if video else 'Voice'} call started",
                "thread": thread_id,
                "via": "call",
            }
        )

        async def opener() -> None:
            await upstream.send(json.dumps(self.session_update(video), ensure_ascii=False))

        async def app_to_model() -> None:
            nonlocal reason
            try:
                while not stop.is_set():
                    msg = await ws.receive()
                    if msg["type"] == "websocket.disconnect":
                        break
                    data = msg.get("text")
                    if data is None:
                        data = msg.get("bytes")
                    if data is None:
                        continue
                    # The app may only speak the provider's protocol; the session opener
                    # is the runtime's, so a second one from the app is merged, not obeyed.
                    if isinstance(data, str) and data[:40].find('"session.update"') >= 0:
                        try:
                            obj = json.loads(data)
                            sess = obj.get("session") or {}
                            merged = self.session_update(video)
                            for k in ("voice", "turn_detection", "modalities"):
                                if k in sess:
                                    merged["session"][k] = sess[k]
                            data = json.dumps(merged, ensure_ascii=False)
                        except ValueError:
                            continue
                    await upstream.send(data)
            except (WebSocketDisconnect, RuntimeError):
                pass
            except websockets.ConnectionClosed:
                reason = "model_closed"
            finally:
                stop.set()

        async def model_to_app() -> None:
            nonlocal turns, cost, reason
            try:
                async for raw in upstream:
                    if isinstance(raw, bytes):
                        await ws.send_bytes(raw)
                        continue
                    kind = _event_type(raw)
                    if kind in (
                        "response.done",
                        "conversation.item.input_audio_transcription.completed",
                        "response.audio_transcript.done",
                        "error",
                    ):
                        try:
                            obj = json.loads(raw)
                        except ValueError:
                            obj = None
                        if isinstance(obj, dict):
                            if kind == "conversation.item.input_audio_transcription.completed":
                                text = str(obj.get("transcript") or "").strip()
                                if text:
                                    user_text.append(text)
                                    self.svc.ui.emit(
                                        {
                                            "type": "user",
                                            "text": text,
                                            "thread": thread_id,
                                            "via": "call",
                                        }
                                    )
                            elif kind == "response.audio_transcript.done":
                                text = str(obj.get("transcript") or "").strip()
                                if text:
                                    muse_text.append(text)
                                    self.svc.ui.emit(
                                        {
                                            "type": "assistant",
                                            "text": text,
                                            "thread": thread_id,
                                            "final": True,
                                            "via": "call",
                                        }
                                    )
                            elif kind == "response.done":
                                turns += 1
                                nm = obj.get("nanomuse") or {}
                                with contextlib.suppress(TypeError, ValueError):
                                    cost += float(nm.get("cost_cny") or 0)
                                self.svc.bus.publish(
                                    {
                                        "kind": "call",
                                        "state": "turn",
                                        "turns": turns,
                                        "cost_cny": round(cost, 4),
                                    }
                                )
                            elif kind == "error":
                                err = obj.get("error") or {}
                                code = str(err.get("code") or "")
                                if code in (
                                    "daily_cap",
                                    "out_of_tokens",
                                    "call_too_long",
                                    "rate_limited",
                                ):
                                    reason = code
                                logger.warning(
                                    "call: model error {}", code or err.get("message", "")[:80]
                                )
                    await ws.send_text(raw)
            except websockets.ConnectionClosed as exc:
                if reason == "hung_up":
                    reason = (
                        "model_closed" if exc.code in (1000, 1001) else f"model_closed_{exc.code}"
                    )
            except (WebSocketDisconnect, RuntimeError):
                pass
            finally:
                stop.set()

        tasks = [
            asyncio.create_task(opener()),
            asyncio.create_task(app_to_model()),
            asyncio.create_task(model_to_app()),
        ]
        try:
            await stop.wait()
        finally:
            self.active -= 1
            seconds = int(time.time() - started)
            self.last = {
                "ended_at": time.time(),
                "seconds": seconds,
                "turns": turns,
                "cost_cny": round(cost, 4),
                "reason": reason,
                "source": route["source"],
                "model": route["model"],
                "video": video,
            }
            summary = f"📞 Call ended · {_mmss(seconds)} · {turns} turn{'s' if turns != 1 else ''}"
            if cost:
                summary += f" · ¥{cost:.2f}"
            with contextlib.suppress(Exception):
                self.svc.ui.emit(
                    {
                        "type": "notice",
                        "text": summary,
                        "thread": thread_id,
                        "via": "call",
                        "call": self.last,
                    }
                )
                self.svc.bus.publish({"kind": "call", "state": "ended", **self.last})
            for t in tasks:
                t.cancel()
            with contextlib.suppress(
                asyncio.CancelledError,
                WebSocketDisconnect,
                RuntimeError,
                websockets.ConnectionClosed,
            ):
                await asyncio.gather(*tasks, return_exceptions=True)
                await upstream.close()
                if ws.client_state == WebSocketState.CONNECTED:
                    await ws.close(code=1000)

    @staticmethod
    async def _send(ws: WebSocket, obj: dict[str, Any]) -> None:
        with contextlib.suppress(WebSocketDisconnect, RuntimeError):
            await ws.send_text(json.dumps(obj, ensure_ascii=False))


def _event_type(raw: str) -> str:
    head = raw[:200]
    i = head.find('"type"')
    if i < 0:
        return ""
    j = head.find('"', head.find(":", i) + 1)
    k = head.find('"', j + 1)
    return head[j + 1 : k] if j >= 0 and k > j else ""


def _mmss(seconds: int) -> str:
    return f"{seconds // 60}:{seconds % 60:02d}"
