"""Conversation sync (0.19, sync.py): the same chats on every device of an account."""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient
from test_accounts import auth, make
from test_cloud import sign_up
from test_hub import connect, hello
from test_hub import sign_up as ws_sign_up

from nanomuse_cloud.api import create_app
from nanomuse_cloud.config import Settings
from nanomuse_cloud.db import Database
from nanomuse_cloud.senders import LogSender
from nanomuse_cloud.service import Cloud
from nanomuse_cloud.sync import LIMITS, clean_attachments, cut_text, valid_id


def uid() -> str:
    return str(uuid.uuid4())


def conv(cid: str, kind: str = "side", title: str = "A chat", created_at: int = 1738000000, **more) -> dict:
    return {"cid": cid, "kind": kind, "title": title, "created_at": created_at, "updated_at": created_at, **more}


def msg(mid: str, cid: str, role: str = "user", text: str = "hello", created_at: int = 1738000050, **more) -> dict:
    return {"mid": mid, "cid": cid, "role": role, "text": text, "created_at": created_at, **more}


async def signed_in(client, sender, identifier="13800138000", device="pixel") -> str:
    return (await sign_up(client, sender, identifier, device))["api_key"]


def test_pure_helpers():
    assert valid_id(uid()) is not None
    assert valid_id("ABCDEF-123") == "abcdef-123"  # folded to lower case
    assert valid_id("x") is None and valid_id("has space") is None and valid_id(12) is None
    text, cut = cut_text("é" * 10000)  # two bytes each: over the limit
    assert cut and len(text.encode()) <= LIMITS["text_bytes"] and text.endswith("é")
    assert cut_text("short") == ("short", False)
    assert cut_text(None) == ("", False)
    assert clean_attachments([{"name": "a.pdf", "mime": "application/pdf", "size": "1234"}, "junk", {}]) == [
        {"name": "a.pdf", "mime": "application/pdf", "size": 1234}
    ]


async def test_state_is_on_by_default_and_round_trips_changes():
    app, client, sender, up, cloud, settings = make()
    key = await signed_in(client, sender)
    r = await client.get("/v1/sync/state", headers=auth(key))
    assert r.status_code == 200
    assert r.json() == {"enabled": True, "cursor": 0, "counts": {"conversations": 0, "messages": 0}, "limits": LIMITS}

    cid = uid()
    m1, m2 = uid(), uid()
    body = {
        "device": "phone-1",
        "conversations": [conv(cid, "main", "Main")],
        "messages": [
            msg(m1, cid, "user", "hi", attachments=[{"name": "a.pdf", "mime": "application/pdf", "size": 1234}]),
            msg(m2, cid, "assistant", "hello", created_at=1738000051),
        ],
    }
    r = await client.post("/v1/sync/changes", json=body, headers=auth(key))
    assert r.status_code == 200, r.text
    assert r.json() == {"cursor": 3, "accepted": 3, "rejected": []}

    r = await client.get("/v1/sync/changes?since=0", headers=auth(key))
    out = r.json()
    assert out["cursor"] == 3 and out["more"] is False
    assert [c["cid"] for c in out["conversations"]] == [cid]
    c0 = out["conversations"][0]
    assert c0["kind"] == "main" and c0["title"] == "Main" and c0["device"] == "phone-1" and c0["seq"] == 1 and c0["deleted"] is False
    assert [m["mid"] for m in out["messages"]] == [m1, m2]
    assert out["messages"][0]["attachments"] == [{"name": "a.pdf", "mime": "application/pdf", "size": 1234}]
    assert out["messages"][0]["truncated"] is False and out["messages"][1]["role"] == "assistant"
    # the cursor moves the window: nothing after 3, only the second message after 2
    assert (await client.get("/v1/sync/changes?since=3", headers=auth(key))).json()["messages"] == []
    assert [m["mid"] for m in (await client.get("/v1/sync/changes?since=2", headers=auth(key))).json()["messages"]] == [m2]
    # paging
    r = await client.get("/v1/sync/changes?since=0&limit=2", headers=auth(key))
    page = r.json()
    assert page["more"] is True and page["cursor"] == 2 and len(page["conversations"]) + len(page["messages"]) == 2
    r = await client.get(f"/v1/sync/changes?since={page['cursor']}&limit=2", headers=auth(key))
    assert r.json()["more"] is False and [m["mid"] for m in r.json()["messages"]] == [m2]

    st = (await client.get("/v1/sync/state", headers=auth(key))).json()
    assert st["cursor"] == 3 and st["counts"] == {"conversations": 1, "messages": 2}

    # another account sees nothing of it
    other = await signed_in(client, sender, "13900139000", "other")
    r = await client.get("/v1/sync/changes", headers=auth(other))
    assert r.json()["conversations"] == [] and r.json()["messages"] == [] and r.json()["cursor"] == 0


