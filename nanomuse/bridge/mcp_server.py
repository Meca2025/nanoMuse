"""The hands as an MCP server: ``nanomuse mcp``.

A host that is not our runtime — nanoMuse on DeepSeek Harness (docs/harness.md) — gets
this computer's screen and hands the way it gets any other capability: as an MCP server
on stdio. The two tools are the runtime's own ``computer_screen`` and ``computer_act``
(:mod:`nanomuse.tools.computer`), with their descriptions and schemas, so a model that
knows one host knows the other; ``computer_task`` stays home, because the host's model
runs the loop itself.

What the Sentinel does in the runtime, the bridge does at the model's level: a call the
runtime would ask the person about — Enter or a submit, a heavy shortcut, a click on words
from the sensitive list (password, pay, …) — is refused with the reason, unless the call
carries ``confirmed: true``, which the model may only set after the person said yes in
the conversation. The host's own approval policy can put a real gate in front of
``computer_act`` as well; this one is what keeps nanoMuse's promise meanwhile.

Compatible with mcp 1.x and 2.x, like the client in :mod:`nanomuse.tools.mcp_tools`.
"""

from __future__ import annotations

import base64
import inspect
import json
from pathlib import Path
from typing import Any

from nanomuse.computer.link import ComputerLink
from nanomuse.config import Settings
from nanomuse.schema import RiskLevel, ToolResult
from nanomuse.tools.base import BaseTool
from nanomuse.tools.computer import ComputerAct, ComputerScreen

SERVER_NAME = "nanomuse"
CONFIRMED = "confirmed"

_MIME = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}


def hands_tools(settings: Settings, link: ComputerLink | None = None) -> list[BaseTool]:
    """The screen and the hands of this computer, as the runtime builds them."""
    link = link or ComputerLink(settings.hands, shots_dir=settings.agent.workspace / "screenshots")
    return [ComputerScreen(link=link), ComputerAct(link=link, gui=settings.gui)]


def exposed_schema(tool: BaseTool) -> dict[str, Any]:
    """The tool's schema with the bridge's ``confirmed`` flag on the ones that need it."""
    schema: dict[str, Any] = json.loads(json.dumps(tool.parameters))
    if tool.risk != RiskLevel.SAFE:
        props = schema.setdefault("properties", {})
        props[CONFIRMED] = {
            "type": "boolean",
            "description": (
                "Set only after the person agreed, in the conversation, to this exact step. "
                "Needed for Enter or a submit, heavy shortcuts, and clicks on words from the "
                "sensitive list; a refused call says which."
            ),
        }
    return schema


def exposed_description(tool: BaseTool) -> str:
    if tool.risk == RiskLevel.SAFE:
        return tool.description
    return (
        tool.description + " Steps the person must agree to first are refused with the reason; "
        "ask, then call again with `confirmed: true`."
    )


def gate(tool: BaseTool, args: dict[str, Any]) -> str | None:
    """Why this call is not run without the person's word, or ``None`` to run it."""
    if tool.risk == RiskLevel.SAFE or args.get(CONFIRMED) is True:
        return None
    assessment = tool.assess(args)
    if assessment.risk in (RiskLevel.SAFE, RiskLevel.MODERATE):
        return None
    reasons = "; ".join(assessment.warnings) or "this step acts on the person's behalf"
    return (
        f"Not done — {assessment.summary}: {reasons}. Ask the person whether to go ahead, and "
        f"call again with `{CONFIRMED}: true` once they said yes."
    )


async def call(tool: BaseTool, args: dict[str, Any]) -> ToolResult:
    refused = gate(tool, args)
    if refused is not None:
        return ToolResult.fail(refused)
    clean = {k: v for k, v in args.items() if k != CONFIRMED}
    try:
        return await tool.execute(**clean)
    except Exception as exc:  # noqa: BLE001 - the host gets a message, not a dead server
        return ToolResult.fail(f"{type(exc).__name__}: {exc}")


def content_blocks(result: ToolResult) -> list[dict[str, Any]]:
    """The result as MCP content: the text, then each picture that exists."""
    blocks: list[dict[str, Any]] = [{"type": "text", "text": result.for_model()}]
    for path in result.images or []:
        p = Path(path)
        mime = _MIME.get(p.suffix.lower())
        if mime is None or not p.is_file():
            continue
        blocks.append(
            {"type": "image", "data": base64.b64encode(p.read_bytes()).decode(), "mimeType": mime}
        )
    return blocks


def tool_listing(tools: list[BaseTool]) -> list[dict[str, Any]]:
    return [
        {"name": t.name, "description": exposed_description(t), "inputSchema": exposed_schema(t)}
        for t in tools
    ]


async def serve(tools: list[BaseTool]) -> None:
    """Run the MCP server on stdio until the host closes it."""
    from mcp import types
    from mcp.server.lowlevel import Server
    from mcp.server.stdio import stdio_server

    by_name = {t.name: t for t in tools}
    instructions = (
        "This computer's screen and hands, from nanoMuse. Look first (computer_screen), act "
        "in small steps (computer_act), look again. Coordinates are pixels of the last "
        "screenshot."
    )

    def listing() -> list[Any]:
        return [types.Tool.model_validate(t) for t in tool_listing(tools)]

    async def run_tool(name: str, arguments: dict[str, Any] | None) -> tuple[list[Any], bool]:
        tool = by_name.get(name)
        if tool is None:
            result = ToolResult.fail(f"no tool named {name!r}")
        else:
            result = await call(tool, dict(arguments or {}))
        blocks = [
            types.ImageContent.model_validate(b)
            if b["type"] == "image"
            else types.TextContent.model_validate(b)
            for b in content_blocks(result)
        ]
        return blocks, not result.ok

    server: Any
    if "on_call_tool" in inspect.signature(Server.__init__).parameters:  # mcp >= 2

        async def on_list_tools(_ctx: Any, _params: Any) -> Any:
            return types.ListToolsResult(tools=listing())

        async def on_call_tool(_ctx: Any, params: Any) -> Any:
            blocks, is_error = await run_tool(params.name, params.arguments)
            return types.CallToolResult.model_validate({"content": blocks, "isError": is_error})

        server = Server(
            SERVER_NAME,
            instructions=instructions,
            on_list_tools=on_list_tools,
            on_call_tool=on_call_tool,
        )
    else:  # mcp 1.x: decorators
        server = Server(SERVER_NAME, instructions=instructions)

        @server.list_tools()
        async def _list() -> list[Any]:
            return listing()

        @server.call_tool()
        async def _call(name: str, arguments: dict[str, Any] | None) -> list[Any]:
            blocks, _ = await run_tool(name, arguments)
            return blocks

    async with stdio_server() as (read, write):
        await server.run(read, write, server.create_initialization_options())


__all__ = [
    "CONFIRMED",
    "SERVER_NAME",
    "call",
    "content_blocks",
    "exposed_description",
    "exposed_schema",
    "gate",
    "hands_tools",
    "serve",
    "tool_listing",
]
