"""The avatar studio: the words that ask for a face, the cost card, the four candidates, the pick, the poses."""

from __future__ import annotations

import base64
import io
import json
import time
from collections.abc import Iterator

import httpx
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from nanomuse.avatar.studio import PICTURES_PER_FACE, build_prompt, parse_choice, parse_request
from nanomuse.config import Settings
from nanomuse.llm import MockLLM
from nanomuse.server import create_app
from nanomuse.server.service import MuseService


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("换个形象：一只橘猫", "一只橘猫"),
        ("帮我把形象换成一只戴眼镜的柯基吧", "一只戴眼镜的柯基"),
        ("变成一只小龙", "一只小龙"),
        ("New avatar: a robot owl", "robot owl"),
        ("please change your avatar to a small fox with a scarf", "small fox with a scarf"),
        ("become a corgi", "corgi"),
        ("be quiet", None),
        ("今天天气怎么样", None),
        ("换个话题吧", None),
        ("", None),
    ],
)
def test_parse_request(text: str, expected: str | None) -> None:
    assert parse_request(text) == expected


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("第二个", 1),
        ("就第一个吧", 0),
        ("3", 2),
        ("选4号", 3),
        ("the first one", 0),
        ("I'll take 2", 1),
        ("top right", 1),
        ("右下", 3),
        ("重新生成", "regenerate"),
        ("try again", "regenerate"),
        ("算了", "cancel"),
        ("cancel", "cancel"),
        ("what about the weather", None),
        ("5", None),
    ],
)
def test_parse_choice(text: str, expected: int | str | None) -> None:
    assert parse_choice(text) == expected


def test_build_prompt_varies_by_index() -> None:
    a, b = build_prompt("一只橘猫。", 0), build_prompt("一只橘猫。", 1)
    assert "一只橘猫" in a and a != b
    assert "variation 1" in a and "variation 2" in b
    assert "white background" in a


def _png(colour: tuple[int, int, int]) -> bytes:
    out = io.BytesIO()
    Image.new("RGB", (64, 64), colour).save(out, "PNG")
    return out.getvalue()


class FakeImages:
    """An OpenAI images endpoint that answers every call with a coloured square."""

    def __init__(self) -> None:
        self.generations: list[dict] = []
        self.edits: list[str] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/images/generations"):
            body = json.loads(request.content)
            self.generations.append(body)
            colour = (200, 40 * len(self.generations) % 255, 90)
        elif request.url.path.endswith("/images/edits"):
            self.edits.append(request.url.path)
            colour = (40, 120, 200)
        else:
            return httpx.Response(404, json={"error": {"message": "no such route"}})
        return httpx.Response(
            200, json={"data": [{"b64_json": base64.b64encode(_png(colour)).decode()}]}
        )


@pytest.fixture()
def studio_server(settings: Settings) -> Iterator[tuple[TestClient, MuseService, FakeImages]]:
    settings.server.token = "secret-token"
    settings.llm.base_url = "https://images.example.test/v1"
    settings.llm.api_key = "k"
    settings.llm.image_model = "draw-1"
    service = MuseService(settings, llm=MockLLM([]))
    fake = FakeImages()
    app = create_app(settings, service)
    with TestClient(app) as client:
        service.avatar._http = httpx.AsyncClient(transport=httpx.MockTransport(fake.handler))
        client.headers["Authorization"] = "Bearer secret-token"
        yield client, service, fake


def _wait(pred, timeout: float = 5.0):  # noqa: ANN001
    deadline = time.time() + timeout
    while time.time() < deadline:
        v = pred()
        if v:
            return v
        time.sleep(0.05)
    raise AssertionError("condition not met in time")


def _avatar_event(client: TestClient) -> dict:
    events = client.get("/api/threads/main/events").json()["events"]
    return next(e for e in reversed(events) if e["type"] == "avatar")


