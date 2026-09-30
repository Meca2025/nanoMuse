"""Sign-in with the phone's own number: the page's tokens, the carrier's word, the app's claim."""

from __future__ import annotations

import json
import urllib.parse

import httpx
import pytest
from test_accounts import auth, make

from nanomuse_cloud import onetap as onetap_mod
from nanomuse_cloud.onetap import new_verifier, state_of
from nanomuse_cloud.service import CloudError

MOBILE = "13900001111"


class FakeAliyun:
    """dypnsapi as the relay sees it: GetAuthToken and GetPhoneWithToken, every query kept."""

    def __init__(self, mobile: str = MOBILE, phone_code: str = "OK") -> None:
        self.mobile, self.phone_code = mobile, phone_code
        self.calls: list[dict[str, str]] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        q = dict(urllib.parse.parse_qsl(request.url.query.decode()))
        self.calls.append(q)
        assert request.url.host == "dypnsapi.aliyuncs.com"
        assert q["SignatureMethod"] == "HMAC-SHA1" and q["Signature"] and q["Version"] == "2017-05-25"
        if q["Action"] == "GetAuthToken":
            return httpx.Response(200, json={"Code": "OK", "TokenInfo": {"AccessToken": "acc-" + q["SceneCode"], "JwtToken": "jwt-1"}})
        if q["Action"] == "GetPhoneWithToken":
            if self.phone_code != "OK":
                return httpx.Response(200, json={"Code": self.phone_code, "Message": "no"})
            if q["SpToken"] == "sp-good":
                return httpx.Response(200, json={"Code": "OK", "Data": {"Mobile": self.mobile}})
            return httpx.Response(200, json={"Code": "SpTokenInvalid", "Message": "token used or expired"})
        return httpx.Response(400, json={"Code": "InvalidAction"})

    def client(self) -> httpx.Client:
        return httpx.Client(transport=httpx.MockTransport(self.handler))


def make_onetap(**overrides):
    app, client, sender, up, cloud, settings = make(
        aliyun_access_key_id="LTAI-test",
        aliyun_access_key_secret="secret",
        onetap_scheme="FC100001",
        public_base="https://cloud.test",
        **overrides,
    )
    fake = FakeAliyun()
    app.state.onetap.http = fake.client()
    return app, client, cloud, fake


async def test_off_by_default_and_the_apps_can_tell():
    app, client, *_ = make()
    r = await client.get("/v1/auth/onetap")
    assert r.json() == {"enabled": False, "sdk_url": ""}
    r = await client.post("/v1/auth/onetap/token", json={})
    assert r.status_code == 404 and r.json()["error"]["code"] == "onetap_off"
    r = await client.post("/v1/auth/onetap/verify", json={"state": "0" * 64, "sp_token": "x"})
    assert r.status_code == 404


async def test_the_whole_way_in_and_the_claim_is_single_use():
    app, client, cloud, fake = make_onetap()
    r = await client.get("/v1/auth/onetap")
    assert r.json()["enabled"] is True and r.json()["sdk_url"].endswith("numberAuth-web-sdk.js")

    # 1. the page asks for the SDK's tokens: one GetAuthToken, bound to the scheme and PUBLIC_BASE
    r = await client.post("/v1/auth/onetap/token", json={})
    assert r.status_code == 200, r.text
    tok = r.json()
    assert tok["access_token"] == "acc-FC100001" and tok["jwt_token"] == "jwt-1" and tok["sdk_url"]
    q = fake.calls[-1]
    assert q["Action"] == "GetAuthToken" and q["Url"] == "https://cloud.test/" and q["Origin"] == "https://cloud.test"
    assert q["SceneCode"] == "FC100001" and q["BizType"] == "1"
    # asked again within the reuse window: the same tokens, no second call to Aliyun
    r = await client.post("/v1/auth/onetap/token", json={})
    assert r.json()["access_token"] == "acc-FC100001" and sum(c["Action"] == "GetAuthToken" for c in fake.calls) == 1

    # 2. the carrier's token comes back through the page; the number signs in; the page sees the hint only
    verifier = new_verifier()
    state = state_of(verifier)
    r = await client.post("/v1/auth/onetap/verify", json={"state": state, "sp_token": "sp-good", "device": "Xiaomi"})
    assert r.status_code == 200, r.text
    assert r.json() == {"ok": True, "hint": "139****1111", "created": True}
    assert "api_key" not in r.text
    assert fake.calls[-1]["Action"] == "GetPhoneWithToken" and fake.calls[-1]["SpToken"] == "sp-good"

    # 3. the app claims with the verifier — once
    r = await client.post("/v1/auth/onetap/claim", json={"verifier": verifier})
    assert r.status_code == 200, r.text
    reply = r.json()
    assert reply["api_key"].startswith("nm-") or reply["api_key"]
    assert reply["created"] is True and reply["account"]["hint"] == "139****1111"
    assert reply["account"]["signed_in_via"] == "onetap"
    r = await client.post("/v1/auth/onetap/claim", json={"verifier": verifier})
    assert r.status_code == 404 and r.json()["error"]["code"] == "not_ready"

    # the key works like any other, and the account's timeline says how it came in
    me = await client.get("/v1/me", headers=auth(reply["api_key"]))
    assert me.status_code == 200
    ev = await client.get("/v1/me/events", headers=auth(reply["api_key"]))
    kinds = [e["kind"] for e in ev.json()["events"]]
    assert "sign_in.onetap" in kinds and "account.created" in kinds

    # the same number again is the same account, a second device, not a second grant
    verifier2 = new_verifier()
    r = await client.post("/v1/auth/onetap/verify", json={"state": state_of(verifier2), "sp_token": "sp-good", "device": "tablet"})
    assert r.json()["created"] is False
    r = await client.post("/v1/auth/onetap/claim", json={"verifier": verifier2})
    assert r.json()["created"] is False and r.json()["account"]["id"] == reply["account"]["id"]


