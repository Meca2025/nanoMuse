"""Conversation sync on the runtime (contract C7): the engine against an in-memory relay —
push after a turn, pull into threads and the agent's history, the main chat as one
conversation, tombstones, the switch — and the ``@<device>`` mention in the composer."""

from __future__ import annotations

import time
import uuid
from collections.abc import Callable, Iterator
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi.testclient import TestClient

from nanomuse.cloud import CloudClient, CloudError
from nanomuse.config import Settings
from nanomuse.llm import MockLLM
from nanomuse.schema import LLMResponse
from nanomuse.server import create_app
from nanomuse.server.events import MAIN_THREAD
from nanomuse.server.service import MuseService
from nanomuse.sync import engine as engine_mod
from nanomuse.sync.mention import parse_mention, system_note

DEVICES = [
    {"id": "pc-self", "name": "Desk", "kind": "computer", "online": True},
    {"id": "phone-1", "name": "Pixel 8", "kind": "phone", "online": True},
    {"id": "mac-1", "name": "Mac mini", "kind": "computer", "online": False},
    {"id": "mac-2", "name": "MacBook", "kind": "computer", "online": True},
]


def wait_for(pred: Callable[[], Any], timeout: float = 8.0, interval: float = 0.03) -> Any:
    deadline = time.time() + timeout
    while time.time() < deadline:
        value = pred()
        if value:
            return value
        time.sleep(interval)
    raise AssertionError("condition not met in time")


# ----------------------------------------------------------------------------- the mention
def test_mention_takes_a_device_name_off_the_front() -> None:
    m = parse_mention("@Pixel 8 open the calendar", DEVICES, "pc-self")
    assert m is not None and m.device_id == "phone-1" and m.text == "open the calendar"
    # case-insensitive, a comma after the name, the longest full name wins
    m = parse_mention("  @mac mini, list ~/Downloads", DEVICES, "pc-self")
    assert m is not None and m.device_id == "mac-1" and m.text == "list ~/Downloads"
    # the first word as a prefix of exactly one name
    m = parse_mention("@pix what's on screen", DEVICES, "pc-self")
    assert m is not None and m.device_id == "phone-1" and m.text == "what's on screen"
    # "Mac" starts two names; the one online is meant
    m = parse_mention("@mac hello", DEVICES, "pc-self")
    assert m is not None and m.device_id == "mac-2"
    # this device is never a target; an unknown name is an ordinary message
    assert parse_mention("@Desk hi", DEVICES, "pc-self") is None
    assert parse_mention("@nobody hi", DEVICES, "pc-self") is None
    assert parse_mention("hello @Pixel 8", DEVICES, "pc-self") is None
    assert parse_mention("@", DEVICES, "pc-self") is None
    assert "Pixel 8 (id phone-1)" in system_note(
        "Pixel 8", "phone-1"
    ) and "`delegate`" in system_note("x", "y")


