"""The ChatGPT sign-in: the token store, refresh, the Codex translation, the CLI.

Nothing here reaches the network: the token endpoint and the Codex endpoint are
``httpx.MockTransport`` handlers, the tokens are made-up JWTs with the claims we read.
"""

from __future__ import annotations

import asyncio
import base64
import json
import stat
import sys
import time
from pathlib import Path
from typing import Any

import httpx
import pytest
from typer.testing import CliRunner

from nanomuse.config import LLMSettings
from nanomuse.llm.chatgpt import (
    Auth,
    ChatGPTError,
    Token,
    TokenStore,
    account_from,
    plan_label,
)
from nanomuse.llm.codex import CodexClient, CodexLLM, StreamState, sse_events, to_codex
from nanomuse.schema import Message

TOKEN_URL = "https://auth.test/oauth/token"
RESPONSES_URL = "https://codex.test/responses"


def _b64(data: dict[str, Any]) -> str:
    return base64.urlsafe_b64encode(json.dumps(data).encode()).rstrip(b"=").decode()


def jwt(account: str = "acct-1", plan: str = "plus", nonce: str = "a") -> str:
    """A token with the two claims the runtime reads; nothing is verified."""
    claims = {
        "https://api.openai.com/auth": {
            "chatgpt_account_id": account,
            "chatgpt_plan_type": plan,
        },
        "nonce": nonce,
    }
    return f"{_b64({'alg': 'none'})}.{_b64(claims)}.sig"


def token(expires_in: int = 3600, nonce: str = "a") -> Token:
    now = int(time.time())
    return Token(
        access=jwt(nonce=nonce),
        refresh="rt-" + nonce,
        expires_at=now + expires_in,
        account_id="acct-1",
        plan="plus",
        label="ChatGPT Plus",
        obtained_at=now,
    )


def sse(events: list[dict[str, Any]]) -> bytes:
    return b"".join(f"data: {json.dumps(e)}\n\n".encode() for e in events) + b"data: [DONE]\n\n"


# ----------------------------------------------------------------------------- claims
def test_the_claims_and_the_plan_label():
    assert account_from(jwt("acc", "pro")) == ("acc", "pro")
    assert account_from("not.a.jwt") == ("", "")
    assert plan_label("plus") == "ChatGPT Plus"
    assert plan_label("team") == "ChatGPT Team"
    assert plan_label("") == "ChatGPT" and plan_label("free") == "ChatGPT"
    assert plan_label("enterprise") == "ChatGPT Enterprise"


def test_a_token_payload_without_an_account_is_refused():
    with pytest.raises(ChatGPTError) as exc:
        Token.from_payload({"access_token": f"{_b64({})}.{_b64({'sub': 'x'})}.s"})
    assert exc.value.code == "no_account"
    with pytest.raises(ChatGPTError) as exc:
        Token.from_payload({})
    assert exc.value.code == "exchange_failed"


# ----------------------------------------------------------------------------- the store
def test_the_store_is_written_0600_and_never_shows_the_tokens(tmp_path: Path):
    store = TokenStore.in_dir(tmp_path / "data")
    assert store.load() is None
    store.save(token())
    assert store.path.name == "chatgpt.json"
    if sys.platform != "win32":
        assert stat.S_IMODE(store.path.stat().st_mode) == 0o600
    loaded = store.load()
    assert loaded is not None and loaded.label == "ChatGPT Plus"
    public = loaded.public()
    assert "access" not in public and "refresh" not in public
    assert public["plan"] == "plus" and public["expires_in"] > 3500
    assert store.clear() is True and store.load() is None
    assert store.clear() is False


