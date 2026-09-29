"""The hub end of the runtime: local actions, the async client against a fake relay, and
the service that turns another device's `task` into a visible side chat (and a side chat
addressed to a device into a `task` on it) — docs/hub.md, docs/every-device.md."""

from __future__ import annotations

import asyncio
import base64
import json
import queue
import sys
import threading
import time
from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from websockets.asyncio.server import serve

from nanomuse.cloud import CloudClient, hub_url, model_url
from nanomuse.config import Settings
from nanomuse.hub import actions
from nanomuse.hub.client import HubClient, HubError
from nanomuse.llm import MockLLM
from nanomuse.schema import Function, LLMResponse, ToolCall
from nanomuse.server import create_app
from nanomuse.server.service import MuseService

pytestmark = pytest.mark.skipif(sys.platform == "win32", reason="posix shell in the tests")

PHONE = {
    "id": "phone-1",
    "name": "Pixel",
    "kind": "phone",
    "os": "Android 15",
    "online": True,
    "actions": ["info", "shell", "files", "screen", "task", "stop", "approve"],
}


def tc(name: str, **args: Any) -> ToolCall:
    return ToolCall(function=Function(name=name, arguments=json.dumps(args)))


def wait_for(pred: Callable[[], Any], timeout: float = 8.0, interval: float = 0.03) -> Any:
    deadline = time.time() + timeout
    while time.time() < deadline:
        value = pred()
        if value:
            return value
        time.sleep(interval)
    raise AssertionError("condition not met in time")


# ----------------------------------------------------------------------------- local actions
def test_info_and_shell(tmp_path: Path) -> None:
    info = actions.info(("task",))
    assert info["kind"] == "computer" and "task" in info["actions"] and info["runtime"]
    r = actions.run("shell", {"command": "echo hi; echo err 1>&2; exit 3", "cwd": str(tmp_path)})
    assert r["stdout"].strip() == "hi" and r["stderr"].strip() == "err" and r["exit_code"] == 3
    slow = actions.run("shell", {"command": "sleep 5", "timeout": 1})
    assert slow["exit_code"] == 124 and slow["timed_out"] is True
    with pytest.raises(actions.ActionError):
        actions.run("shell", {"command": ""})


def test_files_get_put(tmp_path: Path) -> None:
    (tmp_path / "a.txt").write_text("hello")
    (tmp_path / "sub").mkdir()
    listing = actions.run("files", {"path": str(tmp_path)})
    names = {e["name"]: e for e in listing["entries"]}
    assert names["a.txt"]["size"] == 5 and names["sub"]["type"] == "dir"
    got = actions.run("file.get", {"path": str(tmp_path / "a.txt")})
    assert base64.b64decode(got["data"]) == b"hello" and got["mime"].startswith("text/")
    put = actions.run(
        "file.put",
        {"path": str(tmp_path / "b.txt"), "data": base64.b64encode(b"copy").decode()},
    )
    assert put["bytes"] == 4 and (tmp_path / "b.txt").read_bytes() == b"copy"
    with pytest.raises(actions.ActionError) as exc:
        actions.run("file.put", {"path": str(tmp_path / "b.txt"), "data": "eA=="})
    assert exc.value.code == "exists"
    actions.run("file.put", {"path": str(tmp_path / "b.txt"), "data": "eA==", "force": True})
    assert (tmp_path / "b.txt").read_bytes() == b"x"
    with pytest.raises(actions.ActionError) as exc:
        actions.run("file.get", {"path": str(tmp_path / "missing")})
    assert exc.value.code == "not_found"
    with pytest.raises(actions.ActionError):
        actions.run("dance", {})


def test_cloud_urls() -> None:
    assert hub_url("https://cloud.nanomuse.cn/") == "wss://cloud.nanomuse.cn/v1/hub"
    assert hub_url("http://127.0.0.1:8080") == "ws://127.0.0.1:8080/v1/hub"
    assert model_url("https://cloud.nanomuse.cn") == "https://cloud.nanomuse.cn/v1"
    assert CloudClient.recommended_model([{"id": "x"}, {"id": "qwen3.8-27b"}]) == "qwen3.8-27b"
    assert CloudClient.recommended_model([{"id": "only"}]) == "only"


