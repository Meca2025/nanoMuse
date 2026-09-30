"""The sentence a failed run leaves in the chat (nanomuse/server/failures.py)."""

from __future__ import annotations

import httpx
import openai

from nanomuse.server.failures import describe_failure, failure_notice


def _status_error(cls, status: int, body: dict):
    request = httpx.Request("POST", "https://relay.test/v1/chat/completions")
    response = httpx.Response(status, request=request, json={"error": body})
    return cls(body.get("message", "no"), response=response, body=body)


def test_relay_refusals_are_named_by_code():
    exc = _status_error(
        openai.RateLimitError, 429, {"code": "daily_cap", "message": "Today's share …"}
    )
    code, text = describe_failure(exc)
    assert code == "allowance" and "Connections" in text and "midnight" in text

    exc = _status_error(
        openai.PermissionDeniedError, 402, {"code": "out_of_tokens", "message": "…"}
    )
    assert describe_failure(exc)[0] == "allowance"

    # the streaming path: openai.APIError with the relay's body and no HTTP status
    exc = openai.APIError(
        "The relay's model provider refused its key", request=None, body={"code": "upstream_auth"}
    )  # type: ignore[arg-type]
    code, text = describe_failure(exc)
    assert code == "relay" and "operator" in text

    exc = openai.APIError("busy", request=None, body={"code": "upstream_503", "message": "x"})  # type: ignore[arg-type]
    assert describe_failure(exc)[0] == "provider"


def test_own_key_failures():
    exc = _status_error(openai.AuthenticationError, 401, {"message": "Incorrect API key provided"})
    code, text = describe_failure(exc)
    assert code == "key" and "Incorrect API key" not in text

    exc = _status_error(
        openai.BadRequestError,
        400,
        {"message": "This model's maximum context length is 32768 tokens"},
    )
    assert describe_failure(exc)[0] == "too_long"

    exc = _status_error(openai.BadRequestError, 400, {"message": "unknown parameter foo"})
    code, text = describe_failure(exc)
    assert code == "request" and "unknown parameter foo" in text

    assert (
        describe_failure(openai.APITimeoutError(httpx.Request("POST", "https://x")))[0] == "timeout"
    )
    assert (
        describe_failure(openai.APIConnectionError(request=httpx.Request("POST", "https://x")))[0]
        == "network"
    )
    assert (
        describe_failure(_status_error(openai.NotFoundError, 404, {"message": "model not found"}))[
            0
        ]
        == "model"
    )


def test_unknown_failures_keep_the_type_and_first_line():
    code, text = describe_failure(ValueError("first line\nsecond line"))
    assert code == "unknown" and text == "Something went wrong: ValueError: first line"
    notice = failure_notice(ValueError("boom"), "t1")
    assert notice["type"] == "notice" and notice["level"] == "error" and notice["thread"] == "t1"
    assert notice["code"] == "unknown" and notice["detail"] == "ValueError: boom"