@pytest.mark.asyncio
async def test_refresh_happens_at_the_margin_with_the_new_token_stored(tmp_path: Path):
    store = TokenStore.in_dir(tmp_path)
    store.save(token(expires_in=30, nonce="old"))
    calls: list[dict[str, str]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == TOKEN_URL
        form = dict(p.split("=", 1) for p in request.content.decode().split("&"))
        calls.append(form)
        return httpx.Response(
            200,
            json={"access_token": jwt(nonce="new"), "refresh_token": "rt-new", "expires_in": 3600},
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        auth = Auth(store, http=http, token_url=TOKEN_URL)
        fresh = await auth.token()
        assert len(calls) == 1
        assert calls[0]["grant_type"] == "refresh_token" and calls[0]["refresh_token"] == "rt-old"
        assert fresh.refresh == "rt-new" and fresh.expires_in > 3500
        assert store.load().access == fresh.access
        # good for an hour: no second call
        assert (await auth.token()).access == fresh.access
        assert len(calls) == 1


@pytest.mark.asyncio
async def test_a_refused_refresh_clears_the_store(tmp_path: Path):
    store = TokenStore.in_dir(tmp_path)
    store.save(token(expires_in=10))

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"error": "invalid_grant"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        auth = Auth(store, http=http, token_url=TOKEN_URL)
        with pytest.raises(ChatGPTError) as exc:
            await auth.token()
    assert exc.value.code == "not_signed_in"
    assert store.load() is None
    assert not auth.signed_in()


# ----------------------------------------------------------------------------- translation
def test_chat_completions_to_the_codex_responses_body():
    body = {
        "model": "gpt-5.6-sol",
        "temperature": 0.3,
        "max_tokens": 100,
        "top_p": 0.9,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": "Be brief."},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "What is this?"},
                    {
                        "type": "image_url",
                        "image_url": {"url": "data:image/png;base64,AAAA", "detail": "low"},
                    },
                ],
            },
            {
                "role": "assistant",
                "content": None,
                "tool_calls": [
                    {
                        "id": "call_1",
                        "type": "function",
                        "function": {"name": "lookup", "arguments": '{"q": "x"}'},
                    }
                ],
            },
            {"role": "tool", "tool_call_id": "call_1", "content": "42"},
            {"role": "assistant", "content": "It is 42."},
            {"role": "user", "content": "thanks"},
        ],
        "tools": [
            {
                "type": "function",
                "function": {
                    "name": "lookup",
                    "description": "Look up",
                    "parameters": {"type": "object", "properties": {"q": {"type": "string"}}},
                },
            }
        ],
        "tool_choice": {"type": "function", "function": {"name": "lookup"}},
    }
    out = to_codex(body)
    assert out["model"] == "gpt-5.6-sol"
    assert out["instructions"] == "Be brief."
    assert out["store"] is False and out["stream"] is True
    assert out["parallel_tool_calls"] is True
    assert out["include"] == ["reasoning.encrypted_content"]
    for dropped in ("temperature", "max_tokens", "max_output_tokens", "top_p", "response_format"):
        assert dropped not in out
    assert out["input"] == [
        {
            "role": "user",
            "content": [
                {"type": "input_text", "text": "What is this?"},
                {"type": "input_image", "image_url": "data:image/png;base64,AAAA", "detail": "low"},
            ],
        },
        {"type": "function_call", "call_id": "call_1", "name": "lookup", "arguments": '{"q": "x"}'},
        {"type": "function_call_output", "call_id": "call_1", "output": "42"},
        {
            "type": "message",
            "role": "assistant",
            "content": [{"type": "output_text", "text": "It is 42."}],
            "status": "completed",
        },
        {"role": "user", "content": [{"type": "input_text", "text": "thanks"}]},
    ]
    assert out["tools"] == [
        {
            "type": "function",
            "name": "lookup",
            "description": "Look up",
            "parameters": {"type": "object", "properties": {"q": {"type": "string"}}},
            "strict": False,
        }
    ]
    assert out["tool_choice"] == {"type": "function", "name": "lookup"}
    # arguments given as an object become a JSON string; a tool result in parts is encoded
    out2 = to_codex(
        {
            "messages": [
                {
                    "role": "assistant",
                    "tool_calls": [{"id": "c", "function": {"name": "f", "arguments": {"a": 1}}}],
                },
                {"role": "tool", "tool_call_id": "c", "content": [{"type": "text", "text": "ok"}]},
            ],
            "reasoning_effort": "low",
        }
    )
    assert out2["input"][0]["arguments"] == '{"a": 1}'
    assert json.loads(out2["input"][1]["output"]) == [{"type": "text", "text": "ok"}]
    assert out2["reasoning"] == {"summary": "auto", "effort": "low"}
    assert "tools" not in out2 and out2["model"] == "gpt-5.6-sol"