# ----------------------------------------------------------------------------- a fake relay
class FakeRelay:
    """A relay in its own thread: one runtime connects; a fake phone answers its calls.

    ``phone_handler(frame) -> list[frame]`` decides what the phone sends back for a call
    addressed to it; frames the relay itself wants to send go through ``send``."""

    def __init__(self, key: str = "test-key"):
        self.key = key
        self.loop = asyncio.new_event_loop()
        self.port = 0
        self.ready = threading.Event()
        self.frames: queue.Queue[dict[str, Any]] = queue.Queue()  # from the runtime, in order
        self.hello: dict[str, Any] | None = None
        self.ws: Any = None
        self.phone_handler: Callable[[dict[str, Any]], list[dict[str, Any]]] | None = None
        self.connections = 0
        self._server: Any = None
        self._thread = threading.Thread(target=self._run, daemon=True)

    # -- lifecycle
    def start(self) -> FakeRelay:
        self._thread.start()
        assert self.ready.wait(5), "relay did not start"
        return self

    def stop(self) -> None:
        async def _close() -> None:
            if self._server is not None:
                self._server.close()
                await self._server.wait_closed()

        asyncio.run_coroutine_threadsafe(_close(), self.loop).result(5)
        self.loop.call_soon_threadsafe(self.loop.stop)
        self._thread.join(5)

    def _run(self) -> None:
        asyncio.set_event_loop(self.loop)
        self.loop.run_until_complete(self._serve())
        self.loop.run_forever()

    async def _serve(self) -> None:
        self._server = await serve(self._handler, "127.0.0.1", 0)
        self.port = self._server.sockets[0].getsockname()[1]
        self.ready.set()

    @property
    def base_url(self) -> str:
        return f"http://127.0.0.1:{self.port}"

    # -- the runtime's socket
    async def _handler(self, ws: Any) -> None:
        auth = ws.request.headers.get("Authorization", "")
        if auth != f"Bearer {self.key}":
            await ws.close(4001, "bad key")
            return
        raw = await ws.recv()
        hello = json.loads(raw)
        if hello.get("type") != "hello":
            await ws.close(4000, "hello expected")
            return
        self.hello = hello
        self.ws = ws
        self.connections += 1
        me = {**hello["device"], "online": True}
        await ws.send(
            json.dumps(
                {
                    "type": "welcome",
                    "device_id": me["id"],
                    "devices": [me, PHONE],
                    "server": {"name": "fake relay", "version": "0"},
                }
            )
        )
        async for raw in ws:
            frame = json.loads(raw)
            if frame.get("type") == "ping":
                await ws.send('{"type":"pong"}')
                continue
            self.frames.put(frame)
            if frame.get("type") == "call" and frame.get("to") == PHONE["id"]:
                for reply in (self.phone_handler or _phone_default)(frame):
                    await ws.send(json.dumps(reply))
            elif frame.get("type") == "devices":
                await ws.send(json.dumps({"type": "devices", "devices": [me, PHONE]}))

    # -- talking to the runtime
    def send(self, frame: dict[str, Any]) -> None:
        ws = wait_for(lambda: self.ws)
        asyncio.run_coroutine_threadsafe(ws.send(json.dumps(frame)), self.loop).result(5)

    def next_frame(self, type_: str | None = None, timeout: float = 8.0) -> dict[str, Any]:
        deadline = time.time() + timeout
        while True:
            left = deadline - time.time()
            if left <= 0:
                raise AssertionError(f"no {type_ or 'frame'} from the runtime in time")
            frame = self.frames.get(timeout=left)
            if type_ is None or frame.get("type") == type_:
                return frame

    def call_runtime(self, action: str, args: dict[str, Any], call_id: str = "c1") -> None:
        self.send({"type": "call", "id": call_id, "from": PHONE, "action": action, "args": args})


