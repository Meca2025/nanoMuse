"""HTTP: the sign-up endpoints the app calls, and the OpenAI-shaped proxy.

    POST /v1/auth/code        {identifier}                      → 204
    POST /v1/auth/verify      {identifier, code, device}        → {api_key, base_url, account, tokens, models}
    POST /v1/auth/login       {identifier, password, device}    → the same, for accounts that set a password
    POST /v1/auth/password    {password, current?}              → 204 (set / change; "" + current removes)
    GET  /v1/me                                                 → account, tokens, spend (¥ today / cap / $), usage by kind, models, recent
    GET  /v1/me/sessions                                        → live sign-ins (device, via, when; the current one marked)
    DELETE /v1/me/sessions/{prefix}                             → 204 (sign one device out)
    GET  /v1/me/events                                          → the account's own timeline (sign-ins, password changes…)
    POST /v1/auth/sign-out                                      → 204 (revokes this key)
    POST /v1/auth/sign-out-all {all?}                           → {signed_out} (every other device; all=true takes this one too)
    POST /v1/auth/delete                                        → 204 (the whole account, every key)
    GET  /v1/models                                             → OpenAI list, with modalities
    POST /v1/chat/completions                                   → forwarded; stream or not
    POST /v1/images/generations                                 → DashScope native, returned as b64_json
    POST /v1/images/edits     multipart                         → same, with the picture
    POST /api/v1/services/aigc/video-generation/video-synthesis → DashScope's async video API, relayed
    GET  /api/v1/tasks/{id}                                     → its task poll (own tasks only)
    GET  /api/v1/uploads?action=getPolicy&model=…               → its temporary-storage policy
    GET  /healthz
    WS   /v1/realtime?model=…                                   → a call: the provider's real-time socket, metered (realtime.py)
    WS   /v1/hub                                                → the devices of one account meet (hub.py)
    GET  /v1/devices                                            → remembered devices with presence
    DELETE /v1/devices/{id}                                     → forget an offline device
    GET  /app/                                                  → the web console (static)
    GET  /app/admin/                                            → the operator's page (static; asks for the admin token)
    POST /v1/admin/grant      X-Admin-Token  {account_id | identifier, tokens}
    POST /v1/admin/disable    X-Admin-Token  {account_id | identifier, disabled}
    POST /v1/admin/unlimited  X-Admin-Token  {account_id | identifier, unlimited}  → a member: no daily cap
    POST /v1/admin/delete     X-Admin-Token  {account_id | identifier}
    GET  /v1/admin/accounts   X-Admin-Token                     → with identifiers in clear, tokens and money
    GET  /v1/admin/accounts/{id} X-Admin-Token ?days=30         → one account in full: usage by kind/model/day, sign-ins, devices, timeline
    GET  /v1/admin/usage      X-Admin-Token  ?days=14           → charged tokens and yuan per day and kind
    GET  /v1/admin/overview   X-Admin-Token  ?days=30           → the dashboard: accounts, today / week / period by kind and model, signals, events
    GET  /v1/admin/events     X-Admin-Token  ?limit=200&kind=…  → the timeline across accounts (never message content)

The video paths mirror the provider's own so the app's VideoGen, which
already speaks that API, only needs to point its host at the relay.

Errors are OpenAI-shaped: {"error": {"message", "type", "code"}} with the
status the app expects (401 bad key, 402 out of tokens, 429 rate limit).
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import math
import time
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import Depends, FastAPI, File, Form, Header, Request, Response, UploadFile, WebSocket
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from . import __version__, realtime
from .config import Settings
from .hub import Hub
from .identifiers import BadIdentifier, parse
from .service import Caller, Cloud, CloudError, dumps, estimate_tokens, prompt_chars, usage_from_json

log = logging.getLogger("nanomuse_cloud.api")


def error_response(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"message": message, "type": "nanomuse_cloud", "code": code}})


def create_app(settings: Settings | None = None, cloud: Cloud | None = None, upstream_transport: httpx.AsyncBaseTransport | None = None) -> FastAPI:
    settings = settings or Settings()
    cloud = cloud or Cloud(settings)

    http = httpx.AsyncClient(
        timeout=httpx.Timeout(settings.upstream_timeout_s, connect=20.0),
        transport=upstream_transport,
        follow_redirects=False,
    )

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        try:
            yield
        finally:
            await http.aclose()

    app = FastAPI(title="nanoMuse Cloud", version=__version__, docs_url=None, redoc_url=None, lifespan=lifespan)
    app.state.cloud = cloud
    app.state.settings = settings
    app.state.http = http

    @app.exception_handler(CloudError)
    async def _cloud_error(_: Request, e: CloudError) -> JSONResponse:
        return error_response(e.status, e.code, e.message)

    def client_ip(request: Request) -> str:
        fwd = request.headers.get("x-forwarded-for")
        if fwd:
            return fwd.split(",")[0].strip()
        return request.client.host if request.client else ""

    def caller_dep(authorization: str | None = Header(default=None)) -> Caller:
        token = None
        if authorization and authorization.lower().startswith("bearer "):
            token = authorization[7:].strip()
        return cloud.authenticate(token)

    def upstream_headers() -> dict[str, str]:
        if not settings.upstream_key:
            raise CloudError(503, "upstream_unconfigured", "nanoMuse Cloud has no model key configured")
        return {"Authorization": f"Bearer {settings.upstream_key}", "Content-Type": "application/json"}

    # -- health ----------------------------------------------------------------

    @app.get("/healthz")
    async def healthz() -> dict:
        return {"ok": True, "version": __version__, "models": [m.id for m in settings.models]}

    # -- sign-up -----------------------------------------------------------------

    @app.post("/v1/auth/code", status_code=204)
    async def auth_code(request: Request) -> Response:
        body = await _json(request)
        try:
            ident = parse(str(body.get("identifier", "")))
        except BadIdentifier as e:
            raise CloudError(400, "bad_identifier", "Enter a mobile number or an e-mail address") from e
        await asyncio.to_thread(cloud.request_code, ident, client_ip(request))
        return Response(status_code=204)

    @app.post("/v1/auth/verify")
    async def auth_verify(request: Request) -> dict:
        body = await _json(request)
        try:
            ident = parse(str(body.get("identifier", "")))
        except BadIdentifier as e:
            raise CloudError(400, "bad_identifier", "Enter a mobile number or an e-mail address") from e
        code = str(body.get("code", "")).strip()
        if not code.isdigit() or len(code) != 6:
            raise CloudError(400, "code_wrong", "The code is six digits")
        device = str(body.get("device", ""))[:80]
        key, caller, created = await asyncio.to_thread(cloud.verify_code, ident, code, device)
        me = cloud.me(caller)
        return {"api_key": key, "created": created, **me}

    @app.post("/v1/auth/login")
    async def auth_login(request: Request) -> dict:
        """The password way in: no message to wait for, for people who set one."""
        body = await _json(request)
        try:
            ident = parse(str(body.get("identifier", "")))
        except BadIdentifier as e:
            raise CloudError(400, "bad_identifier", "Enter a mobile number or an e-mail address") from e
        password = str(body.get("password", ""))
        if not password:
            raise CloudError(400, "password_required", "Enter the password")
        device = str(body.get("device", ""))[:80]
        key, caller = await asyncio.to_thread(cloud.login_password, ident, password, device)
        me = cloud.me(caller)
        return {"api_key": key, "created": False, **me}

    @app.post("/v1/auth/password", status_code=204)
    async def auth_password(request: Request, caller: Caller = Depends(caller_dep)) -> Response:
        """Set or change the password (`current` when one exists, unless this
        key came from a code sign-in just now); {"password": ""} with `current`
        removes it."""
        body = await _json(request)
        password = str(body.get("password", ""))
        current = body.get("current")
        current = str(current) if current is not None else None
        if password == "":
            if not current:
                raise CloudError(400, "password_required", "Enter the current password to remove it")
            await asyncio.to_thread(cloud.clear_password, caller, current)
        else:
            await asyncio.to_thread(cloud.set_password, caller, password, current)
        return Response(status_code=204)

    @app.get("/v1/me")
    async def me(caller: Caller = Depends(caller_dep)) -> dict:
        return cloud.me(caller)

    @app.get("/v1/me/sessions")
    async def me_sessions(caller: Caller = Depends(caller_dep)) -> dict:
        return {"sessions": cloud.sessions(caller)}

    @app.delete("/v1/me/sessions/{prefix}", status_code=204)
    async def me_revoke_session(prefix: str, caller: Caller = Depends(caller_dep)) -> Response:
        cloud.revoke_session(caller, prefix)
        return Response(status_code=204)

    @app.get("/v1/me/events")
    async def me_events(limit: int = 50, caller: Caller = Depends(caller_dep)) -> dict:
        return {"events": cloud.events(caller, limit)}

    @app.post("/v1/auth/sign-out", status_code=204)
    async def sign_out(caller: Caller = Depends(caller_dep)) -> Response:
        cloud.sign_out(caller)
        return Response(status_code=204)

    @app.post("/v1/auth/sign-out-all")
    async def sign_out_all(request: Request, caller: Caller = Depends(caller_dep)) -> dict:
        """Every other device; {"all": true} takes this one too."""
        body = await _json(request)
        n = cloud.sign_out_all(caller, keep_current=not bool(body.get("all")))
        return {"signed_out": n}

    @app.post("/v1/auth/delete", status_code=204)
    async def delete_account(caller: Caller = Depends(caller_dep)) -> Response:
        hub = getattr(app.state, "hub", None)
        if hub is not None:
            await hub.drop_account(caller.account_id)
        cloud.delete_account(caller)
        return Response(status_code=204)

    # -- models ------------------------------------------------------------------------

    @app.get("/v1/models")
    async def models(caller: Caller = Depends(caller_dep)) -> dict:
        return {"object": "list", "data": [m.to_public() for m in settings.models]}

    @app.get("/v1/models/{model_id}")
    async def model(model_id: str, caller: Caller = Depends(caller_dep)) -> dict:
        m = settings.model(model_id)
        if m is None:
            raise CloudError(404, "model_not_offered", f"nanoMuse Cloud does not offer {model_id!r}")
        return m.to_public()

    # -- chat -----------------------------------------------------------------------------

    @app.post("/v1/chat/completions")
    async def chat(request: Request, caller: Caller = Depends(caller_dep)) -> Response:
        body = await _json(request)
        spec = cloud.model_for(str(body.get("model", "")), "chat")
        cloud.check_budget(caller)
        request_id = uuid.uuid4().hex[:16]
        body["model"] = spec.upstream
        for k, v in settings.chat_defaults.items():
            body.setdefault(k, v)
        stream = bool(body.get("stream"))
        if stream:
            opts = body.get("stream_options") if isinstance(body.get("stream_options"), dict) else {}
            opts["include_usage"] = True
            body["stream_options"] = opts
        # Fields that would let a caller reach around the account: none of the
        # OpenAI request fields are dangerous, but `user` is ours to set so the
        # provider's abuse tooling can tell accounts apart without knowing them.
        body["user"] = caller.account_id[:32]
        url = settings.upstream_base.rstrip("/") + "/chat/completions"
        headers = upstream_headers()
        fallback_prompt_tokens = math.ceil(prompt_chars(body.get("messages") or []) / 3)

        if not stream:
            try:
                r = await http.post(url, headers=headers, content=dumps(body).encode())
            except httpx.HTTPError as e:
                log.warning("upstream error: %s", e)
                raise CloudError(502, "upstream", "The model provider did not answer") from e
            if r.status_code >= 400:
                cloud.note(caller.account_id, "upstream.error", f"chat {r.status_code}")
                return _relay_error(r)
            try:
                obj = r.json()
            except ValueError as e:
                raise CloudError(502, "upstream", "The model provider sent an unreadable reply") from e
            usage = usage_from_json(obj)
            if usage is None:
                text = ""
                for ch in obj.get("choices") or []:
                    msg = ch.get("message") if isinstance(ch, dict) else None
                    if isinstance(msg, dict) and isinstance(msg.get("content"), str):
                        text += msg["content"]
                usage = (fallback_prompt_tokens, estimate_tokens(text))
            charged = cloud.charge_chat(caller, spec, usage[0], usage[1], request_id)
            if isinstance(obj, dict):
                obj["model"] = spec.id
                obj.setdefault("nanomuse", {})["charged"] = charged
            return JSONResponse(content=obj, headers={"x-nanomuse-charged": str(charged), "x-nanomuse-request": request_id})

        async def gen() -> AsyncIterator[bytes]:
            usage: tuple[int, int] | None = None
            text_len = 0
            # A request the provider refused, or dropped before a single token, costs the
            # account nothing; a stream that broke off midway is charged for what arrived.
            failed = False
            try:
                async with http.stream("POST", url, headers=headers, content=dumps(body).encode()) as r:
                    if r.status_code >= 400:
                        raw = await r.aread()
                        cloud.note(caller.account_id, "upstream.error", f"chat {r.status_code}")
                        failed = True
                        err = _relay_error_body(r.status_code, raw)
                        yield f"data: {dumps(err)}\n\n".encode()
                        yield b"data: [DONE]\n\n"
                        return
                    async for line in r.aiter_lines():
                        if line.startswith("data:"):
                            payload = line[5:].strip()
                            if payload and payload != "[DONE]":
                                try:
                                    obj = json.loads(payload)
                                except ValueError:
                                    obj = None
                                if isinstance(obj, dict):
                                    u = usage_from_json(obj)
                                    if u is not None:
                                        usage = u
                                    for ch in obj.get("choices") or []:
                                        d = ch.get("delta") if isinstance(ch, dict) else None
                                        if isinstance(d, dict) and isinstance(d.get("content"), str):
                                            text_len += len(d["content"])
                                    obj["model"] = spec.id
                                    payload = dumps(obj)
                            yield f"data: {payload}\n\n".encode()
                        elif line == "":
                            continue
                        else:
                            yield (line + "\n").encode()
            except httpx.HTTPError as e:
                log.warning("upstream stream error: %s", e)
                cloud.note(caller.account_id, "upstream.error", "chat stream broke")
                failed = usage is None and text_len == 0
                err = {"error": {"message": "The model provider stopped answering", "type": "nanomuse_cloud", "code": "upstream"}}
                yield f"data: {dumps(err)}\n\n".encode()
                yield b"data: [DONE]\n\n"
            finally:
                if not failed:
                    if usage is None:
                        usage = (fallback_prompt_tokens, math.ceil(text_len / 3))
                    cloud.charge_chat(caller, spec, usage[0], usage[1], request_id)

        return StreamingResponse(
            gen(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "x-nanomuse-request": request_id},
        )

    # -- images -------------------------------------------------------------------------------

    async def _dashscope_image(model: str, content: list[dict], parameters: dict) -> bytes:
        host = settings.dashscope_base.rstrip("/")
        url = f"{host}/services/aigc/multimodal-generation/generation"
        payload = {"model": model, "input": {"messages": [{"role": "user", "content": content}]}, "parameters": parameters}
        try:
            r = await http.post(url, headers=upstream_headers(), content=dumps(payload).encode())
        except httpx.HTTPError as e:
            raise CloudError(502, "upstream", "The image provider did not answer") from e
        if r.status_code >= 400:
            msg = ""
            try:
                msg = r.json().get("message", "")
            except ValueError:
                pass
            log.warning("dashscope image HTTP %s: %s", r.status_code, r.text[:300])
            raise CloudError(502, "upstream", f"The image provider refused ({r.status_code}{': ' + msg if msg else ''})")
        try:
            image_url = r.json()["output"]["choices"][0]["message"]["content"][0]["image"]
        except (ValueError, KeyError, IndexError, TypeError) as e:
            raise CloudError(502, "upstream", "The image provider sent no picture") from e
        try:
            img = await http.get(image_url)
        except httpx.HTTPError as e:
            raise CloudError(502, "upstream", "Could not fetch the picture") from e
        if img.status_code >= 400:
            raise CloudError(502, "upstream", "Could not fetch the picture")
        return img.content

    def _size_param(size: str | None) -> str:
        s = (size or "1024x1024").lower().replace("x", "*")
        return s if "*" in s else "1024*1024"

    @app.post("/v1/images/generations")
    async def images_generations(request: Request, caller: Caller = Depends(caller_dep)) -> Response:
        body = await _json(request)
        spec = cloud.model_for(str(body.get("model", "")), "image")
        size = _size_param(body.get("size"))
        cloud.check_budget(caller, minimum=spec.per_image, cost_uy=spec.image_cost_uy(size))
        prompt = str(body.get("prompt", "")).strip()
        if not prompt:
            raise CloudError(400, "bad_request", "prompt is required")
        n = int(body.get("n") or 1)
        if n != 1:
            raise CloudError(400, "bad_request", "nanoMuse Cloud draws one picture per request")
        params = {"size": size, "watermark": False}
        if spec.upstream.startswith("qwen-image"):
            params["prompt_extend"] = False
        png = await _dashscope_image(spec.upstream, [{"text": prompt}], params)
        charged = cloud.charge_image(caller, spec, 1, uuid.uuid4().hex[:16], size=size)
        return JSONResponse(
            content={"created": int(time.time()), "data": [{"b64_json": base64.b64encode(png).decode()}], "nanomuse": {"charged": charged}},
            headers={"x-nanomuse-charged": str(charged)},
        )

    @app.post("/v1/images/edits")
    async def images_edits(
        caller: Caller = Depends(caller_dep),
        model: str = Form(...),
        prompt: str = Form(...),
        n: int = Form(1),
        size: str | None = Form(None),
        image: UploadFile = File(...),
    ) -> Response:
        spec = cloud.model_for(model, "image")
        cloud.check_budget(caller, minimum=spec.per_image, cost_uy=spec.image_cost_uy(_size_param(size)))
        if n != 1:
            raise CloudError(400, "bad_request", "nanoMuse Cloud draws one picture per request")
        data = await image.read()
        if len(data) > settings.max_request_bytes:
            raise CloudError(413, "too_large", "The picture is too large")
        mime = image.content_type or "image/png"
        # Same rules as the app's own DashScope path: qwen-image-3.x and wan take
        # the picture themselves; an older text-only qwen-image is posed by
        # qwen-image-edit-max.
        three_x = spec.upstream.startswith("qwen-image-3") or spec.upstream.startswith("wan")
        edit_model = spec.upstream if (three_x or "edit" in spec.upstream) else "qwen-image-edit-max"
        params = {"size": _size_param(size), "prompt_extend": False, "watermark": False} if three_x else {"n": 1, "watermark": False}
        content = [{"image": f"data:{mime};base64," + base64.b64encode(data).decode()}, {"text": prompt}]
        png = await _dashscope_image(edit_model, content, params)
        charged = cloud.charge_image(caller, spec, 1, uuid.uuid4().hex[:16], size=_size_param(size))
        return JSONResponse(
            content={"created": int(time.time()), "data": [{"b64_json": base64.b64encode(png).decode()}], "nanomuse": {"charged": charged}},
            headers={"x-nanomuse-charged": str(charged)},
        )

    # -- video: the provider's asynchronous API, relayed under its own paths ------------------------
    #
    # The app's VideoGen submits a task, polls it, downloads the clip from the
    # URL the task ends with (the provider's storage, not us), and uploads a
    # first frame to the provider's temporary storage beforehand. Each call is
    # forwarded with the operator's key; the user's key never sees the provider.
    # Status codes come back as the provider sent them so the app's probe
    # (an empty task: accepted or 400 = the model exists, 404 = it does not)
    # keeps working; 401/403 from the provider are the operator's problem and
    # turn into 502. A clip is charged when its task is first seen SUCCEEDED —
    # a probe's task fails at once and costs nothing, here or upstream.

    VIDEO_PATH = "/services/aigc/video-generation/video-synthesis"

    def _dashscope_reply(r: httpx.Response) -> Response:
        if r.status_code in (401, 403):
            log.error("dashscope refused the relay's key: HTTP %s %s", r.status_code, r.text[:200])
            return JSONResponse(status_code=502, content={"code": "upstream", "message": "The video provider refused the relay's key"})
        media = r.headers.get("content-type", "application/json")
        return Response(status_code=r.status_code, content=r.content, media_type=media.split(";")[0])

    def _clip_seconds(body: dict) -> float:
        """The seconds the app asked for (`parameters.duration`), else the shortest
        clip MiniMax makes; the provider bills per output second."""
        params = body.get("parameters") if isinstance(body.get("parameters"), dict) else {}
        try:
            return float(params.get("duration") or 4)
        except (TypeError, ValueError):
            return 4.0

    @app.post("/api/v1" + VIDEO_PATH)
    async def video_synthesis(request: Request, caller: Caller = Depends(caller_dep)) -> Response:
        body = await _json(request)
        spec = cloud.model_for(str(body.get("model", "")), "video")
        # A probe (no input) costs nothing upstream and is not priced here either.
        clip_cost = spec.video_cost_uy(_clip_seconds(body)) if body.get("input") else 0
        cloud.check_budget(caller, minimum=spec.per_clip, cost_uy=clip_cost)
        body["model"] = spec.upstream
        headers = upstream_headers()
        headers["X-DashScope-Async"] = "enable"
        if request.headers.get("x-dashscope-ossresourceresolve"):
            headers["X-DashScope-OssResourceResolve"] = request.headers["x-dashscope-ossresourceresolve"]
        try:
            r = await http.post(settings.dashscope_base.rstrip("/") + VIDEO_PATH, headers=headers, content=dumps(body).encode())
        except httpx.HTTPError as e:
            log.warning("dashscope video error: %s", e)
            raise CloudError(502, "upstream", "The video provider did not answer") from e
        if r.status_code < 400:
            try:
                task_id = str(r.json()["output"]["task_id"])
            except (ValueError, KeyError, TypeError):
                task_id = ""
            if task_id:
                cloud.db.insert_video_task(task_id, caller.account_id, spec.id, cost_uy=clip_cost)
                log.info("video task %s for %s: %s", task_id[:12], caller.account_id[:8], spec.id)
        else:
            log.warning("dashscope video HTTP %s: %s", r.status_code, r.text[:300])
        return _dashscope_reply(r)

    @app.get("/api/v1/tasks/{task_id}")
    async def video_task(task_id: str, caller: Caller = Depends(caller_dep)) -> Response:
        task = cloud.db.video_task(task_id)
        if task is None or task["account_id"] != caller.account_id:
            raise CloudError(404, "no_task", "No such task")
        try:
            r = await http.get(settings.dashscope_base.rstrip("/") + f"/tasks/{task_id}", headers=upstream_headers())
        except httpx.HTTPError as e:
            raise CloudError(502, "upstream", "The video provider did not answer") from e
        if r.status_code < 400:
            try:
                status = r.json().get("output", {}).get("task_status")
            except (ValueError, AttributeError):
                status = None
            if status == "SUCCEEDED" and cloud.db.mark_video_charged(task_id):
                spec = settings.model(task["model"])
                if spec is not None:
                    charged = cloud.charge_video(caller, spec, task_id[:16], cost_uy=int(task["cost_uy"] or 0))
                    log.info("video task %s done for %s: charged %d", task_id[:12], caller.account_id[:8], charged)
        return _dashscope_reply(r)

    @app.get("/api/v1/uploads")
    async def video_upload_policy(request: Request, caller: Caller = Depends(caller_dep)) -> Response:
        if request.query_params.get("action") != "getPolicy":
            raise CloudError(400, "bad_request", "action=getPolicy is the only upload call the relay makes")
        spec = cloud.model_for(request.query_params.get("model", ""), "video")
        cloud.check_budget(caller, minimum=spec.per_clip, cost_uy=spec.video_cost_uy(4))
        try:
            r = await http.get(
                settings.dashscope_base.rstrip("/") + "/uploads",
                params={"action": "getPolicy", "model": spec.upstream},
                headers=upstream_headers(),
            )
        except httpx.HTTPError as e:
            raise CloudError(502, "upstream", "The video provider did not answer") from e
        return _dashscope_reply(r)

    # -- calls: the provider's real-time socket, one account at a time (realtime.py) ----------------

    if settings.realtime_enabled:

        @app.websocket("/v1/realtime")
        async def realtime_socket(ws: WebSocket) -> None:
            model_id = ws.query_params.get("model", "")
            caller: Caller | None = None
            auth = ws.headers.get("authorization")
            if auth and auth.lower().startswith("bearer "):
                try:
                    caller = cloud.authenticate(auth[7:].strip())
                except CloudError as e:
                    await ws.close(code=4001, reason=e.code)
                    return
            await ws.accept()
            if caller is None:
                # Browsers cannot set headers: the first frame carries the key.
                try:
                    first = json.loads(await asyncio.wait_for(ws.receive_text(), timeout=10))
                except (TimeoutError, ValueError):
                    await ws.close(code=4001, reason="bad_key")
                    return
                except Exception:  # noqa: BLE001 - the browser went away
                    return
                try:
                    if not isinstance(first, dict) or first.get("type") != "nanomuse.auth":
                        raise CloudError(401, "bad_key", "Sign in first")
                    caller = cloud.authenticate(str(first.get("key", "")))
                    model_id = str(first.get("model") or model_id)
                except CloudError as e:
                    await ws.send_text(realtime.error_event(e.code, e.message))
                    await ws.close(code=4001, reason=e.code)
                    return
            try:
                spec = cloud.model_for(model_id or _default_realtime_model(), "realtime")
            except CloudError as e:
                await ws.send_text(realtime.error_event(e.code, e.message))
                await ws.close(code=4004, reason=e.code)
                return
            await realtime.serve_call(ws, caller, spec, cloud, settings)

    def _default_realtime_model() -> str:
        for m in settings.models:
            if m.kind == "realtime" and m.recommended:
                return m.id
        for m in settings.models:
            if m.kind == "realtime":
                return m.id
        return ""

    # -- the hub: devices of one account, across networks ------------------------------------------

    if settings.hub_enabled:
        hub = Hub(cloud, frame_limit=settings.hub_frame_limit)
        app.state.hub = hub

        @app.websocket("/v1/hub")
        async def hub_socket(ws: WebSocket) -> None:
            # Header auth for apps; browsers authenticate in the hello frame instead.
            caller: Caller | None = None
            auth = ws.headers.get("authorization")
            if auth and auth.lower().startswith("bearer "):
                try:
                    caller = cloud.authenticate(auth[7:].strip())
                except CloudError as e:
                    await ws.close(code=4001, reason=e.code)
                    return
            await hub.serve(ws, caller)

        @app.get("/v1/devices")
        async def devices(caller: Caller = Depends(caller_dep)) -> dict:
            return {"devices": hub.devices(caller.account_id)}

        @app.delete("/v1/devices/{device_id}", status_code=204)
        async def forget_device(device_id: str, caller: Caller = Depends(caller_dep)) -> Response:
            hub.forget(caller.account_id, device_id)
            await hub.broadcast_devices(caller.account_id)
            return Response(status_code=204)

        console_dir = Path(__file__).parent / "console"
        if console_dir.is_dir():
            app.mount("/app", StaticFiles(directory=str(console_dir), html=True), name="console")

    # -- admin ------------------------------------------------------------------------------------

    def admin_dep(x_admin_token: str | None = Header(default=None)) -> None:
        if not settings.admin_token or x_admin_token != settings.admin_token:
            raise CloudError(401, "admin", "admin token required")

    @app.get("/v1/admin/accounts", dependencies=[Depends(admin_dep)])
    async def admin_accounts() -> dict:
        accounts = cloud.admin_accounts()
        hub = getattr(app.state, "hub", None)
        if hub is not None:
            for a in accounts:
                a["devices"] = [
                    {k: d[k] for k in ("id", "name", "kind", "os", "online", "last_seen")} for d in hub.devices(a["id"])
                ]
        return {"accounts": accounts, "settings": {**cloud.admin_settings(), "version": __version__}}

    @app.get("/v1/admin/usage", dependencies=[Depends(admin_dep)])
    async def admin_usage(days: int = 14) -> dict:
        return {"days": cloud.admin_usage(max(1, min(days, 90)))}

    @app.get("/v1/admin/overview", dependencies=[Depends(admin_dep)])
    async def admin_overview(days: int = 30) -> dict:
        out = cloud.admin_overview(max(1, min(days, 365)))
        hub = getattr(app.state, "hub", None)
        out["online_devices"] = hub.online_count() if hub is not None else 0
        out["version"] = __version__
        return out

    @app.get("/v1/admin/accounts/{account_id}", dependencies=[Depends(admin_dep)])
    async def admin_account(account_id: str, days: int = 30) -> dict:
        out = cloud.admin_account(account_id, max(1, min(days, 365)))
        hub = getattr(app.state, "hub", None)
        if hub is not None:
            out["devices"] = hub.devices(account_id)
        return out

    @app.get("/v1/admin/events", dependencies=[Depends(admin_dep)])
    async def admin_events(limit: int = 200, kind: str = "") -> dict:
        kinds = tuple(k.strip() for k in kind.split(",") if k.strip()) or None
        return {"events": cloud.admin_events(limit, kinds)}

    @app.post("/v1/admin/grant", dependencies=[Depends(admin_dep)])
    async def admin_grant(request: Request) -> dict:
        body = await _json(request)
        account_id = cloud.admin_resolve(str(body.get("account_id", "")), str(body.get("identifier", "")))
        return cloud.admin_grant(account_id, int(body.get("tokens", 0)))

    @app.post("/v1/admin/disable", dependencies=[Depends(admin_dep)])
    async def admin_disable(request: Request) -> Response:
        body = await _json(request)
        account_id = cloud.admin_resolve(str(body.get("account_id", "")), str(body.get("identifier", "")))
        disabled = bool(body.get("disabled", True))
        cloud.admin_disable(account_id, disabled)
        hub = getattr(app.state, "hub", None)
        if disabled and hub is not None:
            await hub.drop_account(account_id)
        return Response(status_code=204)

    @app.post("/v1/admin/unlimited", dependencies=[Depends(admin_dep)])
    async def admin_unlimited(request: Request) -> Response:
        body = await _json(request)
        account_id = cloud.admin_resolve(str(body.get("account_id", "")), str(body.get("identifier", "")))
        cloud.admin_unlimited(account_id, bool(body.get("unlimited", True)))
        return Response(status_code=204)

    @app.post("/v1/admin/delete", dependencies=[Depends(admin_dep)])
    async def admin_delete(request: Request) -> Response:
        body = await _json(request)
        account_id = cloud.admin_resolve(str(body.get("account_id", "")), str(body.get("identifier", "")))
        hub = getattr(app.state, "hub", None)
        if hub is not None:
            await hub.drop_account(account_id)
        cloud.admin_delete(account_id)
        return Response(status_code=204)

    # -- helpers ------------------------------------------------------------------------------------

    async def _json(request: Request) -> dict:
        raw = await request.body()
        if len(raw) > settings.max_request_bytes:
            raise CloudError(413, "too_large", "Request too large")
        try:
            obj = json.loads(raw or b"{}")
        except ValueError as e:
            raise CloudError(400, "bad_request", "Body must be JSON") from e
        if not isinstance(obj, dict):
            raise CloudError(400, "bad_request", "Body must be a JSON object")
        return obj

    def _relay_error_body(status: int, raw: bytes) -> dict:
        """What the app is told when the provider says no. A 400 is about the request and
        the provider's own words are the useful ones; everything else is the relay's problem
        (its key, its quota, the provider's day) and is said in words that do not send the
        person hunting for an API key they never had. The provider's text rides along under
        ``upstream`` for the curious and for bug reports."""
        upstream = ""
        try:
            up = json.loads(raw)
            if isinstance(up, dict):
                e = up.get("error")
                if isinstance(e, dict) and e.get("message"):
                    upstream = str(e["message"])[:300]
                elif up.get("message"):
                    upstream = str(up["message"])[:300]
        except ValueError:
            pass
        if status == 400:
            message, code = upstream or "The model provider refused the request", "upstream_400"
        elif status in (401, 403):
            message, code = "The relay's model provider refused its key; the operator has been told", "upstream_auth"
        elif status == 404:
            message, code = "The model provider does not know this model right now", "upstream_model"
        elif status == 429:
            message, code = "The model provider is busy; try again in a moment", "upstream_busy"
        else:
            message, code = "The model provider is having trouble; try again in a moment", f"upstream_{status}"
        err: dict = {"message": message, "type": "upstream", "code": code}
        if upstream and status != 400:
            err["upstream"] = upstream
        return {"error": err}

    def _relay_error(r: httpx.Response) -> JSONResponse:
        # The provider's own status codes would confuse the app (its 401 is not
        # the user's 401), so everything from upstream comes back as 502 except
        # 400s about the request itself, which are the caller's to see.
        status = 400 if r.status_code == 400 else 502
        log.warning("upstream HTTP %s: %s", r.status_code, r.text[:300])
        return JSONResponse(status_code=status, content=_relay_error_body(r.status_code, r.content))

    return app
