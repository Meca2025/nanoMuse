# nanoMuse Cloud

The "start now" path: sign up with a phone number or an e-mail address, get a
starter allowance of tokens, and use nanoMuse without an API key of your own.
Bringing your own key still works exactly as before — this is one more
provider, not a replacement.

## In the app

On the first screen, *Start now* asks for a phone number or e-mail address and
sends a six-digit code. After the code the app has:

- a provider called **nanoMuse Cloud** under *Settings → Providers*, an
  ordinary OpenAI-compatible provider whose key is the token the relay issued;
- a model group with the recommended chat model, set as the default if you had
  none;
- the relay's picture model as the avatar's image model, if none was set.

*Settings → nanoMuse Cloud* shows who is signed in (a masked hint, never the
number), how much of the allowance is left, today's use against the daily cap,
and *Sign out*, which revokes this phone's key at the relay and removes the
provider. The allowance belongs to the phone number or address: signing in
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

| | default |
|---|---|
| starter grant | 1 000 000 tokens per phone number / address |
| daily cap | 300 000 tokens per rolling 24 h |
| rate | 30 requests per minute |
| chat | charged from the upstream's own usage; `qwen3.8-flash` at 0.3× |
| a picture | 30 000 tokens |
| a clip | 200 000 tokens (`MiniMax/MiniMax-H3`, relayed through DashScope's video API) |

These are the relay's defaults; an operator may set others. When the grant is
used up the app says so (`out_of_tokens`); switch to your own key, or ask for a
top-up. A relay run for a few invited people may have no ceiling at all
(`SIGNUP_TOKENS=0`): the account page then shows 「不限」 and what was used,
and nothing is refused for lack of tokens.

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

A relay for one person, or a few: `ALLOWED_IDENTIFIERS=139…, me@example.com`
lets only those numbers and addresses sign in; everyone else gets
`not_invited` before any code is sent. The trial deployments run this way.

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