def _phone_default(frame: dict[str, Any]) -> list[dict[str, Any]]:
    """The fake phone: echoes shell commands, answers tasks after one tool step."""
    action, cid, args = frame.get("action"), frame["id"], frame.get("args") or {}
    if action == "shell":
        return [
            {
                "type": "result",
                "id": cid,
                "ok": True,
                "body": {
                    "stdout": f"phone ran: {args.get('command')}\n",
                    "stderr": "",
                    "exit_code": 0,
                },
            }
        ]
    if action == "task":
        return [
            {
                "type": "event",
                "id": cid,
                "body": {"stage": "tool", "name": "calendar", "summary": "reading tomorrow"},
            },
            {
                "type": "event",
                "id": cid,
                "body": {
                    "stage": "tool_result",
                    "name": "calendar",
                    "ok": True,
                    "summary": "1 event",
                },
            },
            {
                "type": "result",
                "id": cid,
                "ok": True,
                "body": {"text": f"Pixel says: {args.get('text')}", "device": "Pixel"},
            },
        ]
    if action == "approve":
        return [{"type": "result", "id": cid, "ok": True, "body": {"ok": True}}]
    if action == "stop":
        return [{"type": "result", "id": cid, "ok": True, "body": {"stopped": True}}]
    return [
        {"type": "result", "id": cid, "ok": False, "error": "unknown_action", "message": action}
    ]


@pytest.fixture()
def relay() -> Iterator[FakeRelay]:
    r = FakeRelay().start()
    yield r
    r.stop()


# ----------------------------------------------------------------------------- the client
def test_client_connects_calls_and_answers(relay: FakeRelay) -> None:
    async def scenario() -> None:
        seen: list[str] = []

        async def on_call(call: Any) -> None:
            seen.append(call.action)
            await call.event({"stage": "tool", "name": "shell"})
            await call.result({"stdout": "ok\n", "exit_code": 0})

        client = HubClient(
            hub_url(relay.base_url),
            "test-key",
            "pc-1",
            "Desk",
            actions=["info", "shell"],
            on_call=on_call,
        )
        client.start()
        await asyncio.wait_for(client.connected.wait(), 5)
        assert client.state == "connected"
        assert [d["name"] for d in client.others()] == ["Pixel"]
        assert client.find("phone")["id"] == "phone-1"
        assert client.find("pixel")["id"] == "phone-1"
        assert client.find("Desk") is None  # never itself
        # a call out, to the fake phone
        body = await client.call("phone-1", "shell", {"command": "ls"})
        assert body["stdout"].startswith("phone ran: ls")
        # a call in, from the fake phone
        await asyncio.to_thread(relay.call_runtime, "shell", {"command": "echo hi"})
        ev = await asyncio.to_thread(relay.next_frame, "event")
        assert ev["id"] == "c1" and ev["body"]["stage"] == "tool"
        res = await asyncio.to_thread(relay.next_frame, "result")
        assert res["ok"] is True and res["body"]["stdout"] == "ok\n" and seen == ["shell"]
        # a call the phone refuses
        with pytest.raises(HubError) as exc:
            await client.call("phone-1", "dance", {})
        assert exc.value.code == "unknown_action"
        await client.stop()
        assert client.state == "stopped"

    asyncio.run(scenario())


def test_client_refuses_to_hammer_on_bad_key(relay: FakeRelay) -> None:
    async def scenario() -> None:
        client = HubClient(hub_url(relay.base_url), "wrong", "pc-1", "Desk", actions=["info"])
        client.start()
        await asyncio.sleep(0)
        for _ in range(100):
            if client.state == "refused":
                break
            await asyncio.sleep(0.05)
        assert client.state == "refused"
        await client.stop()

    asyncio.run(scenario())


# ----------------------------------------------------------------------------- the service
@pytest.fixture()
def hub_server(
    settings: Settings, relay: FakeRelay, monkeypatch: pytest.MonkeyPatch
) -> Iterator[tuple[TestClient, MuseService, MockLLM, FakeRelay]]:
    settings.server.token = "secret-token"
    settings.cloud.base_url = relay.base_url
    settings.hub.name = "Desk"
    llm = MockLLM([])

    async def fake_request_code(self: CloudClient, identifier: str) -> dict[str, Any]:
        assert identifier
        return {"ok": True, "channel": "email"}

    async def fake_verify(
        self: CloudClient, identifier: str, code: str, device: str = ""
    ) -> dict[str, Any]:
        if code != "123456":
            from nanomuse.cloud import CloudError

            raise CloudError(400, "bad_code", "wrong code")
        self.api_key = "test-key"
        return {"api_key": "test-key", "account": {"hint": "s***@example.com", "channel": "email"}}

    async def fake_models(self: CloudClient) -> list[dict[str, Any]]:
        return [{"id": "qwen3.8-27b"}, {"id": "other"}]

    monkeypatch.setattr(CloudClient, "request_code", fake_request_code)
    monkeypatch.setattr(CloudClient, "verify", fake_verify)
    monkeypatch.setattr(CloudClient, "models", fake_models)
    service = MuseService(settings, llm=llm)
    app = create_app(settings, service)
    with TestClient(app) as client:
        client.headers["Authorization"] = "Bearer secret-token"
        yield client, service, llm, relay


