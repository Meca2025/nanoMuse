"""End-to-end through the ASGI app, with a fake provider standing in for the upstream."""

from __future__ import annotations

import base64
import json

import httpx
import pytest
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse

from nanomuse_cloud.api import create_app
from nanomuse_cloud.config import Settings
from nanomuse_cloud.db import Database
from nanomuse_cloud.identifiers import BadIdentifier, parse
from nanomuse_cloud.senders import LogSender
from nanomuse_cloud.service import Cloud

PNG_1PX = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
)


def fake_upstream() -> FastAPI:
    up = FastAPI()
    up.state.requests = []

    @up.post("/compat/v1/chat/completions")
    async def chat(request: Request):
        body = await request.json()
        up.state.requests.append(("chat", dict(request.headers), body))
        if body.get("model") == "boom":
            return JSONResponse(status_code=500, content={"error": {"message": "upstream exploded"}})
        if body.get("stream"):
            async def gen():
                for piece in ("你好", "，", "世界"):
                    chunk = {"id": "c1", "object": "chat.completion.chunk", "model": body["model"],
                             "choices": [{"index": 0, "delta": {"content": piece}, "finish_reason": None}]}
                    yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
                yield 'data: {"id":"c1","object":"chat.completion.chunk","choices":[],"usage":{"prompt_tokens":40,"completion_tokens":6}}\n\n'
                yield "data: [DONE]\n\n"
            return StreamingResponse(gen(), media_type="text/event-stream")
        return {"id": "c1", "object": "chat.completion", "model": body["model"],
                "choices": [{"index": 0, "message": {"role": "assistant", "content": "hi"}, "finish_reason": "stop"}],
                "usage": {"prompt_tokens": 100, "completion_tokens": 50, "total_tokens": 150}}

    @up.post("/ds/api/v1/services/aigc/multimodal-generation/generation")
    async def draw(request: Request):
        body = await request.json()
        up.state.requests.append(("image", dict(request.headers), body))
        return {"output": {"choices": [{"message": {"content": [{"image": "http://upstream/pic.png"}]}}]}}

    @up.get("/pic.png")
    async def pic():
        from fastapi.responses import Response
        return Response(content=PNG_1PX, media_type="image/png")

    return up


@pytest.fixture
def stack():
    up = fake_upstream()
    settings = Settings(
        database=":memory:", secret="test-secret", admin_token="admin",
        upstream_base="http://upstream/compat/v1", upstream_key="sk-upstream",
        dashscope_base="http://upstream/ds/api/v1",
        signup_tokens=1000, daily_cap_tokens=100_000, per_minute_requests=100,
        public_base="http://cloud.test",
    )
    sender = LogSender()
    cloud = Cloud(settings, Database(":memory:"), sender)
    app = create_app(settings, cloud, upstream_transport=httpx.ASGITransport(app=up))
    client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://cloud.test")
    return app, client, sender, up, cloud


async def sign_up(client, sender, identifier="13800138000", device="pixel"):
    r = await client.post("/v1/auth/code", json={"identifier": identifier})
    assert r.status_code == 204, r.text
    ident, code = sender.sent[-1]
    r = await client.post("/v1/auth/verify", json={"identifier": identifier, "code": code, "device": device})
    assert r.status_code == 200, r.text
    return r.json()


def test_identifiers():
    assert parse("138 0013 8000").value == "+8613800138000"
    assert parse("+8613800138000").hint == "138****8000"
    assert parse("0086 13800138000").value == "+8613800138000"
    assert parse("+14155552671").channel == "phone"
    assert parse("Someone@Example.COM").value == "someone@example.com"
    assert parse("someone@example.com").hint == "so***@example.com"
    for bad in ("", "12345", "not an address", "@x.com", "1234567890123456789"):
        with pytest.raises(BadIdentifier):
            parse(bad)


async def test_signup_grants_and_lists_models(stack):
    app, client, sender, up, cloud = stack
    data = await sign_up(client, sender)
    assert data["api_key"].startswith("nm_")
    assert data["created"] is True
    assert data["tokens"] == {"granted": 1000, "used": 0, "remaining": 1000, "used_today": 0, "daily_cap": 100_000}
    assert data["account"]["hint"] == "138****8000"
    assert data["base_url"] == "http://cloud.test"
    ids = [m["id"] for m in data["models"]]
    assert "qwen3.7-plus" in ids and "qwen-image-3.0-pro" in ids

    headers = {"Authorization": f"Bearer {data['api_key']}"}
    r = await client.get("/v1/models", headers=headers)
    assert r.status_code == 200
    plus = next(m for m in r.json()["data"] if m["id"] == "qwen3.7-plus")
    assert plus["architecture"]["input_modalities"] == ["text", "image"]
    assert plus["nanomuse"]["recommended"] is True

    # The same number again: same account, a second key, no second grant.
    again = await sign_up(client, sender, device="tablet")
    assert again["created"] is False
    assert again["tokens"]["granted"] == 1000
    assert again["api_key"] != data["api_key"]


