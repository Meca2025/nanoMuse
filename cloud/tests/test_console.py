"""The console's files as the relay serves them (after 0.22): revalidated on every load, so a
deploy reaches the next reload; and the web console's error table knows every code the
relay can answer a signed-in person with, in both languages."""

from __future__ import annotations

import re
from pathlib import Path

from test_accounts import make

CONSOLE = Path(__file__).resolve().parents[1] / "nanomuse_cloud" / "console"

# what a signed-in person can get from the relay since 0.22 (service.py, api.py), by code
CODES_0_22 = [
    "signup_closed",
    "channel_unsupported",
    "service_paused",
    "sync_paused",
    "hub_paused",
    "account_deleted",
    "too_many_in_flight",
    "rate_limited",
]


async def test_console_files_are_revalidated_on_every_load():
    app, client, *_ = make()
    for path in ("/app/", "/app/app.js", "/app/admin/", "/app/admin/admin.js"):
        r = await client.get(path)
        assert r.status_code == 200, (path, r.status_code)
        assert r.headers.get("cache-control") == "no-cache", path
        assert r.headers.get("etag"), path
    # the API's own answers keep their own caching
    r = await client.get("/v1/config")
    assert r.headers.get("cache-control") == "public, max-age=60"
    r = await client.get("/v1/nudges")
    assert r.headers.get("cache-control") == "public, max-age=3600"


def test_web_console_translates_every_refusal_in_both_languages():
    source = (CONSOLE / "app.js").read_text(encoding="utf-8")
    tables = re.findall(r"errors: \{(.*?)\},\n", source, flags=re.S)
    assert len(tables) == 2, "one error table for 简体中文, one for English"
    zh, en = tables
    for code in CODES_0_22 + ["allowance_exhausted", "bad_key", "phone_region", "disabled"]:
        assert f"{code}:" in zh, f"{code} has no Chinese sentence"
        assert f"{code}:" in en, f"{code} has no English sentence"
    # a paused allowance (429 with paused: true) is said as paused, not as spent
    assert zh.count("e.paused") == 1 and en.count("e.paused") == 1
    # no exclamation marks in what a person reads
    assert "!" not in re.sub(r"[!=]==?|!\w", "", zh + en) and "！" not in zh
