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
  models are charged with a multiplier; pictures cost a flat amount. One
  lifetime allowance per account and a per-minute limit bound the damage of a
  leaked key.
- **Privacy by construction.** Phone numbers and e-mail addresses are looked
  up by HMAC-SHA256 hash, shown as a display hint (`138****8000`,
  `so***@example.com`), and kept AES-GCM-encrypted under a key derived from
  `CLOUD_SECRET` so the operator's page can tell accounts apart; the database
  file on its own reveals none of them. Message content is forwarded, never
  written to disk. The database holds: hashed and encrypted identifier, key
  hashes, token counts per request, video task ids, and the profile below.
- **One look on every device.** `GET` / `PUT` / `DELETE /v1/me/profile` keep
  the agent's name and face for the account — the dragon, an emoji on a colour,
  or a face drawn in the avatar studio with its five small stills (WebP, 200 KB
  each at most) — last writer wins, with a `rev` that grows on every write.
  Devices on the hub hear `{"type": "profile", "rev", "device"}` and fetch it;
  `?face=false` leaves the pictures out. Never a key or a message.

Errors carry a stable `code` the app can turn into a sentence:

| status | code | meaning |
|---|---|---|
| 400 | `bad_identifier` | not a phone number or e-mail address |
| 400 | `phone_region` | a number the SMS sender cannot reach (号码认证 sends to mainland China only); e-mail works everywhere |
| 400 | `code_wrong` / `code_expired` | verification code |
| 401 | `bad_key` | unknown or revoked key |
| 402 | `out_of_tokens` | grant used up — top up with the admin endpoint |
| 403 | `account_disabled` | |
| 404 | `model_not_offered` | not on the menu |
| 429 | `allowance_exhausted` | the account's pool is spent; the body also carries `left`, `grant`, `invite_url`, `invite_bonus_cny`, `own_key_docs` |
| 429 | `code_too_often` / `rate_limited` / `daily_cap` | (`daily_cap` only with the legacy token cap on) |
| 429 | `provider_busy` | the image provider answered 429 even after the relay queued and retried (`IMAGE_CONCURRENCY`, `IMAGE_RETRIES`); `retry_after` seconds in the body |
| 400 | `content_rejected` | the provider's content check declined the words (a chat request or an image prompt); the provider's own line rides along under `upstream` |
| 400 | `upstream_400` | any other refusal of the request itself; the provider's message passed through |
| 502 | `upstream` / `upstream_auth` / `upstream_model` / `upstream_busy` / `upstream_<status>` | the provider failed; a plain sentence, the provider's line under `upstream` |
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