def test_chat_request_becomes_a_card_and_the_agent_stays_out(studio_server) -> None:
    client, service, fake = studio_server
    assert client.get("/api/avatar").json() == {
        "available": True,
        "image_model": "draw-1",
        "cloud": False,
        "current": None,
    }
    r = client.post("/api/threads/main/send", json={"text": "换个形象：一只橘猫"})
    assert r.status_code == 200
    ev = _wait(
        lambda: client.get("/api/threads/main/events").json()["events"] and _avatar_event(client)
    )
    assert ev["stage"] == "estimate" and ev["description"] == "一只橘猫"
    assert ev["cost"]["cloud"] is False and ev["cost"]["pictures"] == PICTURES_PER_FACE
    # the agent was not run for it: no assistant bubble, the thread is idle
    kinds = [e["type"] for e in client.get("/api/threads/main/events").json()["events"]]
    assert "assistant" not in kinds
    assert not service.threads["main"].busy
    assert fake.generations == []


def test_draw_pick_pose_sets_the_profile(studio_server, settings: Settings) -> None:
    client, service, fake = studio_server
    client.post("/api/threads/main/send", json={"text": "new avatar: a robot owl"})
    ev = _wait(lambda: _avatar_event(client))
    sid = ev["session"]
    r = client.post("/api/avatar/start", json={"session": sid})
    assert r.status_code == 200 and r.json()["stage"] == "drawing"
    ev = _wait(lambda: (e := _avatar_event(client))["stage"] == "choose" and e)
    assert len(fake.generations) == 4 and all(ev["candidates"])
    assert {g["model"] for g in fake.generations} == {"draw-1"}
    # each candidate is a webp in the workspace, reachable through the files API
    first = ev["candidates"][0]
    assert first.startswith("avatar/sessions/")
    got = client.get(f"/api/files/{first}")
    assert got.status_code == 200 and got.headers["content-type"].startswith("image/webp")
    # the pick by words
    client.post("/api/threads/main/send", json={"text": "第二个"})
    ev = _wait(lambda: (e := _avatar_event(client))["stage"] == "done" and e)
    assert ev["chosen"] == 1 and ev["face"].startswith("face-")
    assert set(ev["moods"]) == {"idle", "working", "waiting", "happy", "error"}
    assert len(fake.edits) == 4
    face_dir = service.workspace() / "avatar" / ev["face"]
    assert sorted(p.name for p in face_dir.iterdir()) == [
        "error.webp",
        "happy.webp",
        "idle.webp",
        "waiting.webp",
        "working.webp",
    ]
    assert client.get("/api/settings").json()["profile"]["avatar"] == ev["face"]
    # the candidates of the finished session are cleared later; the face stays
    assert client.get("/api/avatar").json()["current"]["stage"] == "done"


def test_cancel_and_redraw(studio_server) -> None:
    client, service, fake = studio_server
    r = client.post("/api/avatar/begin", json={"description": "a small fox"})
    assert r.status_code == 200 and r.json()["stage"] == "estimate"
    sid = r.json()["session"]
    client.post("/api/avatar/start", json={"session": sid})
    _wait(lambda: _avatar_event(client)["stage"] == "choose")
    # "regenerate" by words draws four more
    client.post("/api/threads/main/send", json={"text": "重新生成"})
    _wait(lambda: len(fake.generations) >= 8)
    _wait(lambda: _avatar_event(client)["stage"] == "choose")
    r = client.post("/api/avatar/cancel", json={"session": sid})
    assert r.status_code == 200 and r.json()["stage"] == "cancelled"
    assert not (service.workspace() / "avatar" / "sessions" / sid).exists()
    # a session that is over cannot be driven
    assert client.post("/api/avatar/choose", json={"session": sid, "index": 0}).status_code == 200
    assert client.post("/api/avatar/start", json={"session": "nope"}).status_code == 409


def test_without_an_image_model_the_chat_says_so(settings: Settings) -> None:
    settings.server.token = "secret-token"
    settings.llm.base_url = "https://api.deepseek.com"
    settings.llm.api_key = "k"
    service = MuseService(settings, llm=MockLLM([]))
    app = create_app(settings, service)
    with TestClient(app) as client:
        client.headers["Authorization"] = "Bearer secret-token"
        assert client.get("/api/avatar").json()["available"] is False
        client.post("/api/threads/main/send", json={"text": "换个形象：一只橘猫"})
        notice = _wait(
            lambda: next(
                (
                    e
                    for e in client.get("/api/threads/main/events").json()["events"]
                    if e["type"] == "notice"
                ),
                None,
            )
        )
        assert notice["code"] == "no_image_model"
        assert "avatar" not in [
            e["type"] for e in client.get("/api/threads/main/events").json()["events"]
        ]