# ----------------------------------------------------------------------------- a relay in memory
class FakeSyncRelay:
    """The relay's /v1/sync/* as the engine sees them, with the contract's rules."""

    def __init__(self) -> None:
        self.cloud = SimpleNamespace(api_key="")
        self.enabled = True
        self.seq = 0
        self.convs: dict[str, dict[str, Any]] = {}
        self.msgs: dict[str, dict[str, Any]] = {}
        self.pushes: list[dict[str, Any]] = []
        self.calls: list[str] = []
        self.fail: CloudError | None = None
        self.names = {"phone-1": "Pixel 8", "pc-self": "Desk"}

    def _next(self) -> int:
        self.seq += 1
        return self.seq

    def _check(self, what: str) -> None:
        self.calls.append(what)
        if self.fail is not None:
            exc, self.fail = self.fail, None
            raise exc
        if not self.enabled and what in ("push", "changes", "delete_conversation"):
            raise CloudError(409, "sync_off", "off")

    # -- what a test seeds
    def add_conversation(
        self, cid: str, kind: str = "side", title: str = "A chat", device: str = "phone-1"
    ) -> None:
        self.convs[cid] = {
            "cid": cid,
            "kind": kind,
            "title": title,
            "device": device,
            "device_name": self.names.get(device, ""),
            "created_at": 1738000000,
            "updated_at": 1738000000,
            "deleted": False,
            "seq": self._next(),
        }

    def add_message(
        self, cid: str, role: str, text: str, device: str = "phone-1", created_at: int = 1738000050
    ) -> str:
        mid = str(uuid.uuid4())
        self.msgs[mid] = {
            "mid": mid,
            "cid": cid,
            "seq": self._next(),
            "device": device,
            "device_name": self.names.get(device, ""),
            "role": role,
            "text": text,
            "truncated": False,
            "attachments": [],
            "created_at": created_at,
            "deleted": False,
        }
        return mid

    def tombstone_conversation(self, cid: str) -> None:
        self.convs[cid].update(deleted=True, title="", seq=self._next())
        for mid in [m for m, v in self.msgs.items() if v["cid"] == cid]:
            del self.msgs[mid]

    def tombstone_message(self, mid: str) -> None:
        self.msgs[mid].update(deleted=True, text="", seq=self._next())

    # -- the API
    async def state(self) -> dict[str, Any]:
        self._check("state")
        return {
            "enabled": self.enabled,
            "cursor": self.seq,
            "counts": {
                "conversations": sum(1 for c in self.convs.values() if not c["deleted"]),
                "messages": len(self.msgs),
            },
            "limits": {"messages": 20000, "text_bytes": 16384},
        }

    async def set_enabled(self, enabled: bool) -> dict[str, Any]:
        self._check("set_enabled")
        self.enabled = enabled
        if not enabled:
            self.convs.clear()
            self.msgs.clear()
        return await self.state()

    async def changes(self, since: int = 0, limit: int = 500) -> dict[str, Any]:
        self._check("changes")
        rows = [("c", c) for c in self.convs.values() if c["seq"] > since] + [
            ("m", m) for m in self.msgs.values() if m["seq"] > since
        ]
        rows.sort(key=lambda x: x[1]["seq"])
        more = len(rows) > limit
        rows = rows[:limit]
        return {
            "cursor": rows[-1][1]["seq"] if more else self.seq,
            "more": more,
            "conversations": [dict(r) for k, r in rows if k == "c"],
            "messages": [dict(r) for k, r in rows if k == "m"],
        }

    async def push(
        self, device: str, conversations: list[dict[str, Any]], messages: list[dict[str, Any]]
    ) -> dict[str, Any]:
        self._check("push")
        self.pushes.append({"device": device, "conversations": conversations, "messages": messages})
        accepted, rejected, redirected = 0, [], {}
        for c in conversations:
            cid = c["cid"]
            if cid not in self.convs:
                if c.get("kind") == "main":
                    main = next(
                        (
                            x
                            for x in self.convs.values()
                            if x["kind"] == "main" and not x["deleted"]
                        ),
                        None,
                    )
                    if main is not None:
                        redirected[cid] = main["cid"]
                        rejected.append(
                            {"cid": cid, "reason": "main_exists", "cid_main": main["cid"]}
                        )
                        continue
                self.convs[cid] = {
                    "cid": cid,
                    "kind": c.get("kind", "side"),
                    "title": c.get("title", ""),
                    "device": device,
                    "device_name": self.names.get(device, ""),
                    "created_at": c.get("created_at", 0),
                    "updated_at": c.get("updated_at", 0),
                    "deleted": bool(c.get("deleted")),
                    "seq": self._next(),
                }
                accepted += 1
            elif c.get("deleted"):
                self.tombstone_conversation(cid)
                accepted += 1
            elif c.get("title") != self.convs[cid]["title"]:
                self.convs[cid].update(title=c.get("title", ""), seq=self._next())
                accepted += 1
        for m in messages:
            if m["cid"] in redirected:
                rejected.append(
                    {"mid": m["mid"], "reason": "main_exists", "cid_main": redirected[m["cid"]]}
                )
                continue
            if m["mid"] in self.msgs:
                continue
            if m["cid"] not in self.convs:
                rejected.append({"mid": m["mid"], "reason": "unknown_cid"})
                continue
            self.msgs[m["mid"]] = {
                "mid": m["mid"],
                "cid": m["cid"],
                "seq": self._next(),
                "device": device,
                "device_name": self.names.get(device, ""),
                "role": m["role"],
                "text": m.get("text", ""),
                "truncated": False,
                "attachments": m.get("attachments") or [],
                "created_at": m.get("created_at", 0),
                "deleted": False,
            }
            accepted += 1
        return {"cursor": self.seq, "accepted": accepted, "rejected": rejected}

    async def delete_conversation(self, cid: str) -> dict[str, Any]:
        self._check("delete_conversation")
        if cid not in self.convs:
            raise CloudError(404, "no_conversation", "none")
        self.tombstone_conversation(cid)
        return {"cursor": self.seq, "deleted": True}

    async def wipe(self) -> dict[str, Any]:
        self._check("wipe")
        self.convs.clear()
        self.msgs.clear()
        return await self.state()