Point the app at it: in nanoMuse, *Sign in — free* → enter a phone number or an e-mail → code.
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
| `IMAGE_CONCURRENCY` / `IMAGE_RETRIES` | 2 / 4 | pictures drawn at once for everyone together (the provider allows an account only a couple), and how often a 429 or 5xx is retried with growing pauses before `429 provider_busy` |
| `CHAT_DEFAULTS` | `{"enable_thinking": false}` | merged into chat requests for fields the app did not set |
| `SIGNUP_OPEN` | `1` | anyone may sign in; `0` = members only (a private relay) |
| `ALLOWED_IDENTIFIERS` | empty | comma-separated numbers / addresses of the **members**: no spend limit |
| `ALLOWANCE_CNY` | 10 | yuan per non-member account **for its lifetime**, at the list prices below; 0 = no limit |
| `INVITE_BONUS_CNY` | 5 | added to **both** pools — the inviter's and the newcomer's — per new person who signs up with the code |
| `IMPROVE_DEFAULT` | `0` | what *Help improve nanoMuse's AI models* (Data controls) starts as for accounts created from now on: `1` = on until the person turns it off, `0` = off until they turn it on; existing accounts keep their setting. State it in your privacy policy |
| `PRIVACY_URL` | `https://nanomuse.cn/privacy/` | the policy the apps link from Data controls and the sign-in pages — the one that says what this relay keeps and its default |
| `INVITE_URL` | `https://nanomuse.cn/web/?invite=` | the link the apps offer to share; the code is appended |
| `OWN_KEY_DOCS` | `https://nanomuse.cn/own-key` | the guide the apps open for bringing one's own key |
| `DAY_OFFSET_H` | 8 | the operator's reports group by local day, midnight UTC+8 (Beijing) |
| `TRAFFIC_DB` | empty | the site's daily traffic counts (`demo/showcase/mirror/traffic.py`), mounted read-only, for the operator's page; empty = that panel says it is not connected |
| `WEB_INFO_URL` | empty | nanoMuse Web's gateway (`http://gateway:8000/api/web/info` on the same docker network) for its account and session counts on the operator's page |
| `WEB_ADMIN_URL`, `WEB_ADMIN_TOKEN` | empty | the showcase gateway's `/api/demo/admin` and its `SHOWCASE_ADMIN_TOKEN`: who tried the phone in the browser from where and with what, every demo and what it used — a panel on the operator's page and a section in the account drawer (relay 0.10) |
| `USD_CNY` | 7.1 | for showing dollars next to yuan; display only |
| `SIGNUP_TOKENS` | 0 (no ceiling) | starter token grant per account, the older allowance |
| `DAILY_CAP_TOKENS` | 0 (off) | tokens per account per day |
| `PER_MINUTE_REQUESTS` | 30 | per account — what stops a runaway loop |
| `CODE_SENDER` | `log` | `log`, `smtp`, `aliyun` or `both` (SMS for phones, mail for addresses) |
| `ALIYUN_SMS_API` | `dypns` | `dypns` (号码认证服务 `SendSmsVerifyCode`) or `dysms` (短信服务 `SendSms`) |
| `CLOUD_MODELS` | Qwen chat + image, Wan video | JSON list to replace the menu, prices included |
| `CLOUD_ANY_MODEL_MEMBERS` | `1` | members may name any model of the provider's for its kind (chat, image, video) — see below; `0` = the menu only |
| `CLOUD_CATALOG` | `1` | list the usable models under the operator's key after the menu in a member's `/v1/models`, read from the provider's own `/models` (0.10) — see below; `0` = the menu only, a member types an id |
| `CLOUD_CATALOG_TTL_S` | `3600` | how long that list is kept before the provider is asked again |
| `CLOUD_CATALOG_PROBE` | `1` | ask each chat model on that list, once, whether it answers and whether it reads a picture (0.11) — see below; `0` = go by the names |
| `CLOUD_CATALOG_PROBE_TTL_S` | 7 days | how long a model's answers stand before it is asked again |
| `CLOUD_GEOIP` | `1` | name where an address is on the operator's page — country, province, city — from ip2region's offline database, fetched once into the data directory (0.11); `0` = addresses only |
| `CLOUD_GEOIP_DB`, `CLOUD_GEOIP_URL`, `CLOUD_GEOIP_V6_URL` | next to the database; the project's `ip2region_v4.xdb`; empty | the file, where to fetch it, and the IPv6 file (37 MB) for a relay reached over IPv6 |
| `HUB_ENABLED` | `true` | the devices hub at `/v1/hub` and the web console at `/app` ([docs/hub.md](../docs/hub.md)) |
| `HUB_FRAME_LIMIT` | 16 MB | largest hub frame (files and screenshots travel inside frames) |

The default menu: `qwen3.8-27b` (recommended; text and images in),
`qwen3.8-flash` (charged at 0.3×), `qwen-image-3.0` for drawing (¥0.18 a
picture, 30 000 tokens) and `wan2.2-i2v-flash` for short clips (¥0.10 a second
at 480P, five seconds, 200 000 tokens per clip; `wan2.2-t2v-plus` when a clip
starts from words). Until 0.4 the menu had `qwen-image-3.0-pro` (¥0.25 / ¥0.5)
and `MiniMax/MiniMax-H3` (¥0.5 a second): a new face with its four clips cost
about ¥9; it is about ¥3 now. Any OpenAI-compatible upstream works for chat; the image and video
endpoints assume DashScope. Video is relayed under DashScope's own paths
(`/api/v1/services/aigc/video-generation/video-synthesis`, `/api/v1/tasks/{id}`,
`/api/v1/uploads`), so the app's video code only needs to point its host at
the relay; a task can be polled by the account that created it only.

### Money