async def test_device_names_are_filled_from_the_hub_devices():
    app, client, sender, up, cloud, settings = make()
    key = await signed_in(client, sender)
    cloud.db.upsert_device(cloud.authenticate(key).account_id, "phone-1", "Pixel 8", "phone", "Android", "0.1", "[]")
    cid = uid()
    await client.post(
        "/v1/sync/changes", json={"device": "phone-1", "conversations": [conv(cid)], "messages": [msg(uid(), cid)]}, headers=auth(key)
    )
    out = (await client.get("/v1/sync/changes", headers=auth(key))).json()
    assert out["conversations"][0]["device_name"] == "Pixel 8" and out["messages"][0]["device_name"] == "Pixel 8"


async def test_a_renamed_conversation_rides_along_with_its_messages():
    """A rename moves the conversation's seq above its messages; a device reading from zero
    (or from a cursor between the two) still gets the conversation in the same page."""
    app, client, sender, up, cloud, settings = make()
    key = await signed_in(client, sender)
    cid, m1 = uid(), uid()
    await client.post("/v1/sync/changes", json={"device": "d1", "conversations": [conv(cid)], "messages": [msg(m1, cid)]}, headers=auth(key))
    await client.post(
        "/v1/sync/changes", json={"device": "d1", "conversations": [conv(cid, title="Renamed", updated_at=1738000500)]}, headers=auth(key)
    )
    # seq: conversation 1 → message 2 → conversation renamed 3. A page of one holds the message only...
    page = (await client.get("/v1/sync/changes?since=1&limit=1", headers=auth(key))).json()
    assert page["more"] is True and page["cursor"] == 2 and [m["mid"] for m in page["messages"]] == [m1]
    # ...and the conversation it belongs to, as it is now, so the message is never an orphan
    assert [(c["cid"], c["title"], c["seq"]) for c in page["conversations"]] == [(cid, "Renamed", 3)]
    # the next page brings the rename itself; applying it again changes nothing
    page = (await client.get("/v1/sync/changes?since=2&limit=1", headers=auth(key))).json()
    assert page["more"] is False and [(c["cid"], c["seq"]) for c in page["conversations"]] == [(cid, 3)] and page["messages"] == []
    # a page that already has the conversation does not repeat it
    full = (await client.get("/v1/sync/changes?since=0", headers=auth(key))).json()
    assert [c["cid"] for c in full["conversations"]] == [cid] and [m["mid"] for m in full["messages"]] == [m1]


