# nanoMuse Cloud

A small relay that lets someone use nanoMuse without owning an API key. Sign up
with a phone number or an e-mail address, get a starter allowance of tokens, and
the app talks to this server the way it would talk to any OpenAI-compatible
provider. Your own key still works exactly as before — this is the "start now"
path, not a replacement for bring-your-own-key.

It is a single Python process over SQLite. Anyone can run one: the app only needs
its base URL.

## What it does

- **Sign-up by code.** `POST /v1/auth/code` sends a six-digit code to a phone
  (Aliyun SMS) or an e-mail (SMTP). `POST /v1/auth/verify` exchanges it for an
  `nm_…` API key. One phone/e-mail is one account with one starter grant; a
  second device signing in with the same number gets a second key, not a second
  grant.
- **OpenAI-shaped proxy.** `GET /v1/models`, `POST /v1/chat/completions`
  (streaming or not) go to the upstream with the relay's key. `POST
  /v1/images/generations` and `/v1/images/edits` are translated into DashScope's
  native image API, so drawing and re-drawing the avatar works through the
  relay too.
- **Ledger.** Every request is charged from the account's grant using the
  upstream's own `usage` (for streams, from the final usage chunk). Cheaper
  models are charged with a multiplier; pictures cost a flat amount. A daily
  cap and a per-minute limit bound the damage of a leaked key.
- **Privacy by construction.** Phone numbers and e-mail addresses are looked
  up by HMAC-SHA256 hash, shown as a display hint (`138****8000`,
  `so***@example.com`), and kept AES-GCM-encrypted under a key derived from
  `CLOUD_SECRET` so the operator's page can tell accounts apart; the database
  file on its own reveals none of them. Message content is forwarded, never
  written to disk. The database holds: hashed and encrypted identifier, key
  hashes, token counts per request, and video task ids.

Errors carry a stable `code` the app can turn into a sentence:

| status | code | meaning |
|---|---|---|
| 400 | `bad_identifier` | not a phone number or e-mail address |
| 400 | `code_wrong` / `code_expired` | verification code |
| 401 | `bad_key` | unknown or revoked key |
| 402 | `out_of_tokens` | grant used up — top up with the admin endpoint |
| 403 | `account_disabled` | |
| 404 | `model_not_offered` | not on the menu |
| 429 | `code_too_often` / `rate_limited` / `daily_cap` | |
| 502 | `upstream` | the provider failed; message passed through |
| 503 | `upstream_unconfigured` | `UPSTREAM_KEY` missing |

## Run it

Development, no external services — codes are printed to the log:

```bash
cd cloud
pip install -e ".[dev]"
UPSTREAM_KEY=sk-… python -m nanomuse_cloud --port 8787
# in another shell
curl -X POST localhost:8787/v1/auth/code -H 'Content-Type: application/json' -d '{"identifier":"13800138000"}'
# read the code from the server log, then
curl -X POST localhost:8787/v1/auth/verify -H 'Content-Type: application/json' -d '{"identifier":"13800138000","code":"123456","device":"curl"}'
```

Production, on any VPS with Docker:

```bash
cp .env.example .env      # fill in CLOUD_DOMAIN, PUBLIC_BASE, CLOUD_SECRET, CLOUD_ADMIN_TOKEN, UPSTREAM_KEY, sender settings
docker compose up -d      # Caddy fetches the TLS certificate for CLOUD_DOMAIN
curl https://$CLOUD_DOMAIN/healthz
```

Back up `data/cloud.db` together with `CLOUD_SECRET`: the hashes are useless
without the secret, and the secret alone is useless without the database.

Point the app at it: in nanoMuse, *Sign in with e-mail — free* → enter e-mail or phone → code.
The app stores the key in its encrypted preferences and sets up a provider
with `PUBLIC_BASE` as its base URL. Nothing else in the app changes; you can
add your own key next to it at any time.

## Settings

All configuration is environment variables; see [`.env.example`](.env.example)
for the full list. The ones that matter:

| variable | default | |
|---|---|---|
| `UPSTREAM_BASE` / `UPSTREAM_KEY` | Model Studio compatible-mode | where chat goes |
| `DASHSCOPE_BASE` | Model Studio native | where pictures go (same key) |
| `CHAT_DEFAULTS` | `{"enable_thinking": false}` | merged into chat requests for fields the app did not set |
| `SIGNUP_OPEN` | `1` | anyone may sign in; `0` = members only (a private relay) |
| `ALLOWED_IDENTIFIERS` | empty | comma-separated numbers / addresses of the **members**: no daily spend cap |
| `DAILY_CAP_CNY` | 25 | yuan a day per non-member account, at the list prices below; 0 = no cap |
| `DAY_OFFSET_H` | 8 | the day turns at midnight UTC+8 (Beijing) |
| `USD_CNY` | 7.1 | for showing dollars next to yuan; display only |
| `SIGNUP_TOKENS` | 0 (no ceiling) | starter token grant per account, the older allowance |
| `DAILY_CAP_TOKENS` | 0 (off) | tokens per account per day |
| `PER_MINUTE_REQUESTS` | 30 | per account — what stops a runaway loop |
| `CODE_SENDER` | `log` | `log`, `smtp`, `aliyun` or `both` |
| `CLOUD_MODELS` | four Qwen / MiniMax models | JSON list to replace the menu, prices included |
| `HUB_ENABLED` | `true` | the devices hub at `/v1/hub` and the web console at `/app` ([docs/hub.md](../docs/hub.md)) |
| `HUB_FRAME_LIMIT` | 16 MB | largest hub frame (files and screenshots travel inside frames) |

The default menu: `qwen3.8-27b` (recommended; text and images in),
`qwen3.8-flash` (charged at 0.3×), `qwen-image-3.0-pro` for drawing (30 000
tokens per picture) and `MiniMax/MiniMax-H3` for short clips (200 000 tokens
per clip). Any OpenAI-compatible upstream works for chat; the image and video
endpoints assume DashScope. Video is relayed under DashScope's own paths
(`/api/v1/services/aigc/video-generation/video-synthesis`, `/api/v1/tasks/{id}`,
`/api/v1/uploads`), so the app's video code only needs to point its host at
the relay; a task can be polled by the account that created it only.

### Money

Every request is priced in yuan at the provider's Beijing list prices (set per
model: `price_in` / `price_out` per million tokens, `price_image` and
`price_image_2k` per picture, `price_second` per second of video) and stored
in the ledger next to the token count. A non-member account may cost the
operator `DAILY_CAP_CNY` a day (¥25 by default); a picture or a clip that would
go over the cap is refused before it is made, a chat is refused once the day's
spend has reached the cap. Members — the identifiers in `ALLOWED_IDENTIFIERS`,
or any account the operator marks on the admin page — have no cap. `/v1/me`
carries a `spend` block (`today`, `total`, `daily_cap`, `unlimited`, `usd_cny`,
`today_usd`, `daily_cap_usd`, `resets_at`) and each model in `/v1/models`
carries its `nanomuse.price_cny`, so the apps show what a day cost in both
currencies. The day turns at midnight in `DAY_OFFSET_H`; the admin page
shows spend per account and per day in ¥ and $.

`SIGNUP_TOKENS=0` (the default) runs the relay without a token ceiling: usage
is metered and shown, nothing is refused for lack of tokens (`/v1/me` says
`"unlimited": true` and the apps show 「不限」). `DAILY_CAP_TOKENS=0` and
`PER_MINUTE_REQUESTS=0` switch those two checks off in the same way.

### Operator's page

`/app/admin/` asks for `CLOUD_ADMIN_TOKEN` (kept in the tab's sessionStorage)
and shows every account — phone number or address in clear, joined, used in
all and today, last active, live sign-ins, devices with presence — with
grant, disable and delete buttons, plus the last fourteen days of usage. The
identifiers are stored AES-GCM-encrypted with a key derived from
`CLOUD_SECRET`; the page is the only place they are decrypted. A person can
also remove themselves: `POST /v1/auth/delete` with their key deletes the
account, its keys, ledger and devices.

## Operating

```bash
# who signed up (hints only, never the identifiers)
curl -H "X-Admin-Token: $CLOUD_ADMIN_TOKEN" https://$CLOUD_DOMAIN/v1/admin/accounts
# top up someone by phone/e-mail or by account id
curl -H "X-Admin-Token: $CLOUD_ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"identifier":"13800138000","tokens":500000}' https://$CLOUD_DOMAIN/v1/admin/grant
# switch an abusive account off
curl -H "X-Admin-Token: $CLOUD_ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"identifier":"13800138000","disabled":true}' https://$CLOUD_DOMAIN/v1/admin/disable
```

Every response carries `X-Nanomuse-Charged` and `X-Nanomuse-Request` so a user
report can be matched to a ledger row without any content being logged.

### Sending codes

- **E-mail** (`CODE_SENDER=smtp`): any SMTP account; port 465 uses implicit
  TLS, anything else STARTTLS.
- **Mainland phones** (`CODE_SENDER=aliyun`): an Aliyun account with SMS
  enabled, an approved signature (`ALIYUN_SMS_SIGN`) and a template
  (`ALIYUN_SMS_TEMPLATE`) whose only variable is `${code}`. Signature and
  template review is Aliyun's process and takes a working day or two.
- `both` routes by identifier type. Non-mainland numbers are accepted as
  identifiers but the Aliyun sender only covers `+86`; use e-mail for the rest
  or plug in another sender in `senders.py`.

## Tests

```bash
cd cloud && pip install -e ".[dev]" && pytest
```

The suite runs the whole app in-process against a fake upstream: sign-up and
throttling, model listing, charged chat (non-stream and stream), running out of
tokens and topping up, key revocation, and the image translation.