async def test_wrong_code_and_expiry_rules(stack):
    app, client, sender, up, cloud = stack
    r = await client.post("/v1/auth/code", json={"identifier": "a@b.co"})
    assert r.status_code == 204
    r = await client.post("/v1/auth/verify", json={"identifier": "a@b.co", "code": "000000"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "code_wrong"
    r = await client.post("/v1/auth/verify", json={"identifier": "a@b.co", "code": "12"})
    assert r.status_code == 400
    r = await client.post("/v1/auth/verify", json={"identifier": "nobody@b.co", "code": "123456"})
    assert r.json()["error"]["code"] == "code_expired"
    r = await client.post("/v1/auth/code", json={"identifier": "garbage"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "bad_identifier"
    # Three codes in ten minutes is the ceiling per identifier.
    for _ in range(2):
        assert (await client.post("/v1/auth/code", json={"identifier": "a@b.co"})).status_code == 204
    r = await client.post("/v1/auth/code", json={"identifier": "a@b.co"})
    assert r.status_code == 429 and r.json()["error"]["code"] == "code_too_often"


async def test_chat_is_relayed_and_charged(stack):
    app, client, sender, up, cloud = stack
    data = await sign_up(client, sender)
    headers = {"Authorization": f"Bearer {data['api_key']}"}

    r = await client.post("/v1/chat/completions", headers=headers,
                          json={"model": "qwen3.7-plus", "messages": [{"role": "user", "content": "hi"}]})
    assert r.status_code == 200, r.text
    assert r.json()["choices"][0]["message"]["content"] == "hi"
    assert r.json()["model"] == "qwen3.7-plus"
    assert r.headers["x-nanomuse-charged"] == "150"
    kind, up_headers, up_body = up.state.requests[-1]
    assert up_headers["authorization"] == "Bearer sk-upstream"
    assert up_body["model"] == "qwen3.7-plus" and up_body["user"]
    assert up_body["enable_thinking"] is False  # CHAT_DEFAULTS filled in

    me = (await client.get("/v1/me", headers=headers)).json()
    assert me["tokens"]["used"] == 150 and me["tokens"]["remaining"] == 850
    assert me["recent"][0]["kind"] == "chat" and me["recent"][0]["charged"] == 150

    # Flash is cheaper: 100×0.3 + 50×0.3 = 45.
    r = await client.post("/v1/chat/completions", headers=headers,
                          json={"model": "qwen3.7-flash", "messages": [{"role": "user", "content": "hi"}]})
    assert r.headers["x-nanomuse-charged"] == "45"

    # A model we do not offer is refused before anything is forwarded.
    n = len(up.state.requests)
    r = await client.post("/v1/chat/completions", headers=headers,
                          json={"model": "gpt-4o", "messages": []})
    assert r.status_code == 404 and r.json()["error"]["code"] == "model_not_offered"
    assert len(up.state.requests) == n

    # Upstream failures come back as 502 with the provider's message, uncharged.
    used = cloud.me(cloud.authenticate(data["api_key"]))["tokens"]["used"]
    settings = app.state.settings
    object.__setattr__(settings, "models", settings.models + (type(settings.models[0])(id="boom", name="Boom", upstream="boom"),))
    r = await client.post("/v1/chat/completions", headers=headers, json={"model": "boom", "messages": []})
    assert r.status_code == 502 and "exploded" in r.json()["error"]["message"]
    assert cloud.me(cloud.authenticate(data["api_key"]))["tokens"]["used"] == used


async def test_stream_passes_through_and_charges_from_usage_chunk(stack):
    app, client, sender, up, cloud = stack
    data = await sign_up(client, sender)
    headers = {"Authorization": f"Bearer {data['api_key']}"}
    async with client.stream("POST", "/v1/chat/completions", headers=headers,
                             json={"model": "qwen3.7-plus", "stream": True,
                                   "messages": [{"role": "user", "content": "hi"}]}) as r:
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("text/event-stream")
        body = (await r.aread()).decode()
    lines = [ln for ln in body.split("\n") if ln.startswith("data:")]
    assert lines[-1] == "data: [DONE]"
    pieces = []
    for ln in lines[:-1]:
        obj = json.loads(ln[5:])
        assert obj.get("model") in ("qwen3.7-plus", None)
        for ch in obj.get("choices", []):
            pieces.append(ch["delta"]["content"])
    assert "".join(pieces) == "你好，世界"
    up_body = up.state.requests[-1][2]
    assert up_body["stream_options"] == {"include_usage": True}
    me = (await client.get("/v1/me", headers=headers)).json()
    assert me["tokens"]["used"] == 46  # 40 + 6 from the usage chunk


async def test_out_of_tokens_and_bad_keys(stack):
    app, client, sender, up, cloud = stack
    data = await sign_up(client, sender)
    headers = {"Authorization": f"Bearer {data['api_key']}"}
    # Seven full-price calls of 150 exhaust a 1000-token grant.
    for _ in range(7):
        r = await client.post("/v1/chat/completions", headers=headers,
                              json={"model": "qwen3.7-plus", "messages": [{"role": "user", "content": "hi"}]})
        assert r.status_code == 200
    r = await client.post("/v1/chat/completions", headers=headers,
                          json={"model": "qwen3.7-plus", "messages": [{"role": "user", "content": "hi"}]})
    assert r.status_code == 402 and r.json()["error"]["code"] == "out_of_tokens"

    # An admin top-up brings it back.
    me = (await client.get("/v1/me", headers=headers)).json()
    accounts = (await client.get("/v1/admin/accounts", headers={"X-Admin-Token": "admin"})).json()["accounts"]
    assert accounts[0]["hint"] == me["account"]["hint"]
    r = await client.post("/v1/admin/grant", headers={"X-Admin-Token": "admin"},
                          json={"account_id": accounts[0]["id"], "tokens": 500})
    assert r.status_code == 200
    # ...or by the phone number itself, which is hashed the same way.
    r = await client.post("/v1/admin/grant", headers={"X-Admin-Token": "admin"},
                          json={"identifier": "138 0013 8000", "tokens": 0})
    assert r.status_code == 200 and r.json()["granted"] == 1500
    r = await client.post("/v1/admin/grant", headers={"X-Admin-Token": "admin"},
                          json={"identifier": "nobody@example.com", "tokens": 1})
    assert r.status_code == 404
    r = await client.post("/v1/chat/completions", headers=headers,
                          json={"model": "qwen3.7-plus", "messages": [{"role": "user", "content": "hi"}]})
    assert r.status_code == 200
    assert (await client.get("/v1/admin/accounts")).status_code == 401

    # Bad, missing and revoked keys.
    assert (await client.get("/v1/models")).status_code == 401
    assert (await client.get("/v1/models", headers={"Authorization": "Bearer nm_nope"})).status_code == 401
    assert (await client.get("/v1/models", headers={"Authorization": "Bearer sk-other"})).status_code == 401
    assert (await client.post("/v1/auth/sign-out", headers=headers)).status_code == 204
    r = await client.get("/v1/me", headers=headers)
    assert r.status_code == 401 and r.json()["error"]["code"] == "bad_key"


async def test_images_go_through_dashscope_native(stack):
    app, client, sender, up, cloud = stack
    data = await sign_up(client, sender)
    headers = {"Authorization": f"Bearer {data['api_key']}"}
    # 30 000 per picture is more than the 1 000 grant: refused first.
    r = await client.post("/v1/images/generations", headers=headers,
                          json={"model": "qwen-image-3.0-pro", "prompt": "a small dragon", "size": "1024x1024"})
    assert r.status_code == 402
    accounts = (await client.get("/v1/admin/accounts", headers={"X-Admin-Token": "admin"})).json()["accounts"]
    await client.post("/v1/admin/grant", headers={"X-Admin-Token": "admin"},
                      json={"account_id": accounts[0]["id"], "tokens": 100_000})

    r = await client.post("/v1/images/generations", headers=headers,
                          json={"model": "qwen-image-3.0-pro", "prompt": "a small dragon", "size": "1024x1024", "response_format": "b64_json"})
    assert r.status_code == 200, r.text
    assert base64.b64decode(r.json()["data"][0]["b64_json"]) == PNG_1PX
    kind, up_headers, up_body = up.state.requests[-1]
    assert kind == "image" and up_body["model"] == "qwen-image-3.0-pro"
    assert up_body["parameters"] == {"size": "1024*1024", "watermark": False, "prompt_extend": False}
    assert up_body["input"]["messages"][0]["content"] == [{"text": "a small dragon"}]
    assert r.headers["x-nanomuse-charged"] == "30000"

    r = await client.post("/v1/images/edits", headers=headers,
                          data={"model": "qwen-image-3.0-pro", "prompt": "same dragon, waving", "n": "1", "size": "1024x1024"},
                          files={"image": ("image0.png", PNG_1PX, "image/png")})
    assert r.status_code == 200, r.text
    kind, up_headers, up_body = up.state.requests[-1]
    content = up_body["input"]["messages"][0]["content"]
    assert content[0]["image"].startswith("data:image/png;base64,") and content[1] == {"text": "same dragon, waving"}
    me = (await client.get("/v1/me", headers=headers)).json()
    assert me["tokens"]["used"] == 60_000


async def test_unconfigured_upstream_answers_503(stack):
    app, client, sender, up, cloud = stack
    object.__setattr__(app.state.settings, "upstream_key", "")
    data = await sign_up(client, sender)
    r = await client.post("/v1/chat/completions", headers={"Authorization": f"Bearer {data['api_key']}"},
                          json={"model": "qwen3.7-plus", "messages": []})
    assert r.status_code == 503 and r.json()["error"]["code"] == "upstream_unconfigured"
    assert (await client.get("/healthz")).json()["ok"] is True
