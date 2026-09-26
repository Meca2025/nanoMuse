"""HTTP: the sign-up endpoints the app calls, and the OpenAI-shaped proxy.

    POST /v1/auth/code        {identifier}                      → 204
    POST /v1/auth/verify      {identifier, code, device}        → {api_key, base_url, account, tokens, models}
    GET  /v1/me                                                 → account, tokens, models, recent usage
    POST /v1/auth/sign-out                                      → 204 (revokes this key)
    GET  /v1/models                                             → OpenAI list, with modalities
    POST /v1/chat/completions                                   → forwarded; stream or not
    POST /v1/images/generations                                 → DashScope native, returned as b64_json
    POST /v1/images/edits     multipart                         → same, with the picture
    GET  /healthz
    WS   /v1/hub                                                → the devices of one account meet (hub.py)
    GET  /v1/devices                                            → remembered devices with presence
    DELETE /v1/devices/{id}                                     → forget an offline device
    GET  /app/                                                  → the web console (static)
    POST /v1/admin/grant      X-Admin-Token  {account_id | identifier, tokens}
    GET  /v1/admin/accounts   X-Admin-Token

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

from . import __version__
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

    @app.get("/v1/me")
    async def me(caller: Caller = Depends(caller_dep)) -> dict:
        return cloud.me(caller)

    @app.post("/v1/auth/sign-out", status_code=204)
    async def sign_out(caller: Caller = Depends(caller_dep)) -> Response:
        cloud.sign_out(caller)
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
            try:
                async with http.stream("POST", url, headers=headers, content=dumps(body).encode()) as r:
                    if r.status_code >= 400:
                        raw = await r.aread()
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
                err = {"error": {"message": "The model provider stopped answering", "type": "nanomuse_cloud", "code": "upstream"}}
                yield f"data: {dumps(err)}\n\n".encode()
                yield b"data: [DONE]\n\n"
            finally:
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
        cloud.check_budget(caller, minimum=spec.per_image)
        prompt = str(body.get("prompt", "")).strip()
        if not prompt:
            raise CloudError(400, "bad_request", "prompt is required")
        n = int(body.get("n") or 1)
        if n != 1:
            raise CloudError(400, "bad_request", "nanoMuse Cloud draws one picture per request")
        params = {"size": _size_param(body.get("size")), "watermark": False}
        if spec.upstream.startswith("qwen-image"):
            params["prompt_extend"] = False
        png = await _dashscope_image(spec.upstream, [{"text": prompt}], params)
        charged = cloud.charge_image(caller, spec, 1, uuid.uuid4().hex[:16])
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
        cloud.check_budget(caller, minimum=spec.per_image)
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
        charged = cloud.charge_image(caller, spec, 1, uuid.uuid4().hex[:16])
        return JSONResponse(
            content={"created": int(time.time()), "data": [{"b64_json": base64.b64encode(png).decode()}], "nanomuse": {"charged": charged}},
            headers={"x-nanomuse-charged": str(charged)},
        )

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
        return {"accounts": cloud.admin_accounts()}

    @app.post("/v1/admin/grant", dependencies=[Depends(admin_dep)])
    async def admin_grant(request: Request) -> dict:
        body = await _json(request)
        account_id = cloud.admin_resolve(str(body.get("account_id", "")), str(body.get("identifier", "")))
        return cloud.admin_grant(account_id, int(body.get("tokens", 0)))

    @app.post("/v1/admin/disable", dependencies=[Depends(admin_dep)])
    async def admin_disable(request: Request) -> Response:
        body = await _json(request)
        account_id = cloud.admin_resolve(str(body.get("account_id", "")), str(body.get("identifier", "")))
        cloud.admin_disable(account_id, bool(body.get("disabled", True)))
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
        message = "The model provider refused the request"
        try:
            up = json.loads(raw)
            if isinstance(up, dict):
                e = up.get("error")
                if isinstance(e, dict) and e.get("message"):
                    message = str(e["message"])[:300]
                elif up.get("message"):
                    message = str(up["message"])[:300]
        except ValueError:
            pass
        return {"error": {"message": message, "type": "upstream", "code": f"upstream_{status}"}}

    def _relay_error(r: httpx.Response) -> JSONResponse:
        # The provider's own status codes would confuse the app (its 401 is not
        # the user's 401), so everything from upstream comes back as 502 except
        # 400s about the request itself, which are the caller's to see.
        status = 400 if r.status_code == 400 else 502
        log.warning("upstream HTTP %s: %s", r.status_code, r.text[:300])
        return JSONResponse(status_code=status, content=_relay_error_body(r.status_code, r.content))

    return app
