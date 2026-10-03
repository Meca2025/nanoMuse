"""The hands as an MCP server (`nanomuse mcp`, nanomuse/bridge/mcp_server.py): the tool
listing another host sees, the gate that stands in for the Sentinel, the pictures in
the result — and the server itself, driven over stdio by the SDK's client."""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any

import pytest

from nanomuse.bridge.mcp_server import (
    CONFIRMED,
    call,
    connector_tools,
    content_blocks,
    exposed_schema,
    gate,
    hands_tools,
    tool_listing,
)
from nanomuse.config import Settings
from nanomuse.schema import ToolResult
from tests.test_computer import fake_screen, make_link  # noqa: F401  # the fixture

pytestmark = pytest.mark.usefixtures("fake_screen")


def tools(settings: Settings) -> tuple[Any, Any]:
    screen, act = hands_tools(settings, link=make_link(settings))
    return screen, act


def test_listing_is_the_runtime_tools_with_the_confirmed_flag(settings: Settings) -> None:
    listing = tool_listing(list(tools(settings)))
    assert [t["name"] for t in listing] == ["computer_screen", "computer_act"]
    screen, act = listing
    assert CONFIRMED not in screen["inputSchema"].get("properties", {})
    assert CONFIRMED in act["inputSchema"]["properties"]
    assert act["inputSchema"]["required"] == ["action"]
    assert "ask, then call again" in act["description"]
    # the runtime's own schema is untouched
    _, act_tool = tools(settings)
    assert CONFIRMED not in act_tool.parameters["properties"]
    assert exposed_schema(act_tool) is not act_tool.parameters


def test_connectors_come_along_when_config_turns_them_on(settings: Settings) -> None:
    # the default config: the address book is on, the mailbox and the calendar are not
    assert [t.name for t in connector_tools(settings)] == ["contacts"]
    settings.connectors.email.enabled = True
    settings.connectors.calendar.enabled = True
    names = [t.name for t in connector_tools(settings)]
    assert names == ["read_emails", "send_email", "calendar", "contacts"]
    listing = tool_listing(
        hands_tools(settings, link=make_link(settings)) + connector_tools(settings)
    )
    assert [t["name"] for t in listing][:2] == ["computer_screen", "computer_act"]
    assert {"read_emails", "send_email", "calendar", "contacts"} <= {t["name"] for t in listing}
    settings.connectors.contacts.enabled = False
    settings.connectors.email.enabled = False
    settings.connectors.calendar.enabled = False
    assert connector_tools(settings) == []


def test_gate_asks_for_what_the_sentinel_would_ask(settings: Settings) -> None:
    screen, act = tools(settings)
    assert gate(screen, {}) is None
    assert gate(act, {"action": "click", "x": 1, "y": 2, "label": "Open"}) is None
    refused = gate(act, {"action": "key", "keys": ["enter"]})
    assert refused is not None and "press enter" in refused and CONFIRMED in refused
    refused = gate(act, {"action": "type", "text": "hi", "submit": True})
    assert refused is not None
    refused = gate(act, {"action": "click", "x": 1, "y": 2, "label": "Pay now"})
    assert refused is not None and "pay" in refused.lower()
    assert gate(act, {"action": "key", "keys": ["enter"], CONFIRMED: True}) is None


def test_with_a_host_secret_only_the_hosts_ticket_confirms(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    from nanomuse.bridge.mcp_server import CONFIRM_SECRET_ENV, REFUSED, ticket

    screen, act = tools(settings)
    monkeypatch.setenv(CONFIRM_SECRET_ENV, "s3cret")
    enter = {"action": "key", "keys": ["enter"]}
    # the model's own word is no longer enough
    refused = gate(act, {**enter, CONFIRMED: True})
    assert refused is not None and refused.startswith(REFUSED) and "permission card" in refused
    # the host's ticket over these exact arguments is
    assert gate(act, {**enter, CONFIRMED: ticket("s3cret", enter)}) is None
    # ... and confirms nothing else
    other = {"action": "type", "text": "hi", "submit": True}
    assert gate(act, {**other, CONFIRMED: ticket("s3cret", enter)}) is not None
    assert gate(act, {**enter, CONFIRMED: ticket("other", enter)}) is not None
    # the ticket ignores the confirmed field itself and is stable across key order
    assert ticket("s3cret", {"keys": ["enter"], "action": "key", CONFIRMED: "x"}) == ticket(
        "s3cret", enter
    )
    schema = exposed_schema(act)
    assert schema["properties"][CONFIRMED]["type"] == "string"
    assert "permission card" in tool_listing([act])[0]["description"]
    assert gate(screen, {}) is None


async def test_call_runs_the_tool_without_the_flag_and_returns_pictures(settings: Settings) -> None:
    screen, act = tools(settings)
    result = await call(screen, {})
    assert result.ok and result.images
    blocks = content_blocks(result)
    assert blocks[0]["type"] == "text" and "Firefox" in blocks[0]["text"]
    assert blocks[1]["type"] == "image" and blocks[1]["mimeType"] in ("image/jpeg", "image/png")

    done = await call(act, {"action": "click", "x": 10, "y": 20, "label": "Open", CONFIRMED: True})
    assert done.ok, done.error
    assert act.link._backend.calls[0][0] == "click"  # type: ignore[union-attr]

    refused = await call(act, {"action": "key", "keys": ["enter"]})
    assert not refused.ok and "Not done" in (refused.error or "")
    assert len(act.link._backend.calls) == 1  # type: ignore[union-attr]


def test_content_blocks_skip_pictures_that_are_not_there(tmp_path: Path) -> None:
    result = ToolResult(output="x", images=[str(tmp_path / "gone.png"), str(tmp_path / "odd.txt")])
    (tmp_path / "odd.txt").write_text("not a picture")
    assert [b["type"] for b in content_blocks(result)] == ["text"]


async def test_server_over_stdio(tmp_path: Path) -> None:
    """`nanomuse mcp` as another host runs it: the tools, a refused step, a look."""
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client

    env = {
        **os.environ,
        "NANOMUSE_WORKSPACE": str(tmp_path / "ws"),
        "NANOMUSE_DATA_DIR": str(tmp_path / "data"),
        "NANOMUSE_CONFIG": str(tmp_path / "none.toml"),
    }
    params = StdioServerParameters(
        command=sys.executable,
        args=[
            "-c",
            f"import sys; sys.argv=['nanomuse','mcp']; sys.path.insert(0, {str(Path(__file__).resolve().parents[1])!r}); from nanomuse.cli import app; app()",
        ],
        env=env,
    )
    async with stdio_client(params) as (read, write), ClientSession(read, write) as session:
        init = await session.initialize()
        assert "nanoMuse" in (init.instructions or "")
        listed = await session.list_tools()
        # the hands, plus the address book the default config keeps on
        assert sorted(t.name for t in listed.tools) == [
            "computer_act",
            "computer_screen",
            "contacts",
        ]
        refused = await session.call_tool("computer_act", {"action": "key", "keys": ["enter"]})
        assert getattr(refused, "is_error", getattr(refused, "isError", None)) is True
        assert "Not done" in refused.content[0].text  # type: ignore[union-attr]
        looked = await session.call_tool("computer_screen", {})
        text = looked.content[0].text  # type: ignore[union-attr]
        # a machine without a display answers with the reason, one with a display with the screen
        assert isinstance(text, str) and text


def test_cli_has_the_command() -> None:
    from nanomuse.cli import app

    names = {getattr(c, "name", None) or c.callback.__name__ for c in app.registered_commands}  # type: ignore[union-attr]
    assert "mcp" in names