@pytest.fixture()
def synced(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> Iterator[tuple[TestClient, MuseService, MockLLM, FakeSyncRelay]]:
    """A signed-in runtime (a key in the vault, the hub switched off so no socket opens) whose
    sync engine talks to the fake relay; pushes go out a few milliseconds after a turn."""
    settings.server.token = "secret-token"
    settings.hub.enabled = False
    settings.hub.device_id = "pc-self"
    settings.hub.name = "Desk"
    settings.cloud.base_url = "http://127.0.0.1:9"  # never reached: every relay call is faked

    async def fake_models(self: CloudClient) -> list[dict[str, Any]]:
        return []

    monkeypatch.setattr(CloudClient, "models", fake_models)
    monkeypatch.setattr(engine_mod, "PUSH_DELAY_S", 0.05)
    llm = MockLLM([])
    service = MuseService(settings, llm=llm)
    service.app.vault.set("NANOMUSE_CLOUD_KEY", "test-key")
    relay = FakeSyncRelay()
    service.sync.client = relay  # type: ignore[assignment]
    app = create_app(settings, service)
    with TestClient(app) as client:
        client.headers["Authorization"] = "Bearer secret-token"
        yield client, service, llm, relay


def _events(client: TestClient, thread: str) -> list[dict[str, Any]]:
    return client.get(f"/api/threads/{thread}/events").json()["events"]


# ----------------------------------------------------------------------------- push
def test_a_finished_turn_is_pushed_as_the_main_conversation(synced) -> None:
    client, service, llm, relay = synced
    llm.script.append(LLMResponse(content="Hello from the desk", finish_reason="stop"))
    r = client.post(f"/api/threads/{MAIN_THREAD}/send", json={"text": "hi there"})
    assert r.status_code == 200
    wait_for(lambda: len(relay.msgs) == 2)
    main = next(c for c in relay.convs.values() if c["kind"] == "main")
    assert main["title"] == "Main chat" and main["device"] == "pc-self"
    texts = sorted((m["role"], m["text"]) for m in relay.msgs.values())
    assert texts == [("assistant", "Hello from the desk"), ("user", "hi there")]
    # the events carry their mid and are marked, so the next push sends nothing
    evs = [e for e in _events(client, MAIN_THREAD) if e["type"] in ("user", "assistant")]
    assert all(e.get("synced") and e.get("mid") in relay.msgs for e in evs)
    assert service.sync.cid_of(MAIN_THREAD) == main["cid"]
    before = len(relay.pushes)
    client.portal.call(service.sync.push)  # type: ignore[union-attr]
    assert len(relay.pushes) == before
    # sync.json remembers the cid; the cursor catches up on the pull that follows a push
    state = service.sync.state
    assert state["cids"][MAIN_THREAD] == main["cid"]
    wait_for(lambda: state["cursor"] == relay.seq)
    # a rename and a new side chat go up on their own; deleting one tombstones it on the relay
    side = client.post("/api/threads", json={"title": "Trip"}).json()
    wait_for(lambda: any(c["title"] == "Trip" for c in relay.convs.values()))
    client.patch(f"/api/threads/{side['id']}", json={"title": "Trip to Kyoto"})
    wait_for(lambda: any(c["title"] == "Trip to Kyoto" for c in relay.convs.values()))
    cid = service.sync.cid_of(side["id"])
    client.delete(f"/api/threads/{side['id']}")
    wait_for(lambda: relay.convs[cid]["deleted"])
    assert service.sync.cid_of(side["id"]) is None


def test_the_second_main_adopts_the_accounts_id(synced) -> None:
    client, service, llm, relay = synced
    # another device pushed the account's main chat already, with a message in it
    theirs = str(uuid.uuid4())
    relay.add_conversation(theirs, "main", "Main chat")
    relay.add_message(theirs, "user", "from the phone")
    # our main chat has a turn the relay has not seen; we push before pulling (the race)
    llm.script.append(LLMResponse(content="desk answer", finish_reason="stop"))
    client.post(f"/api/threads/{MAIN_THREAD}/send", json={"text": "desk question"})
    wait_for(lambda: any(m["text"] == "desk answer" for m in relay.msgs.values()))
    # refused with main_exists, re-posted under theirs: one main on the relay, everything in it
    assert sum(1 for c in relay.convs.values() if c["kind"] == "main") == 1
    assert service.sync.cid_of(MAIN_THREAD) == theirs
    assert {m["cid"] for m in relay.msgs.values()} == {theirs}
    assert len(relay.pushes) >= 2
    # and the phone's message is in our main chat after a pull
    client.post("/api/sync/pull")
    texts = [e["text"] for e in _events(client, MAIN_THREAD) if e["type"] == "user"]
    assert "from the phone" in texts and "desk question" in texts


# ----------------------------------------------------------------------------- pull
def test_pull_makes_threads_and_history_and_tombstones_remove(synced) -> None:
    client, service, llm, relay = synced
    cid = str(uuid.uuid4())
    relay.add_conversation(cid, "side", "Dinner plans", device="phone-1")
    m1 = relay.add_message(cid, "user", "book a table", created_at=1738000050)
    relay.add_message(cid, "assistant", "Booked for 7", created_at=1738000060)
    r = client.post("/api/sync/pull")
    assert r.status_code == 200 and r.json()["applied"] == 3
    threads = client.get("/api/threads").json()
    t = next(x for x in threads if x["title"] == "Dinner plans")
    assert t["origin_device"] == "phone-1" and t["origin_device_name"] == "Pixel 8"
    evs = _events(client, t["id"])
    assert [(e["type"], e["text"]) for e in evs] == [
        ("user", "book a table"),
        ("assistant", "Booked for 7"),
    ]
    assert all(e["synced"] and e["via_device_name"] == "Pixel 8" for e in evs)
    assert evs[1]["final"] is True
    # the agent reads the synced transcript as history on its next turn here
    thread = service.threads[t["id"]]
    assert [(m.role.value, m.content) for m in thread.agent.messages] == [
        ("user", "book a table"),
        ("assistant", "Booked for 7"),
    ]
    llm.script.append(LLMResponse(content="Changed to 8", finish_reason="stop"))
    client.post(f"/api/threads/{t['id']}/send", json={"text": "make it 8"})
    wait_for(lambda: any(m["text"] == "Changed to 8" for m in relay.msgs.values()))
    seen = [m.content for m in llm.calls[-1]["messages"] if m.role.value == "user"]
    assert "book a table" in seen and "make it 8" in seen
    # the new turn synced back into the same conversation
    assert {m["cid"] for m in relay.msgs.values()} == {cid}
    # an edit elsewhere: the old message tombstoned → gone here; the chat deleted → thread gone
    relay.tombstone_message(m1)
    client.post("/api/sync/pull")
    assert "book a table" not in [e["text"] for e in _events(client, t["id"])]
    relay.tombstone_conversation(cid)
    client.post("/api/sync/pull")
    assert t["id"] not in {x["id"] for x in client.get("/api/threads").json()}
    # the tombstone came from the relay: no DELETE went back
    assert "delete_conversation" not in relay.calls
    # a renamed chat elsewhere is renamed here
    cid2 = str(uuid.uuid4())
    relay.add_conversation(cid2, "side", "Old name")
    client.post("/api/sync/pull")
    relay.convs[cid2].update(title="New name", seq=relay._next())
    client.post("/api/sync/pull")
    assert "New name" in [x["title"] for x in client.get("/api/threads").json()]
    # a chat renamed after its messages (the usual auto-title): the conversation's seq is
    # above the messages', and the messages still land in it on a single pull
    cid3 = str(uuid.uuid4())
    relay.add_conversation(cid3, "side", "New chat")
    relay.add_message(cid3, "user", "late title", created_at=1738000070)
    relay.convs[cid3].update(title="Titled later", seq=relay._next())
    client.post("/api/sync/pull")
    t3 = next(x for x in client.get("/api/threads").json() if x["title"] == "Titled later")
    assert [e["text"] for e in _events(client, t3["id"])] == ["late title"]


def test_the_hub_frame_triggers_a_pull_and_our_own_echo_does_not(synced) -> None:
    client, service, llm, relay = synced
    # launch: a pull, the main chat's title pushed, the pull that follows a push
    wait_for(lambda: relay.calls.count("changes") >= 2)
    time.sleep(0.1)
    relay.calls.clear()
    cid = str(uuid.uuid4())
    relay.add_conversation(cid, "side", "From the phone")
    client.portal.call(
        service.sync.on_frame,
        {"type": "sync", "what": "conversations", "cursor": relay.seq, "from": "pc-self"},
    )  # type: ignore[union-attr]
    time.sleep(0.2)
    assert "changes" not in relay.calls
    client.portal.call(
        service.sync.on_frame,
        {"type": "sync", "what": "conversations", "cursor": relay.seq, "from": "phone-1"},
    )  # type: ignore[union-attr]
    wait_for(lambda: "From the phone" in [x["title"] for x in client.get("/api/threads").json()])


# ----------------------------------------------------------------------------- the switch, the failures
def test_the_switch_and_the_relays_refusals(synced) -> None:
    client, service, llm, relay = synced
    st = client.get("/api/sync/state").json()
    assert st["enabled"] is True and st["available"] is True and st["relay"]["enabled"] is True
    cid = str(uuid.uuid4())
    relay.add_conversation(cid, "side", "Elsewhere")
    relay.add_message(cid, "user", "x")
    client.post("/api/sync/pull")
    # off: the relay deletes, nothing more goes out
    st = client.put("/api/sync/state", json={"enabled": False}).json()
    assert (
        st["enabled"] is False and relay.enabled is False and relay.convs == {} and relay.msgs == {}
    )
    assert service.sync.active is False
    calls = len(relay.calls)
    client.post("/api/threads", json={"title": "Quiet"})
    time.sleep(0.2)
    assert len(relay.calls) == calls
    # on again: this device's conversations go up in full
    st = client.put("/api/sync/state", json={"enabled": True}).json()
    assert st["enabled"] is True
    wait_for(
        lambda: (
            any(c["title"] == "Quiet" for c in relay.convs.values())
            and any(c["title"] == "Elsewhere" for c in relay.convs.values())
        )
    )
    # "Delete synced conversations" empties the relay and keeps the switch
    st = client.post("/api/sync/delete").json()
    assert relay.convs == {} and st["enabled"] is True and relay.enabled is True
    # sync_off from the relay (turned off on another device) flips the switch here
    relay.enabled = False
    client.post("/api/sync/pull")
    assert client.get("/api/sync/state").json()["enabled"] is False
    relay.enabled = True
    client.put("/api/sync/state", json={"enabled": True})
    # a refused key pauses until the next sign-in
    relay.fail = CloudError(401, "bad_key", "no")
    client.post("/api/sync/pull")
    assert service.sync.active is False and client.get("/api/sync/state").json()["paused"] is True
    client.portal.call(service.sync.account_changed, "acct-1")  # type: ignore[union-attr]
    assert service.sync.active is True
    # a different account starts from zero: fresh ids, the main chat pushed anew
    old = service.sync.cid_of(MAIN_THREAD)
    pushes = len(relay.pushes)
    client.portal.call(service.sync.account_changed, "acct-2")  # type: ignore[union-attr]
    assert service.sync.state["account_id"] == "acct-2"
    wait_for(lambda: len(relay.pushes) > pushes)
    assert service.sync.cid_of(MAIN_THREAD) not in (None, old)


def test_signed_out_runtimes_do_not_sync(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    settings.server.token = "t"
    settings.hub.enabled = False
    settings.cloud.base_url = "http://127.0.0.1:9"
    monkeypatch.setattr(engine_mod, "PUSH_DELAY_S", 0.05)
    service = MuseService(settings, llm=MockLLM([]))
    relay = FakeSyncRelay()
    service.sync.client = relay  # type: ignore[assignment]
    with TestClient(create_app(settings, service)) as client:
        client.headers["Authorization"] = "Bearer t"
        st = client.get("/api/sync/state").json()
        assert st["available"] is False and st["relay"] is None
        client.post("/api/threads", json={"title": "Local only"})
        time.sleep(0.2)
        assert relay.calls == []
        assert client.post("/api/sync/pull").json()["applied"] == 0


# ----------------------------------------------------------------------------- @device in the composer
def test_a_mention_hands_the_turn_to_the_device(synced, monkeypatch: pytest.MonkeyPatch) -> None:
    client, service, llm, relay = synced
    monkeypatch.setattr(service.hub, "others", lambda: [d for d in DEVICES if d["id"] != "pc-self"])
    llm.script.append(LLMResponse(content="Asked the phone.", finish_reason="stop"))
    r = client.post(
        f"/api/threads/{MAIN_THREAD}/send", json={"text": "@Pixel 8 what is on the screen?"}
    )
    assert r.status_code == 200
    ev = r.json()["event"]
    assert (
        ev["text"] == "what is on the screen?"
        and ev["to_device"] == "phone-1"
        and ev["to_device_name"] == "Pixel 8"
    )
    wait_for(lambda: llm.calls)
    user = [m.content for m in llm.calls[0]["messages"] if m.role.value == "user"][-1]
    assert user.startswith("[" + system_note("Pixel 8", "phone-1")) and user.endswith(
        "what is on the screen?"
    )
    # no match: the text stays as typed, nothing is addressed
    r = client.post(f"/api/threads/{MAIN_THREAD}/send", json={"text": "@everyone hello"})
    assert r.json()["event"]["text"] == "@everyone hello" and "to_device" not in r.json()["event"]
    # the synced copy carries the text without the mention
    wait_for(lambda: any(m["text"] == "what is on the screen?" for m in relay.msgs.values()))


def test_sync_state_survives_a_restart(settings: Settings, tmp_path: Path) -> None:
    settings.hub.enabled = False
    service = MuseService(settings, llm=MockLLM([]))
    service.sync.state["cids"][MAIN_THREAD] = "abc"
    service.sync.state["cursor"] = 7
    service.sync._save()
    again = MuseService(settings, llm=MockLLM([]))
    assert again.sync.cid_of(MAIN_THREAD) == "abc" and again.sync.cursor == 7
    assert again.sync.thread_of("abc") is again.threads[MAIN_THREAD]
