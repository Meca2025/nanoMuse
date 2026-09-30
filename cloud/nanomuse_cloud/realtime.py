"""A call: the provider's real-time socket, relayed one account at a time.

    WS /v1/realtime?model=<id>     Authorization: Bearer nm_…  (or a first frame {"type":"nanomuse.auth","key":…})

The protocol is the provider's (OpenAI Realtime-shaped: `session.update`,
`input_audio_buffer.append`, `input_image_buffer.append`, `response.*`) and
passes through untouched in both directions. The relay only

  * checks the budget before connecting and after every answer,
  * reads the token split out of each `response.done` and charges it
    (kind `realtime`, so the account page can tell calls from chat),
  * adds `nanomuse: {charged, cost_cny}` to that one event, and
  * hangs up at REALTIME_MAX_S or when the daily cap is reached, with an
    `error` event the apps show before closing.

Audio and frames are never written anywhere: the relay holds one message at
a time in memory and forwards it.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid

import websockets
from fastapi import WebSocket
from starlette.websockets import WebSocketDisconnect, WebSocketState

from .config import ModelSpec, RealtimeUsage, Settings
from .service import Caller, Cloud, CloudError, dumps

log = logging.getLogger("nanomuse_cloud.realtime")

# WebSocket close codes the apps recognise: 4000 + the HTTP status of the error.
CLOSE_BUDGET = 4429
CLOSE_UPSTREAM = 4502
CLOSE_TIMEOUT = 4408


def error_event(code: str, message: str) -> str:
    return dumps({"type": "error", "error": {"type": "nanomuse_cloud", "code": code, "message": message}})


async def serve_call(ws: WebSocket, caller: Caller, spec: ModelSpec, cloud: Cloud, settings: Settings) -> None:
    """Runs one call; `ws` is already accepted."""
    refused = cloud.budget_ok(caller)
    if refused is not None:
        await _refuse(ws, refused)
        return
    if not settings.upstream_key:
        await ws.send_text(error_event("upstream_unconfigured", "nanoMuse Cloud has no model key configured"))
        await ws.close(code=CLOSE_UPSTREAM)
        return

    request_id = uuid.uuid4().hex[:16]
    url = f"{settings.realtime_base.rstrip('/')}?model={spec.upstream}"
    headers = {"Authorization": f"Bearer {settings.upstream_key}", "OpenAI-Beta": "realtime=v1"}
    started = time.monotonic()
    answers = 0
    total = RealtimeUsage()
    try:
        upstream = await websockets.connect(url, additional_headers=headers, open_timeout=20, max_size=16 * 1024 * 1024)
    except Exception as e:  # noqa: BLE001 - whatever the network did, the app gets one error
        log.warning("realtime upstream connect failed: %s", type(e).__name__)
        cloud.note(caller.account_id, "upstream.error", f"realtime connect {type(e).__name__}")
        await ws.send_text(error_event("upstream", "The call could not be connected; try again in a moment"))
        await ws.close(code=CLOSE_UPSTREAM)
        return

    stop = asyncio.Event()
    close_code: int | None = None

    async def client_to_upstream() -> None:
        nonlocal close_code
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
                await upstream.send(data)
        except (WebSocketDisconnect, RuntimeError):
            pass
        except websockets.ConnectionClosed:
            pass
        finally:
            stop.set()

    async def upstream_to_client() -> None:
        nonlocal answers, total, close_code
        try:
            async for raw in upstream:
                if isinstance(raw, bytes):
                    await ws.send_bytes(raw)
                    continue
                out = raw
                kind = _event_type(raw)
                if kind == "response.done":
                    try:
                        obj = json.loads(raw)
                    except ValueError:
                        obj = None
                    usage = RealtimeUsage.from_response_done(obj) if isinstance(obj, dict) else None
                    if usage is not None and (usage.input_tokens or usage.output_tokens):
                        charged = cloud.charge_realtime(caller, spec, usage, request_id)
                        answers += 1
                        total = _add(total, usage)
                        obj["nanomuse"] = {
                            "charged": charged,
                            "cost_cny": settings.uy_to_cny(spec.realtime_cost_uy(usage)),
                            "request": request_id,
                        }
                        out = dumps(obj)
                elif kind == "error":
                    log.warning("realtime upstream error event for %s", spec.id)
                    cloud.note(caller.account_id, "upstream.error", f"realtime {spec.id}")
                await ws.send_text(out)
                if kind == "response.done":
                    refused = cloud.budget_ok(caller)
                    if refused is not None:
                        await ws.send_text(error_event(refused.code, refused.message))
                        close_code = CLOSE_BUDGET
                        break
        except websockets.ConnectionClosed:
            pass
        except (WebSocketDisconnect, RuntimeError):
            pass
        finally:
            stop.set()

    async def watchdog() -> None:
        nonlocal close_code
        try:
            await asyncio.wait_for(stop.wait(), timeout=settings.realtime_max_s)
        except TimeoutError:
            close_code = CLOSE_TIMEOUT
            try:
                await ws.send_text(error_event("call_too_long", "This call reached its time limit; call again to continue"))
            except (WebSocketDisconnect, RuntimeError):
                pass
            stop.set()

    tasks = [asyncio.create_task(client_to_upstream()), asyncio.create_task(upstream_to_client()), asyncio.create_task(watchdog())]
    try:
        await stop.wait()
    finally:
        # The server may cancel this handler the moment the app hangs up, so
        # the bookkeeping comes first and needs no await; the clean-up after
        # it is best effort.
        seconds = int(time.monotonic() - started)
        cloud.note(
            caller.account_id, "call.ended",
            f"{spec.id} {seconds}s {answers} answers audio_in={total.audio_in} audio_out={total.audio_out}",
        )
        log.info("call ended: %s %ss %d answers", spec.id, seconds, answers)
        for t in tasks:
            t.cancel()
        try:
            await asyncio.gather(*tasks, return_exceptions=True)
            await upstream.close()
            if ws.client_state == WebSocketState.CONNECTED:
                await ws.close(code=close_code or 1000)
        except (asyncio.CancelledError, WebSocketDisconnect, RuntimeError, websockets.ConnectionClosed):
            pass


async def _refuse(ws: WebSocket, e: CloudError) -> None:
    await ws.send_text(error_event(e.code, e.message))
    await ws.close(code=4000 + e.status if 400 <= e.status < 600 else 1008)


def _event_type(raw: str) -> str:
    """The `type` of a JSON event without parsing a whole audio delta: the
    field is near the front of every event the provider sends."""
    head = raw[:200]
    i = head.find('"type"')
    if i < 0:
        return ""
    j = head.find('"', head.find(":", i) + 1)
    k = head.find('"', j + 1)
    return head[j + 1:k] if j >= 0 and k > j else ""


def _add(a: RealtimeUsage, b: RealtimeUsage) -> RealtimeUsage:
    return RealtimeUsage(
        a.text_in + b.text_in, a.audio_in + b.audio_in, a.image_in + b.image_in, a.text_out + b.text_out, a.audio_out + b.audio_out
    )
