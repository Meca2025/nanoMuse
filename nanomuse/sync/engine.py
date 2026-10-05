"""Conversation sync (contract C7): the runtime's chats are the same on every device of the
account.

The relay (``/v1/sync/*``, relay 0.19) keeps the text of the account's conversations —
user and final assistant messages, attachment names and sizes — and a change counter per
account. This engine:

* **pushes** this runtime's threads after each finished turn (debounced two seconds), when a
  chat is created, renamed or deleted, and in full when sync is turned on again;
* **pulls** on start, on sign-in, on the hub's ``sync`` frame and every 60 seconds, and
  applies what came in ``seq`` order: new conversations become threads (title, the device
  that started them as a badge), new messages become timeline events and history for the
  agent, tombstones remove messages and threads.

Every synced thread has a ``cid`` (kept in ``data_dir/sync.json`` next to the cursor);
every synced event carries a ``mid`` and ``synced: true`` in the timeline. The main chat
is ``kind: main`` and one conversation for the whole account: the first device to push it
names its cid, every other device adopts that cid on its first pull (``main_exists`` says
which when two race). Chats addressed to another device (``Thread.device``) and chats
another device opened here (``Thread.remote_from``) are not synced — the other device has
the same conversation as its own.

Nothing here reaches the network when the account is signed out; ``sync_off`` from the
relay flips the local switch, ``bad_key`` pauses until the next sign-in."""

from __future__ import annotations

import asyncio
import contextlib
import json
import time
import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from nanomuse.cloud import CloudError
from nanomuse.logger import logger
from nanomuse.schema import Message
from nanomuse.server.events import MAIN_THREAD, now_iso
from nanomuse.sync.client import SyncClient

if TYPE_CHECKING:
    from nanomuse.server.service import MuseService, Thread

PUSH_DELAY_S = 2.0
PULL_EVERY_S = 60.0
BATCH = 200
PAGE = 500
# how many POSTs one push may make before it lets go (a brand-new device with a long history)
MAX_ROUNDS = 50


def new_cid() -> str:
    return str(uuid.uuid4())


def _unix(ts: str | None) -> int:
    """A timeline ``ts`` (ISO) → Unix seconds; now when unreadable."""
    if ts:
        try:
            return int(datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp())
        except ValueError:
            pass
    return int(time.time())


def _iso(unix: int | float | None) -> str:
    try:
        return datetime.fromtimestamp(float(unix or 0), UTC).isoformat(timespec="milliseconds")
    except (OverflowError, OSError, ValueError):
        return now_iso()