def sign_in(client: TestClient) -> dict[str, Any]:
    assert (
        client.post("/api/cloud/code", json={"identifier": "someone@example.com"}).status_code
        == 200
    )
    r = client.post(
        "/api/cloud/verify", json={"identifier": "someone@example.com", "code": "123456"}
    )
    assert r.status_code == 200, r.text
    return r.json()


def test_sign_in_joins_hub_and_lists_devices(hub_server) -> None:
    client, service, _llm, relay = hub_server
    before = client.get("/api/hub").json()
    assert before["state"] == "signed_out" and before["account"]["signed_in"] is False
    assert "devices" not in service.app.tools
    bad = client.post("/api/cloud/verify", json={"identifier": "x@example.com", "code": "000000"})
    assert bad.status_code == 400
    account = sign_in(client)
    assert account["signed_in"] is True and account["hint"] == "s***@example.com"
    hub = wait_for(lambda: (h := client.get("/api/hub").json())["state"] == "connected" and h)
    assert relay.hello["device"]["name"] == "Desk"
    assert relay.hello["device"]["kind"] == "computer"
    assert (
        "task" in relay.hello["device"]["actions"] and "shell" in relay.hello["device"]["actions"]
    )
    names = {d["name"]: d for d in hub["devices"]}
    assert names["Pixel"]["online"] is True and names["Desk"]["this"] is True
    assert "devices" in service.app.tools and "delegate" in service.app.tools
    # the state view carries the hub too, for the GUI's first paint
    assert client.get("/api/state").json()["hub"]["state"] == "connected"
    # rename travels to the relay
    client.put("/api/hub", json={"name": "Study"})
    assert relay.next_frame("rename")["name"] == "Study"
    # the relay as the model provider: the key stays a vault reference
    llm = client.post("/api/cloud/use-as-model", json={}).json()
    assert llm["model"] == "qwen3.8-27b" and llm["base_url"] == model_url(relay.base_url)
    assert service.settings.llm.api_key == "{{vault:NANOMUSE_CLOUD_KEY}}"
    assert service.app.vault.get("NANOMUSE_CLOUD_KEY") == "test-key"
    assert client.get("/api/cloud").json()["is_model"] is True
    # leaving takes the tools away; signing out clears the account
    client.post("/api/hub/leave")
    wait_for(lambda: "devices" not in service.app.tools)
    assert client.get("/api/hub").json()["state"] == "off"
    client.post("/api/cloud/sign-out")
    assert client.get("/api/cloud").json()["signed_in"] is False


def test_task_from_a_device_runs_in_a_visible_side_chat(hub_server) -> None:
    client, service, llm, relay = hub_server
    sign_in(client)
    wait_for(lambda: client.get("/api/hub").json()["state"] == "connected")
    llm.script.append(LLMResponse(tool_calls=[tc("shell", command="echo from-pixel")]))
    llm.script.append(LLMResponse(content="Done: from-pixel"))
    service.settings.sentinel.mode = "auto"
    relay.call_runtime("task", {"text": "run echo from-pixel", "conversation": "conv-1"}, "t1")
    # the approval-free run: a tool event, then the result
    ev = relay.next_frame("event")
    assert ev["id"] == "t1" and ev["body"]["stage"] == "tool" and ev["body"]["name"] == "shell"
    res = relay.next_frame("result")
    assert res["id"] == "t1" and res["ok"] is True
    assert res["body"]["text"] == "Done: from-pixel" and res["body"]["device"] == "Desk"
    # and it happened in a side chat named after the phone, visible here
    threads = {t["title"]: t for t in client.get("/api/threads").json()}
    side = threads["From Pixel"]
    assert (
        side["remote_from"]["name"] == "Pixel" and side["remote_from"]["conversation"] == "conv-1"
    )
    events = client.get(f"/api/threads/{side['id']}/events").json()["events"]
    user = [e for e in events if e["type"] == "user"][0]
    assert user["text"] == "run echo from-pixel" and user["via"] == "Pixel"
    assert [e["text"] for e in events if e["type"] == "assistant"] == ["Done: from-pixel"]
    # a second task from the same conversation reuses the chat
    llm.script.append(LLMResponse(content="Again"))
    relay.call_runtime("task", {"text": "again", "conversation": "conv-1"}, "t2")
    assert relay.next_frame("result")["body"]["text"] == "Again"
    assert len([t for t in client.get("/api/threads").json() if t["title"] == "From Pixel"]) == 1