@pytest.mark.asyncio
async def test_the_responses_stream_becomes_chat_completions_chunks():
    events = [
        {"type": "response.created", "response": {"id": "resp_1"}},
        {"type": "response.reasoning_summary_text.delta", "delta": "thinking"},
        {"type": "response.output_text.delta", "delta": "Hel"},
        {"type": "response.output_text.delta", "delta": "lo"},
        {
            "type": "response.output_item.added",
            "item": {
                "type": "function_call",
                "call_id": "call_9",
                "name": "lookup",
                "arguments": "",
            },
        },
        {"type": "response.function_call_arguments.delta", "call_id": "call_9", "delta": '{"q":'},
        {"type": "response.function_call_arguments.delta", "call_id": "call_9", "delta": " 1}"},
        {
            "type": "response.completed",
            "response": {"usage": {"input_tokens": 10, "output_tokens": 5, "total_tokens": 15}},
        },
    ]

    async def lines():
        for line in sse(events).decode().split("\n"):
            yield line

    state = StreamState(model="gpt-5.6-sol")
    chunks: list[dict[str, Any]] = []
    async for event in sse_events(lines()):
        chunks.extend(state.feed(event))
    deltas = [c["choices"][0]["delta"] for c in chunks]
    assert deltas[0] == {"reasoning_content": "thinking"}
    assert deltas[1] == {"content": "Hel"} and deltas[2] == {"content": "lo"}
    assert deltas[3]["tool_calls"] == [
        {
            "index": 0,
            "id": "call_9",
            "type": "function",
            "function": {"name": "lookup", "arguments": ""},
        }
    ]
    assert deltas[4]["tool_calls"] == [{"index": 0, "function": {"arguments": '{"q":'}}]
    final = chunks[-1]
    assert final["choices"][0]["finish_reason"] == "tool_calls"
    assert final["usage"] == {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15}
    assert all(c["object"] == "chat.completion.chunk" for c in chunks)
    done = state.completion()
    assert done["choices"][0]["message"]["content"] == "Hello"
    assert done["choices"][0]["message"]["tool_calls"][0]["function"]["arguments"] == '{"q": 1}'
    assert done["choices"][0]["finish_reason"] == "tool_calls"


def test_a_cut_off_answer_and_an_upstream_failure():
    state = StreamState(model="m")
    state.feed({"type": "response.output_text.delta", "delta": "half"})
    [final] = state.feed(
        {
            "type": "response.incomplete",
            "response": {"incomplete_details": {"reason": "max_output_tokens"}, "usage": {}},
        }
    )
    assert final["choices"][0]["finish_reason"] == "length"
    failed = StreamState(model="m")
    [err] = failed.feed({"type": "response.failed", "response": {"error": {"message": "boom"}}})
    assert err["choices"][0]["finish_reason"] == "error" and err["error"]["message"] == "boom"


