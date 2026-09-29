# nanoMuse Cloud

The "start now" path: sign up with a phone number or an e-mail address, get a
starter allowance of tokens, and use nanoMuse without an API key of your own.
Bringing your own key still works exactly as before — this is one more
provider, not a replacement.

## In the app

On the first screen, *Sign in with e-mail — free* asks for an e-mail address (or a
phone number) and sends a six-digit code. After the code the app has:

- a provider called **nanoMuse Cloud** under *Settings → Providers*, an
  ordinary OpenAI-compatible provider whose key is the token the relay issued;
- a model group with the recommended chat model, set as the default if you had
  none;
- the relay's picture model as the avatar's image model, if none was set.

*Settings → nanoMuse Cloud* shows who is signed in (a masked hint, never the
number), today's spend against the daily allowance in ¥ and $, the tokens
used, and *Sign out*, which revokes this phone's key at the relay and removes
the provider. The allowance belongs to the phone number or address: signing in
again, on this phone or another, gives a new key for the same account and does
not grant a second allowance.

Signing in a second provider next to it — your own Model Studio key, DeepSeek,
a local server — works as always; the relay's models can be mixed with yours
in a model group.

## What the relay keeps

The relay is the code in [`cloud/`](../cloud/README.md). It stores:

- a salted hash (HMAC-SHA256) of the phone number or e-mail address, a
  masked hint such as `138****8000` or `so***@example.com`, and the number
  or address itself encrypted (AES-GCM, key derived from the relay's secret)
  so the operator can see who an account belongs to on the admin page — the
  database file alone shows nothing;
- the hash of each key issued, with the device name you signed in from;
- per request: the model, the token counts and the amount charged;
- the id of each video task, so only the account that started one can poll it.

It does not store message content, images or tool results; they are forwarded
to the upstream model (Alibaba Cloud Model Studio) and the reply is streamed
back. Every response carries an `X-Nanomuse-Request` id so a problem report
can be matched to a ledger row without any content being logged. Deleting the
account (`POST /v1/auth/delete` with the account's key) removes all of it. See
[privacy.md](privacy.md).

## Allowance

nanoMuse is a community project and charges nothing. The public relay at
`cloud.nanomuse.cn` is paid for by the developer, so it has a daily cap:

| | `cloud.nanomuse.cn` |
|---|---|
| sign-up | open to anyone with an e-mail address or a mainland mobile number |
| daily allowance | **¥25 a day** per account (about $3.5), across chat, pictures and clips |
| the day turns | midnight Beijing time (UTC+8) |
| members | the developer and the people they list have no cap |
| rate | 30 requests per minute |
| tokens | no ceiling; usage is metered and shown |

Spend is counted at the model provider's list prices (Alibaba Cloud Model
Studio, Beijing region, September 2026): `qwen3.8-27b` ¥3 in / ¥12 out per
million tokens, `qwen3.8-flash` ¥0.8 / ¥2.7, `qwen-image-3.0-pro` ¥0.25 a
picture (¥0.5 at 2k), `MiniMax/MiniMax-H3` about ¥0.5 a second of video. A
typical day of chatting costs a few fen; ¥25 is roughly two million tokens of
the 27B model, a hundred pictures or fifty seconds of video.

*Settings → nanoMuse Cloud* shows today's spend against the cap in ¥ and $, and
the total so far. When the day's allowance is used up the app says so
(`daily_cap`); switch to your own key under *Settings → Providers* to keep
going right away, or wait for midnight. Other relays may set other rules
(`DAILY_CAP_CNY`, `SIGNUP_OPEN`, `ALLOWED_IDENTIFIERS`; see
[`cloud/README.md`](../cloud/README.md)).

## Running your own

Anyone can run a relay — for a family, a class, a company — and point the app
at it. The server is a single Python process over SQLite; a VPS with Docker and
a domain name is enough:

```bash
cd cloud
cp .env.example .env    # domain, secrets, upstream key, how codes are sent
docker compose up -d    # Caddy fetches the TLS certificate
```

[`cloud/README.md`](../cloud/README.md) has the settings, the sender options
(SMTP for e-mail, Aliyun SMS for mainland phones), the admin endpoints for
topping up, and the test suite.

A relay for one person, or a few: `SIGNUP_OPEN=0` with
`ALLOWED_IDENTIFIERS=139…, me@example.com` lets only those numbers and
addresses sign in; everyone else gets `not_invited` before any code is sent.
The trial deployments ran this way. With sign-up open, the same list names
the members who have no daily cap; the admin page can add more.

The relay is also the meeting point for the account's devices — the **hub** at
`/v1/hub` and the web console at `/app`; see [hub.md](hub.md). `HUB_ENABLED`
turns it off, `HUB_FRAME_LIMIT` caps one frame (files and screenshots travel
inside frames, 16 MB by default).

The Android app talks to `https://cloud.nanomuse.cn` by default. A debug build
shows a *Relay* field on the sign-in screen for pointing at another one (on the
emulator, the host machine is `http://10.0.2.2:8787`). Making the relay address
a user-facing setting in release builds is on the roadmap.

## Protocol

The app uses four calls, all JSON:

```
POST /v1/auth/code       {identifier}                → 204
POST /v1/auth/verify     {identifier, code, device}  → {api_key, base_url, account, tokens, models}
GET  /v1/me              Bearer nm_…                 → {account, tokens, models, recent}
POST /v1/auth/sign-out   Bearer nm_…                 → 204
```

Everything else is the OpenAI API: `GET /v1/models` (with `architecture`
modalities so the picture model is recognisable), `POST /v1/chat/completions`
with streaming, `POST /v1/images/generations` and `/v1/images/edits`. Errors
are `{"error": {"message", "type": "nanomuse_cloud", "code"}}` with a stable
`code` the app turns into a sentence.

Devices: `GET /v1/devices` lists the account's devices (online or last seen),
`DELETE /v1/devices/{id}` forgets an offline one, and `WS /v1/hub` is the hub
itself — the frames are in [hub.md](hub.md).