def test_task_approval_is_relayed_and_answered_by_the_device(hub_server) -> None:
    client, service, llm, relay = hub_server
    sign_in(client)
    wait_for(lambda: client.get("/api/hub").json()["state"] == "connected")
    llm.script.append(LLMResponse(tool_calls=[tc("shell", command="echo careful")]))
    llm.script.append(LLMResponse(content="Ran it"))
    relay.call_runtime("task", {"text": "run something", "conversation": "conv-2"}, "t3")
    approval = relay.next_frame("event")
    while approval["body"].get("stage") != "approval":
        approval = relay.next_frame("event")
    body = approval["body"]
    assert body["device"] == "Desk" and "echo careful" in body["preview"] and body["approval_id"]
    # the card is pending here too; the phone answers it over the hub
    pending = client.get("/api/state").json()["pending_approvals"]
    assert [p["id"] for p in pending] == [body["approval_id"]]
    relay.call_runtime("approve", {"approval_id": body["approval_id"], "allow": True}, "a1")
    results = [relay.next_frame("result"), relay.next_frame("result")]
    by_id = {r["id"]: r for r in results}
    assert by_id["a1"]["body"]["ok"] is True
    assert by_id["t3"]["ok"] is True and by_id["t3"]["body"]["text"] == "Ran it"


def test_remote_control_off_refuses_everything_but_info(hub_server) -> None:
    client, _service, _llm, relay = hub_server
    sign_in(client)
    wait_for(lambda: client.get("/api/hub").json()["state"] == "connected")
    client.put("/api/hub", json={"remote_control": False})
    relay.call_runtime("shell", {"command": "echo hi"}, "s1")
    res = relay.next_frame("result")
    assert res["ok"] is False and res["error"] == "not_allowed"
    relay.call_runtime("info", {}, "i1")
    res = relay.next_frame("result")
    assert res["ok"] is True and res["body"]["kind"] == "computer"
    client.put("/api/hub", json={"remote_control": True})
    relay.call_runtime("shell", {"command": "echo hi"}, "s2")
    res = relay.next_frame("result")
    assert res["ok"] is True and res["body"]["stdout"].strip() == "hi"


def test_ask_a_device_runs_the_text_there_and_shows_its_steps(hub_server) -> None:
    client, service, _llm, relay = hub_server
    sign_in(client)
    wait_for(lambda: client.get("/api/hub").json()["state"] == "connected")
    r = client.post(
        "/api/hub/ask", json={"device": "Pixel", "text": "what is tomorrow's first meeting?"}
    )
    assert r.status_code == 200, r.text
    thread = r.json()["thread"]
    assert thread["device"] == "phone-1" and thread["device_name"] == "Pixel"
    call = relay.next_frame("call")
    assert call["to"] == "phone-1" and call["action"] == "task"
    assert call["args"]["text"].startswith("what is") and call["args"]["from"] == "Desk"
    wait_for(lambda: not service.threads[thread["id"]].busy)
    events = client.get(f"/api/threads/{thread['id']}/events").json()["events"]
    types = [e["type"] for e in events]
    assert types == ["user", "tool", "assistant"]
    assert (
        events[1]["tool"] == "calendar"
        and events[1]["status"] == "ok"
        and events[1]["device"] == "Pixel"
    )
    assert events[2]["text"].startswith("Pixel says:") and events[2]["device"] == "Pixel"
    # the same device gets the same chat
    again = client.post("/api/hub/ask", json={"device": "phone-1"}).json()
    assert again["thread"]["id"] == thread["id"]
    assert client.post("/api/hub/ask", json={"device": "toaster"}).status_code == 404