async def test_known_mids_are_idempotent_and_tombstones_propagate():
    app, client, sender, up, cloud, settings = make()
    key = await signed_in(client, sender)
    cid, mid = uid(), uid()
    first = {"device": "d1", "conversations": [conv(cid)], "messages": [msg(mid, cid, text="first")]}
    r = await client.post("/v1/sync/changes", json=first, headers=auth(key))
    assert r.json()["accepted"] == 2 and r.json()["cursor"] == 2
    # the same again, with a different text: left alone, nothing accepted, nothing rejected
    first["messages"][0]["text"] = "changed"
    r = await client.post("/v1/sync/changes", json=first, headers=auth(key))
    assert r.json() == {"cursor": 2, "accepted": 0, "rejected": []}
    out = (await client.get("/v1/sync/changes", headers=auth(key))).json()
    assert out["messages"][0]["text"] == "first"
    # an edit: a new mid plus a tombstone for the old one
    mid2 = uid()
    r = await client.post(
        "/v1/sync/changes",
        json={"device": "d1", "conversations": [], "messages": [msg(mid, cid, deleted=True), msg(mid2, cid, text="edited")]},
        headers=auth(key),
    )
    assert r.json()["accepted"] == 2
    out = (await client.get("/v1/sync/changes?since=2", headers=auth(key))).json()
    by = {m["mid"]: m for m in out["messages"]}
    assert by[mid]["deleted"] is True and by[mid]["text"] == "" and by[mid2]["text"] == "edited"
    # the newer title wins; an older updated_at does not
    r = await client.post(
        "/v1/sync/changes", json={"device": "d2", "conversations": [conv(cid, title="Renamed", updated_at=1738000500)]}, headers=auth(key)
    )
    assert r.json()["accepted"] == 1
    r = await client.post(
        "/v1/sync/changes", json={"device": "d2", "conversations": [conv(cid, title="Stale", updated_at=1738000400)]}, headers=auth(key)
    )
    assert r.json()["accepted"] == 0
    out = (await client.get("/v1/sync/changes", headers=auth(key))).json()
    assert out["conversations"][0]["title"] == "Renamed"
    # delete the chat: the tombstone propagates, its texts are gone at once
    r = await client.delete(f"/v1/sync/conversations/{cid}", headers=auth(key))
    assert r.status_code == 200 and r.json()["deleted"] is True
    out = (await client.get("/v1/sync/changes", headers=auth(key))).json()
    assert out["conversations"][0]["deleted"] is True and out["conversations"][0]["title"] == ""
    assert out["messages"] == []
    st = (await client.get("/v1/sync/state", headers=auth(key))).json()
    assert st["counts"] == {"conversations": 0, "messages": 0}
    # a message for a deleted chat is refused, and so is an unknown one
    r = await client.post("/v1/sync/changes", json={"device": "d1", "messages": [msg(uid(), cid), msg(uid(), uid())]}, headers=auth(key))
    assert [x["reason"] for x in r.json()["rejected"]] == ["conversation_deleted", "unknown_cid"]
    assert (await client.delete(f"/v1/sync/conversations/{uid()}", headers=auth(key))).status_code == 404


async def test_second_main_is_refused_with_the_one_to_use():
    app, client, sender, up, cloud, settings = make()
    key = await signed_in(client, sender)
    main_a, main_b = uid(), uid()
    r = await client.post("/v1/sync/changes", json={"device": "a", "conversations": [conv(main_a, "main", "Main")]}, headers=auth(key))
    assert r.json()["accepted"] == 1
    mid = uid()
    r = await client.post(
        "/v1/sync/changes",
        json={"device": "b", "conversations": [conv(main_b, "main", "Main", created_at=1737000000)], "messages": [msg(mid, main_b)]},
        headers=auth(key),
    )
    out = r.json()
    assert out["accepted"] == 0
    assert out["rejected"] == [
        {"cid": main_b, "reason": "main_exists", "cid_main": main_a},
        {"mid": mid, "reason": "main_exists", "cid_main": main_a},
    ]
    # the device re-posts under the main it was told about
    r = await client.post("/v1/sync/changes", json={"device": "b", "messages": [msg(mid, main_a)]}, headers=auth(key))
    assert r.json()["accepted"] == 1
    # once the main is deleted, a new one may be started
    await client.delete(f"/v1/sync/conversations/{main_a}", headers=auth(key))
    r = await client.post("/v1/sync/changes", json={"device": "b", "conversations": [conv(main_b, "main", "Main")]}, headers=auth(key))
    assert r.json()["accepted"] == 1 and r.json()["rejected"] == []


async def test_long_text_is_cut_not_refused_and_bad_rows_are_named():
    app, client, sender, up, cloud, settings = make()
    key = await signed_in(client, sender)
    cid, mid = uid(), uid()
    r = await client.post(
        "/v1/sync/changes",
        json={
            "device": "a",
            "conversations": [conv(cid), {"cid": "bad id", "kind": "side"}, conv(uid(), "weird")],
            "messages": [msg(mid, cid, text="x" * 20000), msg(uid(), cid, role="system"), {"mid": "?", "cid": cid}],
        },
        headers=auth(key),
    )
    out = r.json()
    assert out["accepted"] == 2
    assert [x["reason"] for x in out["rejected"]] == ["bad_cid", "bad_kind", "bad_role", "bad_mid"]
    m = (await client.get("/v1/sync/changes", headers=auth(key))).json()["messages"][0]
    assert m["truncated"] is True and len(m["text"].encode()) == LIMITS["text_bytes"]
    # 200 messages per POST
    r = await client.post("/v1/sync/changes", json={"device": "a", "messages": [msg(uid(), cid) for _ in range(201)]}, headers=auth(key))
    assert r.status_code == 413 and r.json()["error"]["code"] == "too_many_messages"


