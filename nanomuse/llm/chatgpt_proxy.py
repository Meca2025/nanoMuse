"""The loopback proxy for the ChatGPT sign-in: OpenAI-compatible in, Codex Responses out.

``nanomuse chatgpt proxy`` serves it on its own port with a local bearer token; the runtime
server also mounts the same router under ``/chatgpt`` behind its own token, so the desktop
app can point an OpenAI-compatible provider row at ``http://127.0.0.1:<port>/chatgpt/v1``.
Routes, errors and what the translation does: the runtime team's ``CONTRACT-chatgpt.md``.
"""

from __future__ import annotations

import json
import secrets
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from pathlib import Path
from typing import Any

import httpx
from fastapi import APIRouter, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse
from loguru import logger

from nanomuse.llm.chatgpt import (
    BUILTIN_MODELS,
    MODELS_CLIENT_VERSION,
    MODELS_URL,
    ORIGINATOR,
    RESPONSES_URL,
    TOKEN_URL,
    Auth,
    ChatGPTError,
    TokenStore,
)
from nanomuse.llm.codex import CodexClient, StreamState, UpstreamError, to_codex

MODELS_TIMEOUT_S = 8.0
MODELS_CACHE_S = 600
UNAVAILABLE = "the ChatGPT sign-in covers chat and vision only"

Check = Callable[[Request], Awaitable[None]]


def _error(status: int, message: str, kind: str = "upstream", code: str | None = None) -> Any:
    body: dict[str, Any] = {"error": {"message": message, "type": kind}}
    if code:
        body["error"]["code"] = code
    return JSONResponse(body, status_code=status)


class ModelList:
    """The Codex models list, from upstream when it answers in time, else built in; cached."""

    def __init__(self, auth: Auth, http: httpx.AsyncClient | None = None, url: str = MODELS_URL):
        self.auth = auth
        self.url = url
        self._http = http
        self._cached: list[str] = []
        self._at = 0.0

    async def ids(self) -> list[str]:
        if self._cached and time.monotonic() - self._at < MODELS_CACHE_S:
            return list(self._cached)
        ids = await self._fetch()
        if ids:
            self._cached, self._at = ids, time.monotonic()
            return list(ids)
        return list(BUILTIN_MODELS)

    async def _fetch(self) -> list[str]:
        try:
            token = await self.auth.token()
        except ChatGPTError:
            return []
        headers = {
            "Authorization": f"Bearer {token.access}",
            "chatgpt-account-id": token.account_id,
            "originator": ORIGINATOR,
            "accept": "application/json",
        }
        http = self._http or httpx.AsyncClient()
        try:
            r = await http.get(
                self.url,
                params={"client_version": MODELS_CLIENT_VERSION},
                headers=headers,
                timeout=MODELS_TIMEOUT_S,
            )
            if r.status_code != 200:
                return []
            data = r.json()
        except (httpx.HTTPError, ValueError):
            return []
        finally:
            if self._http is None:
                await http.aclose()
        rows = data.get("models") if isinstance(data, dict) else None
        out: list[str] = []
        for row in rows if isinstance(rows, list) else []:
            if not isinstance(row, dict) or row.get("visibility") in ("hide", "none"):
                continue
            model_id = str(row.get("slug") or row.get("id") or "").strip()
            if model_id and model_id not in out:
                out.append(model_id)
        return out