async def test_a_bad_or_used_carrier_token_and_a_wrong_state_are_refused():
    app, client, cloud, fake = make_onetap()
    verifier = new_verifier()
    r = await client.post("/v1/auth/onetap/verify", json={"state": state_of(verifier), "sp_token": "sp-used"})
    assert r.status_code == 502 and r.json()["error"]["code"] == "onetap_failed"
    assert r.json()["error"].get("aliyun") == "SpTokenInvalid" or "SpTokenInvalid" in r.text
    r = await client.post("/v1/auth/onetap/claim", json={"verifier": verifier})
    assert r.status_code == 404
    r = await client.post("/v1/auth/onetap/verify", json={"state": "not-a-hash", "sp_token": "sp-good"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "bad_state"
    r = await client.post("/v1/auth/onetap/verify", json={"state": "a" * 64, "sp_token": ""})
    assert r.status_code == 400 and r.json()["error"]["code"] == "bad_token"
    # the carrier answering with something that is not a mainland number
    fake.mobile = "not a number"
    r = await client.post("/v1/auth/onetap/verify", json={"state": "b" * 64, "sp_token": "sp-good"})
    assert r.status_code == 502 and r.json()["error"]["code"] == "onetap_failed"


async def test_token_requests_are_counted_per_network(monkeypatch):
    app, client, cloud, fake = make_onetap(onetap_per_ip_hour=2)
    for _ in range(2):
        assert (await client.post("/v1/auth/onetap/token", json={}, headers={"x-forwarded-for": "203.0.113.9"})).status_code == 200
    r = await client.post("/v1/auth/onetap/token", json={}, headers={"x-forwarded-for": "203.0.113.9"})
    assert r.status_code == 429 and r.json()["error"]["code"] == "onetap_too_often"
    # another network is not affected
    assert (await client.post("/v1/auth/onetap/token", json={}, headers={"x-forwarded-for": "203.0.113.10"})).status_code == 200


def test_grants_expire_and_aliyun_being_down_is_a_502(monkeypatch):
    app, client, cloud, fake = make_onetap()
    ot = app.state.onetap
    verifier = new_verifier()
    ot.verify(state_of(verifier), "sp-good", "phone")
    later = onetap_mod.time.monotonic() + onetap_mod.GRANT_TTL_S + 1
    monkeypatch.setattr(onetap_mod.time, "monotonic", lambda: later)
    with pytest.raises(CloudError) as ei:
        ot.claim(verifier)
    assert ei.value.code == "not_ready"

    def down(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("down")

    ot.http = httpx.Client(transport=httpx.MockTransport(down))
    ot._token = None
    with pytest.raises(CloudError) as ei:
        ot.token("")
    assert ei.value.status == 502 and ei.value.code == "onetap_unavailable"


def test_the_events_the_operator_counts_include_one_tap_sign_ins():
    app, client, cloud, fake = make_onetap()
    ot = app.state.onetap
    ot.verify(state_of(new_verifier()), "sp-good", "phone")
    ov = cloud.admin_overview()
    assert ov["signals_today"]["sign_ins"] == 1
    assert json.dumps(ov)  # serialisable