async def test_turning_sync_off_deletes_and_refuses_until_on_again():
    app, client, sender, up, cloud, settings = make()
    key = await signed_in(client, sender)
    cid = uid()
    await client.post(
        "/v1/sync/changes", json={"device": "a", "conversations": [conv(cid)], "messages": [msg(uid(), cid)]}, headers=auth(key)
    )
    r = await client.put("/v1/sync/state", json={"enabled": False}, headers=auth(key))
    assert r.status_code == 200
    assert r.json()["enabled"] is False and r.json()["counts"] == {"conversations": 0, "messages": 0} and r.json()["cursor"] == 2
    for call in (
        client.post("/v1/sync/changes", json={"device": "a", "conversations": [conv(uid())]}, headers=auth(key)),
        client.get("/v1/sync/changes", headers=auth(key)),
        client.delete(f"/v1/sync/conversations/{cid}", headers=auth(key)),
    ):
        r = await call
        assert r.status_code == 409 and r.json()["error"]["code"] == "sync_off", r.text
    # the timeline notes the switch, never a text
    kinds = [e["kind"] for e in (await client.get("/v1/me/events", headers=auth(key))).json()["events"]]
    assert "sync.off" in kinds
    # on again: empty, the counter continues
    r = await client.put("/v1/sync/state", json={"enabled": True}, headers=auth(key))
    assert r.json()["enabled"] is True and r.json()["cursor"] == 2
    r = await client.post("/v1/sync/changes", json={"device": "a", "conversations": [conv(cid)]}, headers=auth(key))
    assert r.json()["cursor"] == 3
    # DELETE /v1/sync/changes wipes but keeps the switch
    r = await client.delete("/v1/sync/changes", headers=auth(key))
    assert r.json()["enabled"] is True and r.json()["counts"]["conversations"] == 0
    assert (await client.put("/v1/sync/state", json={}, headers=auth(key))).status_code == 400


async def test_retention_drops_the_oldest_conversations_messages():
    app, client, sender, up, cloud, settings = make()
    key = await signed_in(client, sender)
    store = app.state.sync
    account_id = cloud.authenticate(key).account_id
    old, mid_conv, new = uid(), uid(), uid()
    # three conversations, by age; the limit is lowered for the test
    store.push(account_id, "a", [conv(old, created_at=1000), conv(mid_conv, created_at=2000), conv(new, created_at=3000)], [])
    import nanomuse_cloud.sync as sync_mod

    saved = dict(LIMITS)
    try:
        sync_mod.LIMITS["messages"] = 5
        store.push(account_id, "a", [], [msg(uid(), old, created_at=1000 + i) for i in range(3)])
        store.push(account_id, "a", [], [msg(uid(), mid_conv, created_at=2000 + i) for i in range(2)])
        assert store.state(account_id)["counts"]["messages"] == 5
        store.push(account_id, "a", [], [msg(uid(), new, created_at=3000)])
        by_cid: dict[str, int] = {}
        for m in store.changes(account_id, 0, 1000)["messages"]:
            by_cid[m["cid"]] = by_cid.get(m["cid"], 0) + 1
        assert old not in by_cid and by_cid[mid_conv] == 2 and by_cid[new] == 1
        # one conversation holding it all: its oldest messages go
        store.push(account_id, "a", [], [msg(uid(), new, created_at=3001 + i) for i in range(6)])
        msgs = [m for m in store.changes(account_id, 0, 1000)["messages"] if m["cid"] == new]
        assert len(msgs) == 5 and min(m["created_at"] for m in msgs) == 3002
    finally:
        sync_mod.LIMITS.update(saved)


async def test_tombstones_are_swept_after_thirty_days():
    app, client, sender, up, cloud, settings = make()
    key = await signed_in(client, sender)
    store = app.state.sync
    account_id = cloud.authenticate(key).account_id
    cid = uid()
    store.push(account_id, "a", [conv(cid)], [msg(uid(), cid)])
    store.delete_conversation(account_id, cid)
    with cloud.db.tx() as c:
        c.execute("UPDATE sync_conversations SET deleted_at=deleted_at-31*86400 WHERE cid=?", (cid,))
    store.push(account_id, "a", [conv(uid())], [])  # any write sweeps
    assert [x["cid"] for x in store.changes(account_id, 0, 1000)["conversations"]] != [cid]
    assert all(not x["deleted"] for x in store.changes(account_id, 0, 1000)["conversations"])