@pytest.mark.asyncio
async def test_a_401_refreshes_the_token_once_and_retries(tmp_path: Path):
    store = TokenStore.in_dir(tmp_path)
    store.save(token(nonce="old"))
    seen: list[tuple[str, str]] = []  # (url, bearer)

    def handler(request: httpx.Request) -> httpx.Response:
        bearer = request.headers.get("authorization", "").removeprefix("Bearer ")
        seen.append((str(request.url), bearer))
        if str(request.url) == TOKEN_URL:
            return httpx.Response(
                200, json={"access_token": jwt(nonce="new"), "refresh_token": "rt-new"}
            )
        if bearer == jwt(nonce="old"):
            return httpx.Response(401, json={"error": {"message": "expired"}})
        assert request.headers["chatgpt-account-id"] == "acct-1"
        assert request.headers["originator"] == "nanomuse"
        assert request.headers["openai-beta"] == "responses=experimental"
        body = json.loads(request.content)
        assert body["store"] is False and body["instructions"].startswith("You are")
        return httpx.Response(
            200,
            headers={"content-type": "text/event-stream"},
            content=sse(
                [
                    {"type": "response.output_text.delta", "delta": "OK"},
                    {"type": "response.completed", "response": {"usage": {"input_tokens": 1}}},
                ]
            ),
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        client = CodexClient(
            Auth(store, http=http, token_url=TOKEN_URL), http=http, url=RESPONSES_URL
        )
        llm = CodexLLM(LLMSettings(provider="chatgpt"), client=client)
        reply = await llm.ask([Message.system("You are a test."), Message.user("Say OK")])
    assert reply.content == "OK" and reply.finish_reason == "stop"
    assert reply.usage["prompt_tokens"] == 1
    assert [u for u, _ in seen] == [RESPONSES_URL, TOKEN_URL, RESPONSES_URL]
    assert seen[0][1] == jwt(nonce="old") and seen[2][1] == jwt(nonce="new")
    assert store.load().refresh == "rt-new"


@pytest.mark.asyncio
async def test_a_second_401_is_an_error_and_keeps_the_store(tmp_path: Path):
    store = TokenStore.in_dir(tmp_path)
    store.save(token(nonce="old"))

    def handler(request: httpx.Request) -> httpx.Response:
        if str(request.url) == TOKEN_URL:
            return httpx.Response(200, json={"access_token": jwt(nonce="new")})
        return httpx.Response(401, json={"error": {"message": "still no"}})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        client = CodexClient(
            Auth(store, http=http, token_url=TOKEN_URL), http=http, url=RESPONSES_URL
        )
        llm = CodexLLM(LLMSettings(provider="chatgpt"), client=client)
        with pytest.raises(RuntimeError, match="ChatGPT: still no"):
            await llm.ask([Message.user("hi")])
    assert store.load() is not None


# ----------------------------------------------------------------------------- the CLI
@pytest.fixture()
def cli_home(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """A home of its own: no ./config/config.toml, no ~/.nanomuse, a temporary data dir."""
    from nanomuse import config as config_module

    for var in ("NANOMUSE_CONFIG", "DEEPSEEK_API_KEY", "OPENAI_API_KEY"):
        monkeypatch.delenv(var, raising=False)
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(config_module, "DEFAULT_DATA_DIR", tmp_path / "home")
    data = tmp_path / "data"
    monkeypatch.setenv("NANOMUSE_DATA_DIR", str(data))
    return data


def test_the_cli_status_and_logout_as_json(cli_home: Path):
    from nanomuse.cli import app

    runner = CliRunner()
    out = runner.invoke(app, ["chatgpt", "status", "--json"])
    assert out.exit_code == 0, out.output
    view = json.loads(out.stdout.strip())
    assert view["signed_in"] is False and view["label"] == "" and view["expires_at"] == 0
    assert view["models"] == ["gpt-5.6-sol", "gpt-5.4", "gpt-5.4-mini"]
    assert view["path"] == str(cli_home / "chatgpt.json")

    TokenStore.in_dir(cli_home).save(token())
    out = runner.invoke(app, ["chatgpt", "status", "--json"])
    view = json.loads(out.stdout.strip())
    assert view["signed_in"] is True and view["label"] == "ChatGPT Plus" and view["plan"] == "plus"
    assert view["account_id"] == "acct-1" and 3500 < view["expires_in"] <= 3600
    assert "access" not in view and jwt() not in out.output and "rt-a" not in out.output

    out = runner.invoke(app, ["chatgpt", "logout", "--json"])
    assert json.loads(out.stdout.strip()) == {"ok": True, "was_signed_in": True}
    assert not (cli_home / "chatgpt.json").exists()
    out = runner.invoke(app, ["chatgpt", "logout", "--json"])
    assert json.loads(out.stdout.strip()) == {"ok": True, "was_signed_in": False}


def test_the_cli_status_in_words(cli_home: Path):
    from nanomuse.cli import app

    runner = CliRunner()
    out = runner.invoke(app, ["chatgpt", "status"])
    assert out.exit_code == 0 and "not signed in" in out.output
    TokenStore.in_dir(cli_home).save(token())
    out = runner.invoke(app, ["chatgpt", "status"])
    assert "ChatGPT Plus" in out.output and "expires in" in out.output


def test_the_cli_proxy_refuses_when_signed_out(cli_home: Path):
    from nanomuse.cli import app

    out = CliRunner().invoke(app, ["chatgpt", "proxy", "--json"])
    assert out.exit_code == 1
    assert json.loads(out.stdout.strip())["code"] == "not_signed_in"


@pytest.mark.asyncio
async def test_the_login_flow_against_a_local_fake(tmp_path: Path):
    """The whole PKCE flow with a fake token endpoint: the port, the callback, the exchange."""
    from urllib.parse import parse_qs, urlparse

    from nanomuse.llm.chatgpt import LoginFlow

    store = TokenStore.in_dir(tmp_path)
    exchanged: list[dict[str, str]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        form = dict(p.split("=", 1) for p in request.content.decode().split("&"))
        exchanged.append(form)
        return httpx.Response(
            200, json={"access_token": jwt(), "refresh_token": "rt", "expires_in": 60}
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        flow = LoginFlow(store, token_url=TOKEN_URL, port=0, http=http)
        assert await flow.listen() is True
        query = parse_qs(urlparse(flow.url).query)
        assert query["code_challenge_method"] == ["S256"] and query["state"] == [flow.state]
        assert query["originator"] == ["nanomuse"] and query["redirect_uri"] == [flow.redirect_uri]
        port = flow._server.sockets[0].getsockname()[1]  # type: ignore[union-attr]

        async def browser() -> None:
            await asyncio.sleep(0.05)
            async with httpx.AsyncClient() as real:
                r = await real.get(
                    f"http://127.0.0.1:{port}/auth/callback?code=abc&state={flow.state}"
                )
                assert r.status_code == 200 and "Signed in" in r.text

        browser_task = asyncio.create_task(browser())
        result = await flow.wait(timeout=5)
        await browser_task
        assert result.code == "abc" and result.state == flow.state
        stored = await flow.finish(result)
    assert stored.label == "ChatGPT Plus" and store.load() is not None
    assert exchanged[0]["grant_type"] == "authorization_code"
    assert exchanged[0]["code"] == "abc" and exchanged[0]["code_verifier"] == flow.verifier
    # a callback with another state is refused before anything is exchanged
    other = LoginFlow(store, token_url=TOKEN_URL, port=0)
    with pytest.raises(ChatGPTError) as exc:
        await other.finish(
            LoginFlow._parse_callback("http://localhost:1455/auth/callback?code=x&state=y")
        )
    assert exc.value.code == "state_mismatch"