Every request is priced in yuan at the provider's Beijing list prices (set per
model: `price_in` / `price_out` per million tokens, `price_image` and
`price_image_2k` per picture, `price_second` per second of video) and stored
in the ledger next to the token count. A non-member account has one pool for
its lifetime — `ALLOWANCE_CNY` (¥10 by default), grown by invites (both
sides) and the operator's credit; a picture or a clip that would go
over it is refused before it is made, a chat once the pool is spent. Clips are
not counted apart: a clip is just the dearest line on the same allowance.
Members — the identifiers in `ALLOWED_IDENTIFIERS`, or any account the
operator marks on the admin page — have no limit, and (with
`CLOUD_ANY_MODEL_MEMBERS=1`, the default) may name **any model the provider has
under the operator's key**, not only the menu's: the id goes upstream as typed,
as long as it is used for what it is — a chat model at `/v1/chat/completions`,
an image model at `/v1/images/*`, a video model under the video paths; never
across. Pictures and clips travel through the provider's qwen-image / Wan-shaped
APIs, so a model of another family gets the provider's answer. `/v1/models`
says `nanomuse.any_model` for the account, `/v1/me` the same under `account`,
and `GET /v1/models/<id>?kind=chat` checks a typed id (the answer's `listed` is
false and `priced_as` names the menu model whose prices stand in for it in the
ledger — the dearest of its kind, so the operator's page errs high). It is how
a member tries a model before it goes on the menu. From 0.10 a member does not
have to know the id: with `CLOUD_CATALOG=1` (the default) the relay reads the
provider's own `/models` under the operator's key (once an hour,
`CLOUD_CATALOG_TTL_S`), sorts the ids by their shape into chat and picture
models — the spoken, heard, embedding and rerank ones are left out, and a
video model is not on the compatible list (`catalog.py`) — and lists them in
the member's `/v1/models` after the menu, each with `catalog: true`, `listed:
false`, `priced_as` and `vision` (whether the chat model reads pictures); the
answer's `nanomuse.catalog` says how many and the provider's error if the list
could not be refreshed (the last one stands). The apps' pickers then show the
menu and *More models on your account* as two groups, and a guest sees the
menu alone. Names are a guess, and a wrong guess costs a person a feature —
DeepSeek V4 on Model Studio reads pictures, nothing in its name says so, and
an id the provider has retired still appears on `/models` — so from 0.11 the
relay checks (`CLOUD_CATALOG_PROBE=1`): after the list is read, each chat
model is asked, in the background and three at a time, to reply with one
word and then to name the colour of a small magenta square; a model the provider
refuses is left off the list, `vision` is what the model answered, and
`verified: true` marks an entry the probes have confirmed (the name's guess
stands while a probe is pending). The answers are kept in the database
(`model_probes`) for `CLOUD_CATALOG_PROBE_TTL_S`, a week by default, so a
restart asks nothing again; `/v1/admin/catalog` shows the whole of it — which
models answer, which see, which were refused and with what words — and the
operator's page has a *Model catalog* panel. The relay also reads what a
request says about reasoning before it applies `CHAT_DEFAULTS`: an app that
sends `reasoning_effort` (or `thinking`, `thinking_budget`) asked for
thinking, and the shipped `enable_thinking: false` would make Model Studio
refuse the pair, so the default follows the request. `/v1/me` carries a `spend`
block (`total`, `grant`, `left`, `unlimited`, `warn` at 80 %, `usd_cny`,
`total_usd`, `grant_usd`, `left_usd`, `today`, the bonus amounts and
`own_key_docs`; the 0.4 names `daily_cap` / `left_today` / `resets_at` = 0
for one more version) and each model in `/v1/models` carries its
`nanomuse.price_cny`, so the apps show what was spent in both currencies. The
refusal, `429 allowance_exhausted`, says what is left and where the two ways
on lead (invite a friend, one's own key) — sign-in and the hub are never
gated, only the model routes. The admin page shows spend per account and per
day (`DAY_OFFSET_H`) in ¥ and $.

`SIGNUP_TOKENS=0` (the default) runs the relay without a token ceiling: usage
is metered and shown, nothing is refused for lack of tokens (`/v1/me` says
`"unlimited": true` and the apps show 「不限」). `DAILY_CAP_TOKENS=0` and
`PER_MINUTE_REQUESTS=0` switch those two checks off in the same way.

### Operator's page

`/app/admin/` asks for `CLOUD_ADMIN_TOKEN` (kept in the tab's sessionStorage)
and is the dashboard from `/v1/admin/overview`: how many accounts (with a
password, members, disabled), who was active today and over the period,
what it cost today / this week / over 7, 30 or 90 days split by kind (chat,
pictures, video) and by model, spend by day as stacked bars, the top
spenders, today's signals (sign-ins, failures, budget refusals, upstream
errors) and the timeline across accounts with a kind filter. The
accounts table shows the masked hint; opening one account
(`/v1/admin/accounts/{id}`) decrypts its phone number or address for that
view only and shows its spend by kind / model / day, sign-ins (device names,
revoked ones too), remembered devices with presence, every request and its
whole timeline — page by page to the first line
(`/v1/admin/accounts/{id}/ledger` and `/events`, `?before=&limit=`) — with
the grant / member / disable / delete buttons. From relay 0.10 the relay
records the network address and the client (`User-Agent`) with each sign-in,
request, event and device, and the account's first / last address and last
client: the accounts table has a *Client / IP* column, the drawer an
*Addresses / IP* section (how often, first, last, platforms) and the address
on every row, and an address opens the accounts seen from it
(`/v1/admin/address?ip=`). The text of a chat is on the page only for
accounts with *Help improve nanoMuse's AI models* on, and only the training
view of it (below); every account that kept turns is in the *By account*
table of the Data controls panel, and its conversations are read in full in
the drawer — each turn expands to every message and tool call — with an
export of that account's turns (`/v1/admin/samples/export?account_id=`).
Identifiers are kept AES-GCM-encrypted with a key derived from
`CLOUD_SECRET`. A person can also remove themselves: `POST /v1/auth/delete`
with their key deletes the account, its keys, ledger and devices.

Two more panels come from `/v1/admin/series` and `/v1/admin/traffic`: the
relay's own numbers by day (sign-ins, new and active accounts, sign-ups
through an invite, data switches turned on, calls, refusals, upstream errors),
the remembered devices by kind and system, the invite funnel and — with
`WEB_INFO_URL` — how many nanoMuse Web accounts and sessions the gateway
holds; and, with `TRAFFIC_DB`, the project site's visits and downloads:
page views, visitors, crawlers, downloads per file from the mirror next to
GitHub's own download counts, stars, referring sites, the pages. The traffic
database is written by `demo/showcase/mirror/traffic.py` from Caddy's access
log — daily counts only; the script never stores an address. A fourth panel,
*The phone in the browser*, comes from the showcase gateway through
`/v1/admin/demo` (`WEB_ADMIN_URL` + `WEB_ADMIN_TOKEN`): every visitor who
signed in there with the address and browser of the first and the latest
visit, the demos running now and the period's demos — when, how long, from
where, with what, what each used (requests, tokens, pictures, clips) and why it
ended — and the same for one account in its drawer (the visitor id there is
the account id here).

From 0.11 every address on the page is named: country, province and city
from ip2region's offline database ([lionsoul2014/ip2region](https://github.com/lionsoul2014/ip2region),
Apache-2.0; city level in China, country and state elsewhere), which the
relay fetches once after start into its data directory (`CLOUD_GEOIP_DB`,
`ip2region_v4.xdb`, 11 MB) and reads in memory — no third party is ever asked
about a visitor. Every admin answer that carries addresses adds `places`
(`{ip: {country, code, province, city, isp, text}}`), the address drawer
says where the address is, and a *Where from* panel (`/v1/admin/places?days=`)
counts accounts (by their latest address), new accounts, sign-ins, requests
and the showcase's visitors by country and province; the `geo` block in
`/v1/admin/overview` says whether the file is there, still being fetched, or
failed (the panel then says so and the page works without places).
`CLOUD_GEOIP=0` switches it off. It is where the network exit is — a phone on
mobile data or a proxy shows up elsewhere — so the page says "guessed".

### Web console

`/app/` is the person's own page in the same design as the phone app: sign in
with a code or a password, the devices of the account with their Muses to
talk to, and an account sheet (`/v1/me`) with the allowance, usage by kind
and by model, the sign-ins with a way to revoke each, the recent activity,
set / change / remove the password, sign out here or everywhere.

### Invitations and the one pool (0.5, both sides since 0.9)

Every account has an eight-letter invite code (`GET /v1/me/invite`: the code,
the share link `INVITE_URL` + code, who came, what they brought). A new person
who signs up with it — `invite` in `POST /v1/auth/verify`; the web app and the
console pick it up from `?invite=…` — adds `INVITE_BONUS_CNY` to the inviter's
pool **and the same to their own** (ledger `from: invite` / `from: invited`);
the second sign-in of the same person, one's own code and an unknown code add
nothing (and are not errors). Until 0.9 joining the co-creation programme
added ¥10 once (`contribute_bonus_at` remembers who took it); that bonus is
gone, and the data switch earns nothing either way.
`GET /v1/estimate?images=5&clips=4` says what a job would cost
next to what is left, so the app can ask before a new face is made. The
operator credits an account — a merged pull request, a good bug report — with
`POST /v1/admin/credit {identifier | account_id, cny, note?}` (or the *Add
credit* button on the admin page). A database from 0.4 is moved over on the
first start: every account's pool becomes what it had spent plus the
allowance plus any unused 0.4 credit, so nobody starts in debt.

### Data controls (0.9)

*Help improve nanoMuse's AI models* is one switch per account, under Settings →
Data controls on every app and on the console's account sheet
(`/v1/me.contribute`, `POST /v1/me/contribute {on}`). With it on, each chat turn
through the relay is kept in `samples` — **the training view only**: what the
person wrote, what the model answered and the tool calls it chose, plus the
model id, token counts and the app and language headers. Never the system
prompt (the person's memory, SOUL and instructions), never what a tool
returned (their files, their screen, what another app showed), never a
picture, a clip or a voice note (a marker stands where one was), and never
next to who they are: a sample carries the account id only and the export
(`GET /v1/admin/samples/export`, JSON lines) leaves even that out. The person
sees the count, turns the switch off at any time (nothing more is kept; what
was kept stays counted so they know there is something to delete) and deletes
what was kept with `DELETE /v1/me/samples`; deleting the account deletes them
too. `IMPROVE_DEFAULT` is what an account **created from now on** starts with —
`0` (the code's default) off until the person turns it on, `1` on until they
turn it off; an account from before keeps its own setting, and a default-on
account's timeline says `contribute.default` rather than `contribute.on`, so
the operator can tell a choice from a default. Say the default in the privacy
policy you link as `PRIVACY_URL`; the apps show it next to the switch. The
operator's page has a *Data controls* panel from `GET /v1/admin/data`: how many
accounts have the switch on (and how many ever turned it off), turns kept by
day, model and app, switches turned on / default-on / off / deleted by day,
tokens, the newest turns, and the export.

## Operating

```bash
# who signed up (hints only, never the identifiers)
curl -H "X-Admin-Token: $CLOUD_ADMIN_TOKEN" https://$CLOUD_DOMAIN/v1/admin/accounts
# top up someone by phone/e-mail or by account id
curl -H "X-Admin-Token: $CLOUD_ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"identifier":"13800138000","tokens":500000}' https://$CLOUD_DOMAIN/v1/admin/grant
# thank a contributor: ¥10 more in their pool
curl -H "X-Admin-Token: $CLOUD_ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"identifier":"dev@example.com","cny":10,"note":"PR #12"}' https://$CLOUD_DOMAIN/v1/admin/credit
# switch an abusive account off
curl -H "X-Admin-Token: $CLOUD_ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"identifier":"13800138000","disabled":true}' https://$CLOUD_DOMAIN/v1/admin/disable
```

Every response carries `X-Nanomuse-Charged` and `X-Nanomuse-Request` so a user
report can be matched to a ledger row without any content being logged.

### Sending codes

- **E-mail** (`CODE_SENDER=smtp`): any SMTP account; port 465 uses implicit
  TLS, anything else STARTTLS.
- **Mainland phones** (`CODE_SENDER=aliyun`): an Aliyun RAM user with
  `ALIYUN_ACCESS_KEY_ID/SECRET`, a signature (`ALIYUN_SMS_SIGN`) and a template
  (`ALIYUN_SMS_TEMPLATE`). `ALIYUN_SMS_API=dypns` (default) sends through
  号码认证服务's `SendSmsVerifyCode`, whose ready-made signatures and templates
  (`100001`: 「您的验证码为${code}…${min}分钟内有效」) need no review — the RAM user
  needs `AliyunDypnsFullAccess`. `ALIYUN_SMS_API=dysms` is 短信服务's `SendSms`
  with your own approved signature and a template whose only variable is
  `${code}`; that review is Aliyun's process and takes a working day or two.
  Either way the relay makes and checks the code itself.
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