async def test_account_deletion_takes_the_store_and_admin_sees_totals_only():
    app, client, sender, up, cloud, settings = make()
    key = await signed_in(client, sender)
    other = await signed_in(client, sender, "13900139000", "other")
    cid = uid()
    await client.post(
        "/v1/sync/changes",
        json={"device": "a", "conversations": [conv(cid)], "messages": [msg(uid(), cid, text="secret words")]},
        headers=auth(key),
    )
    await client.put("/v1/sync/state", json={"enabled": False}, headers=auth(other))
    r = await client.get("/v1/admin/sync", headers={"X-Admin-Token": "admin"})
    assert r.status_code == 200
    out = r.json()
    assert out["accounts_enabled"] == 1 and out["accounts_disabled"] == 1 and out["accounts_with_data"] == 1
    assert out["conversations"] == 1 and out["messages"] == 1 and out["bytes"] == len("secret words")
    assert "secret words" not in r.text.replace("secret words", "") and "text" not in out
    assert (await client.post("/v1/auth/delete", headers=auth(key))).status_code == 204
    out = (await client.get("/v1/admin/sync", headers={"X-Admin-Token": "admin"})).json()
    assert out["conversations"] == 0 and out["messages"] == 0 and out["bytes"] == 0
    with cloud.db.tx() as c:
        assert c.execute("SELECT COUNT(*) FROM sync_cursors").fetchone()[0] == 0


def test_sync_enabled_column_is_added_to_an_older_database(tmp_path):
    import sqlite3

    path = tmp_path / "old.db"
    conn = sqlite3.connect(path)
    conn.executescript(
        """CREATE TABLE accounts (id TEXT PRIMARY KEY, id_hash TEXT NOT NULL UNIQUE, channel TEXT NOT NULL, hint TEXT NOT NULL,
           created_at INTEGER NOT NULL, granted INTEGER NOT NULL DEFAULT 0, used INTEGER NOT NULL DEFAULT 0, disabled INTEGER NOT NULL DEFAULT 0);
           INSERT INTO accounts(id, id_hash, channel, hint, created_at) VALUES ('a1', 'h1', 'phone', '138****0000', 1);"""
    )
    conn.close()
    db = Database(str(path))
    assert "accounts.sync_enabled" in db.added
    assert db.account("a1")["sync_enabled"] == 1
    db.close()


@pytest.fixture
def ws_client():
    settings = Settings(database=":memory:", secret="test-secret", public_base="http://cloud.test", hub_frame_limit=4096)
    sender = LogSender()
    cloud = Cloud(settings, Database(":memory:"), sender)
    app = create_app(settings, cloud)
    with TestClient(app) as c:
        c.sender = sender
        yield c


def test_hub_tells_the_other_devices_after_an_accepting_push(ws_client):
    key = ws_sign_up(ws_client, "13800138000")
    with connect(ws_client, key) as phone, connect(ws_client, key) as pc:
        phone.send_json(hello("phone", "phone-1", "Pixel"))
        phone.receive_json()  # welcome
        phone.receive_json()  # devices
        pc.send_json(hello("computer", "pc-1", "desk"))
        pc.receive_json()  # welcome
        pc.receive_json()  # devices
        phone.receive_json()  # devices (pc arrived)

        cid = uid()
        r = ws_client.post(
            "/v1/sync/changes",
            json={"device": "phone-1", "conversations": [conv(cid, "main")], "messages": [msg(uid(), cid)]},
            headers={"Authorization": f"Bearer {key}"},
        )
        assert r.status_code == 200 and r.json()["accepted"] == 2
        frame = pc.receive_json()
        assert frame == {"type": "sync", "what": "conversations", "cursor": 2, "from": "phone-1"}
        # the pusher hears nothing (its next frame is the pong to its ping)
        phone.send_json({"type": "ping"})
        assert phone.receive_json()["type"] == "pong"
        # an idempotent re-post accepts nothing and tells nobody
        r = ws_client.post(
            "/v1/sync/changes",
            json={"device": "phone-1", "conversations": [conv(cid, "main")]},
            headers={"Authorization": f"Bearer {key}"},
        )
        assert r.json()["accepted"] == 0
        pc.send_json({"type": "ping"})
        assert pc.receive_json()["type"] == "pong"
        # a delete from the console (no device header) reaches every device
        r = ws_client.delete(f"/v1/sync/conversations/{cid}", headers={"Authorization": f"Bearer {key}"})
        assert r.status_code == 200
        assert pc.receive_json()["type"] == "sync" and phone.receive_json()["type"] == "sync"