class ConversationSync:
    def __init__(self, svc: MuseService):
        self.svc = svc
        self.path = svc.data_dir / "sync.json"
        self.state: dict[str, Any] = {
            "account_id": "",
            "cursor": 0,
            "enabled": bool(svc.settings.cloud.sync),
            "cids": {},  # thread id → cid
            "titles": {},  # thread id → the title last pushed
        }
        self._load()
        self.client = SyncClient(svc.hub.cloud)
        self._push_task: asyncio.Task[None] | None = None
        self._pull_task: asyncio.Task[int] | None = None
        self._timer: asyncio.Task[None] | None = None
        self._lock = asyncio.Lock()
        self._tasks: set[asyncio.Task[Any]] = set()
        # a 401 from the relay: nothing more until the next sign-in
        self._paused = False
        self._applying = False
        self.last_pull_at: str | None = None
        self.last_push_at: str | None = None
        self.last_error = ""

    # ------------------------------------------------------------------ what this device keeps
    def _load(self) -> None:
        try:
            data = json.loads(self.path.read_text("utf-8"))
        except (OSError, ValueError):
            return
        if isinstance(data, dict):
            for key in ("account_id", "cursor", "enabled"):
                if key in data:
                    self.state[key] = data[key]
            for key in ("cids", "titles"):
                if isinstance(data.get(key), dict):
                    self.state[key] = {str(k): str(v) for k, v in data[key].items()}

    def _save(self) -> None:
        try:
            self.path.write_text(json.dumps(self.state, ensure_ascii=False, indent=1), "utf-8")
        except OSError as exc:  # pragma: no cover
            logger.warning("could not save sync state: {}", exc)

    @property
    def enabled(self) -> bool:
        return bool(self.state.get("enabled", True))

    @property
    def cursor(self) -> int:
        return int(self.state.get("cursor") or 0)

    @property
    def active(self) -> bool:
        """Signed in, switched on, not paused by a refused key."""
        return self.enabled and self.svc.hub.signed_in and not self._paused

    def cid_of(self, thread_id: str) -> str | None:
        v = self.state["cids"].get(thread_id)
        return str(v) if v else None

    def thread_of(self, cid: str) -> Thread | None:
        for tid, c in self.state["cids"].items():
            if c == cid:
                return self.svc.threads.get(tid)
        return None

    def _eligible(self, thread: Thread) -> bool:
        return not thread.device and not thread.remote_from

    def _cid_for(self, thread: Thread) -> str:
        cid = self.cid_of(thread.id)
        if cid is None:
            cid = new_cid()
            self.state["cids"][thread.id] = cid
            self._save()
        return cid

    def view(self) -> dict[str, Any]:
        """What the Data controls page shows: the switch, whether it can be used, the cursor."""
        return {
            "enabled": self.enabled,
            "available": self.svc.hub.signed_in,
            "paused": self._paused,
            "cursor": self.cursor,
            "last_pull_at": self.last_pull_at,
            "last_push_at": self.last_push_at,
            "error": self.last_error,
        }

    # ------------------------------------------------------------------ lifecycle
    def start(self) -> None:
        """After the hub is up: a first pull, a push of what is new, and the minute timer."""
        if self._timer is None or self._timer.done():
            self._timer = asyncio.create_task(self._tick(), name="sync-timer")
        if self.active:
            self.pull_soon()
            self.push_soon(delay=PUSH_DELAY_S)

    async def stop(self) -> None:
        for t in (self._timer, self._push_task, self._pull_task):
            if t is not None and not t.done():
                t.cancel()
                with contextlib.suppress(asyncio.CancelledError, Exception):
                    await t

    async def _tick(self) -> None:
        while True:
            await asyncio.sleep(PULL_EVERY_S)
            if self.active:
                self.pull_soon()

    def account_changed(self, account_id: str) -> None:
        """Signed in (again): a different account starts from cursor 0 with fresh cids."""
        self._paused = False
        self.last_error = ""
        if account_id and account_id != str(self.state.get("account_id") or ""):
            self.state.update(account_id=account_id, cursor=0, cids={}, titles={})
            self._clear_marks()
            self._save()
        if self.active:
            self.pull_soon()
            self.push_soon()

    def signed_out(self) -> None:
        """The key is gone: nothing more until the next sign-in; what is local stays."""
        for t in (self._push_task, self._pull_task):
            if t is not None and not t.done():
                t.cancel()
        self._paused = False

    def _clear_marks(self) -> None:
        """Every synced event is unsynced again: the next push sends it all (a new account, the
        switch turned back on, the main chat re-homed)."""
        for thread in self.svc.threads.values():
            self._clear_thread_marks(thread)

    @staticmethod
    def _clear_thread_marks(thread: Thread) -> None:
        changed = False
        for ev in thread.timeline.events:
            if ev.get("synced"):
                ev["synced"] = False
                changed = True
        if changed:
            thread.timeline.save()

    # ------------------------------------------------------------------ the switch
    async def set_enabled(self, enabled: bool) -> dict[str, Any]:
        """Data controls: off tells the relay (which deletes) and stops; on re-pushes this
        device's conversations and pulls the others'."""
        enabled = bool(enabled)
        relay: dict[str, Any] | None = None
        if self.svc.hub.signed_in:
            self.client.cloud.api_key = self.svc.hub._key()
            relay = await self.client.set_enabled(enabled)
        self.state["enabled"] = enabled
        self._save()
        if enabled:
            self._paused = False
            self.state["titles"] = {}
            self._clear_marks()
            if self.svc.hub.signed_in:
                self.pull_soon()
                self.push_soon()
        else:
            for t in (self._push_task, self._pull_task):
                if t is not None and not t.done():
                    t.cancel()
        return {**self.view(), "relay": relay}

    async def relay_state(self) -> dict[str, Any] | None:
        """The relay's own view (counts, limits), or None when it cannot be asked."""
        if not self.svc.hub.signed_in:
            return None
        self.client.cloud.api_key = self.svc.hub._key()
        try:
            return await self.client.state()
        except CloudError as exc:
            self._note_error(exc)
            return None

    async def delete_remote(self) -> dict[str, Any] | None:
        """“Delete synced conversations”: the relay's store emptied, the switch kept, local
        chats untouched."""
        if not self.svc.hub.signed_in:
            return None
        self.client.cloud.api_key = self.svc.hub._key()
        out = await self.client.wipe()
        self.state["cursor"] = int(out.get("cursor") or self.cursor)
        self._save()
        return out

    # ------------------------------------------------------------------ hooks from the service
    def turn_finished(self, thread: Thread) -> None:
        if self.active and self._eligible(thread):
            self.push_soon(delay=PUSH_DELAY_S)

    def thread_changed(self, thread: Thread) -> None:
        """Created or renamed: push now (a rename is one small request)."""
        if self.active and self._eligible(thread):
            self.push_soon(delay=0.2)

    def thread_deleted(self, thread_id: str) -> None:
        cid = self.state["cids"].pop(thread_id, None)
        self.state["titles"].pop(thread_id, None)
        self._save()
        if cid and self.active and not self._applying:
            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                return
            self._keep(loop.create_task(self._delete_remote_conversation(cid), name="sync-delete"))

    def on_frame(self, frame: dict[str, Any]) -> None:
        """The hub says another device pushed: pull when our cursor is behind."""
        if str(frame.get("from") or "") == self.svc.hub.device_id:
            return
        if int(frame.get("cursor") or 0) > self.cursor and self.active:
            self.pull_soon()

    def _keep(self, task: asyncio.Task[Any]) -> None:
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    async def _delete_remote_conversation(self, cid: str) -> None:
        self.client.cloud.api_key = self.svc.hub._key()
        try:
            await self.client.delete_conversation(cid)
        except CloudError as exc:
            if exc.code != "no_conversation":
                self._note_error(exc)

    # ------------------------------------------------------------------ scheduling
    def push_soon(self, delay: float = PUSH_DELAY_S) -> None:
        if not self.active:
            return
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        if self._push_task is not None and not self._push_task.done():
            self._push_task.cancel()
        self._push_task = loop.create_task(self._push_later(delay), name="sync-push")

    async def _push_later(self, delay: float) -> None:
        await asyncio.sleep(delay)
        try:
            await self.push()
        except CloudError:
            pass  # noted by push(); rule 7: nothing is shown, the next trigger tries again
        except Exception:  # noqa: BLE001
            logger.exception("sync push")

    def pull_soon(self) -> None:
        if not self.active:
            return
        if self._pull_task is not None and not self._pull_task.done():
            return
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        self._pull_task = loop.create_task(self._pull_quietly(), name="sync-pull")

    async def _pull_quietly(self) -> int:
        try:
            return await self.pull()
        except CloudError:
            pass  # noted by pull()
        except Exception:  # noqa: BLE001
            logger.exception("sync pull")
        return 0

    def _note_error(self, exc: CloudError) -> None:
        """Rule 7: network errors are silent (the next trigger tries again); ``sync_off`` flips
        the switch here; a refused key pauses until the next sign-in."""
        if exc.code == "sync_off":
            self.state["enabled"] = False
            self._save()
            self.last_error = ""
            logger.info("sync: turned off on another device; off here too")
            return
        if exc.status == 401:
            self._paused = True
            self.last_error = "signed_out"
            return
        self.last_error = exc.code
        logger.debug("sync: {}", exc.describe())

    # ------------------------------------------------------------------ push
    def _attachments(self, ev: dict[str, Any]) -> list[dict[str, Any]]:
        out = []
        for f in ev.get("files") or []:
            if isinstance(f, dict):
                out.append(
                    {
                        "name": str(f.get("name") or "")[:200],
                        "mime": str(f.get("mime") or "")[:100],
                        "size": int(f.get("size") or 0),
                    }
                )
        return out

    def _unsynced(self, thread: Thread, cid: str) -> list[tuple[dict[str, Any], dict[str, Any]]]:
        """(event, wire message) for every user / final assistant text not yet on the relay."""
        out: list[tuple[dict[str, Any], dict[str, Any]]] = []
        for ev in thread.timeline.events:
            kind = ev.get("type")
            if kind not in ("user", "assistant") or ev.get("synced") or ev.get("quiet"):
                continue
            if kind == "assistant" and not ev.get("final"):
                continue
            text = str(ev.get("text") or "")
            attachments = self._attachments(ev)
            if not text.strip() and not attachments:
                continue
            mid = str(ev.get("mid") or "")
            if not mid:
                mid = new_cid()
                ev["mid"] = mid
            wire = {
                "mid": mid,
                "cid": cid,
                "role": kind,
                "text": text,
                "created_at": _unix(ev.get("ts")),
            }
            if attachments:
                wire["attachments"] = attachments
            out.append((ev, wire))
        return out

    async def push(self) -> dict[str, Any]:
        """Everything new on this device to the relay, in batches of 200 messages."""
        if not self.active:
            return {"pushed": 0}
        async with self._lock:
            try:
                return await self._push_locked()
            except CloudError as exc:
                self._note_error(exc)
                raise

    async def _push_locked(self) -> dict[str, Any]:
        self.client.cloud.api_key = self.svc.hub._key()
        device = self.svc.hub.device_id
        pushed = 0
        sent = False
        for _round in range(MAX_ROUNDS):
            conversations: list[dict[str, Any]] = []
            messages: list[dict[str, Any]] = []
            pending: list[tuple[Thread, dict[str, Any]]] = []
            for thread in list(self.svc.threads.values()):
                if not self._eligible(thread):
                    continue
                cid = self._cid_for(thread)
                if self.state["titles"].get(thread.id) != thread.title:
                    conversations.append(
                        {
                            "cid": cid,
                            "kind": "main" if thread.id == MAIN_THREAD else "side",
                            "title": thread.title,
                            "created_at": _unix(thread.created_at),
                            "updated_at": _unix(thread.updated_at),
                        }
                    )
                for ev, wire in self._unsynced(thread, cid):
                    if len(messages) >= BATCH:
                        break
                    messages.append(wire)
                    pending.append((thread, ev))
            if not conversations and not messages:
                break
            sent = True
            out = await self.client.push(device, conversations, messages)
            # the cursor only moves on a pull: the relay's cursor after our POST would skip
            # whatever the other devices pushed in between
            rejected = [r for r in out.get("rejected") or [] if isinstance(r, dict)]
            redirect: dict[str, str] = {}
            for r in rejected:
                if r.get("reason") == "main_exists" and r.get("cid") and r.get("cid_main"):
                    redirect[str(r["cid"])] = str(r["cid_main"])
            if redirect:
                # the account's main chat already has an id: ours takes it, and its messages go
                # again under it on the next round
                for tid, cid in list(self.state["cids"].items()):
                    if cid in redirect:
                        self.state["cids"][tid] = redirect[cid]
                        self.state["titles"].pop(tid, None)
                        logger.info("sync: the main chat adopts the account's conversation id")
            refused_mids = {
                str(r.get("mid")): str(r.get("reason") or "")
                for r in rejected
                if r.get("mid") and r.get("reason") != "main_exists"
            }
            for thread, ev in pending:
                mid = str(ev.get("mid") or "")
                if mid in refused_mids:
                    # a bad row stays bad: do not send it again and again
                    ev["synced"] = True
                    ev["sync_refused"] = refused_mids[mid]
                elif not any(
                    r.get("mid") == mid and r.get("reason") == "main_exists" for r in rejected
                ):
                    ev["synced"] = True
                    pushed += 1
                thread.timeline.save()
            for c in conversations:
                if not any(r.get("cid") == c["cid"] for r in rejected):
                    for tid, cid in self.state["cids"].items():
                        if cid == c["cid"]:
                            self.state["titles"][tid] = c["title"]
            self._save()
            if len(messages) < BATCH and not redirect:
                break
        if pushed:
            self.last_push_at = now_iso()
            logger.debug("sync: {} message(s) pushed", pushed)
        if sent:
            # our rows come back on the next pull (known ids, no change) and the cursor catches up
            self.pull_soon()
        return {"pushed": pushed, "cursor": self.cursor}

    # ------------------------------------------------------------------ pull
    async def pull(self) -> int:
        """What the other devices pushed since our cursor, applied in order. Returns how many
        rows were applied."""
        if not self.active:
            return 0
        async with self._lock:
            try:
                return await self._pull_locked()
            except CloudError as exc:
                self._note_error(exc)
                raise

    async def _pull_locked(self) -> int:
        self.client.cloud.api_key = self.svc.hub._key()
        applied = 0
        for _page in range(MAX_ROUNDS):
            out = await self.client.changes(self.cursor, PAGE)
            # The page's conversations first, then its messages, each in seq order: a rename
            # puts a conversation's seq above its messages, and the relay sends every
            # message's conversation along with the page so none of them is an orphan.
            convs = [c for c in out.get("conversations") or [] if isinstance(c, dict)]
            msgs = [m for m in out.get("messages") or [] if isinstance(m, dict)]
            convs.sort(key=lambda c: int(c.get("seq") or 0))
            msgs.sort(key=lambda m: int(m.get("seq") or 0))
            self._applying = True
            try:
                for row in convs:
                    self._apply_conversation(row)
                    applied += 1
                for row in msgs:
                    self._apply_message(row)
                    applied += 1
            finally:
                self._applying = False
            self.state["cursor"] = max(self.cursor, int(out.get("cursor") or 0))
            self._save()
            if not out.get("more"):
                break
        self.last_pull_at = now_iso()
        self.last_error = ""
        if applied:
            logger.info("sync: {} change(s) from the account's other devices", applied)
            # what adoption or a tombstone left unsynced goes up now
            self.push_soon(delay=0.5)
        return applied

    def _apply_conversation(self, row: dict[str, Any]) -> None:
        cid = str(row.get("cid") or "")
        if not cid:
            return
        kind = str(row.get("kind") or "side")
        thread = self.thread_of(cid)
        if row.get("deleted"):
            if thread is None:
                return
            if thread.id == MAIN_THREAD:
                # the main chat is never deleted here; it starts over on the relay with a new id
                self.state["cids"].pop(thread.id, None)
                self.state["titles"].pop(thread.id, None)
                self._clear_thread_marks(thread)
                self._save()
                return
            self.svc.delete_thread(thread.id)
            return
        title = str(row.get("title") or "").strip()
        if kind == "main":
            main = self.svc.threads.get(MAIN_THREAD)
            if main is None:
                return
            if thread is None or thread.id != MAIN_THREAD:
                # the account's main chat: this device's main adopts its id and sends its
                # own messages into it (rule 4)
                if thread is not None:
                    # a side chat of ours carried that cid: it is the main chat elsewhere
                    self.state["cids"].pop(thread.id, None)
                self.state["cids"][MAIN_THREAD] = cid
                self.state["titles"][MAIN_THREAD] = main.title
                self._clear_thread_marks(main)
                self._save()
            return
        if thread is not None:
            if title and title != thread.title:
                self.state["titles"][thread.id] = title
                self.svc.rename_thread(thread.id, title)
            return
        device = str(row.get("device") or "")
        if device and device == self.svc.hub.device_id:
            # ours, but the mapping was lost (a reset): no second copy
            return
        created = self.svc.create_thread(title or "Side chat")
        created.origin_device = device
        created.origin_device_name = str(row.get("device_name") or "")
        created.created_at = _iso(row.get("created_at"))
        created.updated_at = _iso(row.get("updated_at"))
        self.state["cids"][created.id] = cid
        self.state["titles"][created.id] = created.title
        self._save()
        self.svc._save_index()
        self.svc.bus.publish({"kind": "thread", "thread": created.meta()})

    def _find_event(self, thread: Thread, mid: str) -> dict[str, Any] | None:
        for ev in thread.timeline.events:
            if ev.get("mid") == mid:
                return ev
        return None

    def _apply_message(self, row: dict[str, Any]) -> None:
        cid = str(row.get("cid") or "")
        mid = str(row.get("mid") or "")
        if not cid or not mid:
            return
        thread = self.thread_of(cid)
        if thread is None or not self._eligible(thread):
            return
        existing = self._find_event(thread, mid)
        if row.get("deleted"):
            if existing is not None:
                thread.timeline.remove(existing["id"])
                self.svc.bus.publish(
                    {"kind": "event_removed", "thread": thread.id, "id": existing["id"]}
                )
            return
        if existing is not None:
            return
        role = str(row.get("role") or "")
        if role not in ("user", "assistant"):
            return
        text = str(row.get("text") or "")
        event: dict[str, Any] = {
            "type": role,
            "text": text,
            "mid": mid,
            "synced": True,
            "ts": _iso(row.get("created_at")),
        }
        device = str(row.get("device") or "")
        if device and device != self.svc.hub.device_id:
            event["via_device"] = device
            event["via_device_name"] = str(row.get("device_name") or "")
        if role == "assistant":
            event["final"] = True
        if row.get("truncated"):
            event["truncated"] = True
        attachments = row.get("attachments")
        if isinstance(attachments, list) and attachments:
            # names and sizes only: the files stayed on the device they were made on
            event["files"] = [
                {
                    "name": str(a.get("name") or ""),
                    "size": int(a.get("size") or 0),
                    "mime": str(a.get("mime") or ""),
                    "path": "",
                    "kind": "remote",
                }
                for a in attachments
                if isinstance(a, dict)
            ]
        ev = thread.timeline.add(event)
        # in time order with what is here already (add() appends)
        thread.timeline.events.sort(key=lambda e: str(e.get("ts") or ""))
        thread.updated_at = max(thread.updated_at, ev["ts"])
        if not thread.busy:
            # the agent reads it as history on its next turn here
            msg = Message.user(text) if role == "user" else Message.assistant(text)
            msg.meta["mid"] = mid
            thread.agent.messages.append(msg)
            thread.agent._save_session()
        self.svc.bus.publish({"kind": "event", "event": ev})
        self.svc.bus.publish({"kind": "thread", "thread": thread.meta()})