def test_device_chat_relays_its_approval_card_back(hub_server) -> None:
    client, service, _llm, relay = hub_server
    sign_in(client)
    wait_for(lambda: client.get("/api/hub").json()["state"] == "connected")
    approved: list[dict[str, Any]] = []

    def phone(frame: dict[str, Any]) -> list[dict[str, Any]]:
        cid, action = frame["id"], frame.get("action")
        if action == "task":
            return [
                {
                    "type": "event",
                    "id": cid,
                    "body": {
                        "stage": "approval",
                        "approval_id": "ap-phone-1",
                        "preview": "delete the draft",
                        "risk": "sensitive",
                        "reason": "removes a file",
                        "device": "Pixel",
                    },
                }
            ]
        if action == "approve":
            approved.append(frame["args"])
            # the phone finishes its task once it has the answer
            return [
                {"type": "result", "id": cid, "ok": True, "body": {"ok": True}},
                {
                    "type": "result",
                    "id": approved_task[0],
                    "ok": True,
                    "body": {"text": "Deleted."},
                },
            ]
        return _phone_default(frame)

    approved_task: list[str] = []
    relay.phone_handler = phone
    r = client.post("/api/hub/ask", json={"device": "Pixel", "text": "delete the draft"})
    thread = r.json()["thread"]
    approved_task.append(relay.next_frame("call")["id"])
    card = wait_for(
        lambda: [
            e
            for e in client.get(f"/api/threads/{thread['id']}/events").json()["events"]
            if e["type"] == "approval"
        ]
    )[0]
    assert card["status"] == "pending" and card["remote"]["device"] == "phone-1"
    assert card["summary"] == "on Pixel: delete the draft" and card["grant_options"] == ["once"]
    assert card["id"] in service.hub.remote_approvals
    r = client.post(f"/api/approvals/{card['id']}", json={"approved": True, "scope": "once"})
    assert r.status_code == 200, r.text
    assert approved == [{"approval_id": "ap-phone-1", "allow": True}]
    wait_for(lambda: not service.threads[thread["id"]].busy)
    events = client.get(f"/api/threads/{thread['id']}/events").json()["events"]
    card_after = [e for e in events if e["type"] == "approval"][0]
    assert card_after["status"] == "approved"
    assert [e["text"] for e in events if e["type"] == "assistant"] == ["Deleted."]


def test_delegate_tool_asks_the_device_and_passes_the_answer_on(hub_server) -> None:
    client, service, llm, relay = hub_server
    sign_in(client)
    wait_for(lambda: client.get("/api/hub").json()["state"] == "connected")
    service.settings.sentinel.mode = "auto"
    llm.script.append(LLMResponse(tool_calls=[tc("devices")]))
    llm.script.append(
        LLMResponse(tool_calls=[tc("delegate", device="phone", task="read tomorrow's calendar")])
    )
    llm.script.append(LLMResponse(tool_calls=[tc("device_shell", device="Pixel", command="uname")]))
    llm.script.append(LLMResponse(content="Your phone says it is fine."))
    client.post("/api/threads/main/send", json={"text": "ask my phone about tomorrow"})
    wait_for(lambda: not service.threads["main"].busy and service.threads["main"].inbox.empty())
    events = client.get("/api/threads/main/events").json()["events"]
    tools = [e for e in events if e["type"] == "tool"]
    assert [t["tool"] for t in tools] == ["devices", "delegate", "device_shell"]
    assert all(t["status"] == "ok" for t in tools), [t.get("output") for t in tools]
    assert "Pixel" in tools[0]["output"]
    assert "Pixel says: read tomorrow's calendar" in tools[1]["output"]
    assert "phone ran: uname" in tools[2]["output"]
    calls = []
    while True:
        try:
            calls.append(relay.frames.get(timeout=0.2))
        except queue.Empty:
            break
    actions_sent = [c["action"] for c in calls if c.get("type") == "call"]
    assert actions_sent == ["task", "shell"]
    task_call = [c for c in calls if c.get("action") == "task"][0]
    assert task_call["args"]["from"] == "Desk"