def build_router(
    auth: Auth,
    client: CodexClient,
    models: ModelList,
    check: Check | None = None,
) -> APIRouter:
    """The proxy's routes. ``check`` guards every route but ``/healthz``; None = open (the
    runtime server adds its own dependency instead)."""
    router = APIRouter()

    async def guard(request: Request) -> None:
        if check is not None:
            await check(request)

    @router.get("/healthz")
    async def healthz() -> dict[str, Any]:
        return {"ok": True, "signed_in": auth.signed_in()}

    @router.get("/v1/models")
    async def list_models(request: Request) -> dict[str, Any]:
        await guard(request)
        return {
            "object": "list",
            "data": [
                {"id": m, "object": "model", "owned_by": "openai"} for m in await models.ids()
            ],
        }

    @router.post("/v1/chat/completions")
    async def chat_completions(request: Request) -> Any:
        await guard(request)
        try:
            body = await request.json()
        except ValueError:
            return _error(400, "the body is not JSON", "invalid_request")
        if not isinstance(body, dict) or not isinstance(body.get("messages"), list):
            return _error(400, "messages[] is required", "invalid_request")
        codex_body = to_codex(body)
        state = StreamState(model=str(codex_body["model"]))
        events = client.events(codex_body)
        # the first event (or the upstream's refusal) before anything is answered
        try:
            first = await anext(events)
        except StopAsyncIteration:
            first = None
        except UpstreamError as exc:
            headers = {"Retry-After": exc.retry_after} if exc.retry_after else {}
            if exc.status == 401:
                return JSONResponse(
                    {
                        "error": {
                            "message": "ChatGPT sign-in no longer valid; run nanomuse chatgpt login",
                            "type": "auth",
                            "code": "not_signed_in",
                        }
                    },
                    status_code=401,
                )
            return JSONResponse(
                {"error": {"message": exc.message, "type": "upstream"}},
                status_code=exc.status if 400 <= exc.status < 600 else 502,
                headers=headers,
            )
        except ChatGPTError as exc:
            return _error(
                401 if exc.code == "not_signed_in" else 502, exc.message, "auth", exc.code
            )
        except httpx.HTTPError as exc:
            return _error(502, f"could not reach the Codex endpoint: {exc}")

        async def all_events() -> AsyncIterator[dict[str, Any]]:
            if first is not None:
                yield first
            async for event in events:
                yield event

        async def chunks() -> AsyncIterator[dict[str, Any]]:
            async for event in all_events():
                for chunk in state.feed(event):
                    yield chunk
                if state.done:
                    return

        if body.get("stream"):

            async def sse() -> AsyncIterator[bytes]:
                try:
                    async for chunk in chunks():
                        yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n".encode()
                except (httpx.HTTPError, UpstreamError, ChatGPTError) as exc:
                    final = state._chunk({}, "error")
                    final["error"] = {"message": str(exc), "type": "upstream"}
                    yield f"data: {json.dumps(final, ensure_ascii=False)}\n\n".encode()
                yield b"data: [DONE]\n\n"

            return StreamingResponse(
                sse(),
                media_type="text/event-stream",
                headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
            )
        try:
            async for _ in chunks():
                pass
        except (httpx.HTTPError, UpstreamError, ChatGPTError) as exc:
            return _error(502, str(exc))
        if state.error:
            return _error(502, str(state.error.get("message") or "upstream error"))
        return state.completion()

    @router.api_route("/v1/images/{rest:path}", methods=["GET", "POST"])
    @router.api_route("/v1/embeddings", methods=["POST"])
    @router.api_route("/v1/videos/{rest:path}", methods=["GET", "POST"])
    @router.api_route("/v1/audio/{rest:path}", methods=["GET", "POST"])
    async def unavailable(request: Request, rest: str = "") -> Any:
        await guard(request)
        return _error(404, UNAVAILABLE, "invalid_request", "unavailable")

    return router


def bearer_check(token: str) -> Check:
    """The local token the CLI proxy wants on every route."""

    async def check(request: Request) -> None:
        header = request.headers.get("authorization", "")
        given = header[7:].strip() if header.lower().startswith("bearer ") else ""
        if not given or not secrets.compare_digest(given.encode(), token.encode()):
            raise HTTPException(401, {"message": "bad local token", "type": "auth"})

    return check


def make_app(
    store: TokenStore | Path,
    token: str,
    *,
    http: httpx.AsyncClient | None = None,
    responses_url: str | None = None,
    models_url: str | None = None,
    token_url: str | None = None,
) -> FastAPI:
    """The stand-alone proxy app (``nanomuse chatgpt proxy``)."""
    store = store if isinstance(store, TokenStore) else TokenStore(store)
    auth = Auth(store, http=http, token_url=token_url or TOKEN_URL)
    client = CodexClient(auth, http=http, url=responses_url or RESPONSES_URL)
    models = ModelList(auth, http=http, url=models_url or MODELS_URL)
    app = FastAPI(title="nanoMuse ChatGPT proxy", docs_url=None, redoc_url=None, openapi_url=None)
    app.include_router(build_router(auth, client, models, bearer_check(token)))

    @app.exception_handler(HTTPException)
    async def _http_error(request: Request, exc: HTTPException) -> JSONResponse:
        detail: Any = exc.detail
        body = detail if isinstance(detail, dict) else {"message": str(detail)}
        return JSONResponse({"error": body}, status_code=exc.status_code)

    @app.on_event("shutdown")
    async def _close() -> None:
        await client.close()
        await auth.close()

    logger.debug("ChatGPT proxy app built for {}", store.path)
    return app


__all__ = ["ModelList", "UNAVAILABLE", "bearer_check", "build_router", "make_app"]
