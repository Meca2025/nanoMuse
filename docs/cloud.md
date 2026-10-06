# nanoMuse Cloud

The "start now" path: sign up with a phone number (mainland China; the code comes by SMS)
or an e-mail address, get a free allowance, and use nanoMuse without an API key of your own.
Bringing your own key still works exactly as before — this is one more
provider, not a replacement.

## In the app

Since 0.1.20 the account is where every app starts: the first screen asks for a
phone number or an e-mail address and sends a six-digit code — or, once you have
set one, takes your password — and then asks which model answers: the account's
own (the Cloud) or a key of your own. Codes by SMS reach mainland China numbers
only (号码认证服务 sends nowhere else); a Hong Kong, Taiwan or overseas number is
told so at once (`phone_region`) and signs in with an e-mail address instead.
Signing out brings that screen back
(self-hosters: `[cloud] required = false` or `NANOMUSE_CLOUD_REQUIRED=0` on the
runtime). After the code the app has:

- a provider called **nanoMuse Cloud** under *Settings → Providers*, an
  ordinary OpenAI-compatible provider whose key is the token the relay issued;
- a model group with the relay's menu: the recommended chat model set as the
  default if you had none, and (0.1.34) the recommended hands model — the one
  that reads screenshots and drives a phone or a computer — for the GUI picker;
  each model on the menu says which of the two it is for;
- the relay's picture model as the avatar's image model, if none was set.

*Settings → nanoMuse Cloud* (the *Account* screen) shows who is signed in (a
masked hint, never the number) and since when; sets, changes or removes the
**password** (eight characters or more; scrypt on the relay; locked for a while
after repeated wrong attempts, and a fresh code sign-in opens it again); today's
spend against the allowance in ¥ and $ with a meter; **usage by kind** —
chat, pictures, video — today and in all, and **by model**; the
**sign-ins** — every device holding a key, how it signed in (code or password),
when it was last used — each revocable; the account's own **history** (sign-ins,
password changes, refusals; never message content); and the ways
out: *Sign out* on this device, *Sign out everywhere*, *Delete the account*.
The allowance belongs to the address: signing in again, on
this phone or another, gives a new key for the same account and does not grant
a second allowance.

Signing in a second provider next to it — your own Model Studio key, DeepSeek,
a local server — works as always; the relay's models can be mixed with yours
in a model group.

## What the relay keeps

The relay is the code in [`cloud/`](../cloud/README.md). It stores:

- a salted hash (HMAC-SHA256) of the e-mail address (phone accounts from
  0.1.18–0.1.21 keep working), a masked hint such as `so***@example.com`, and
  the address itself encrypted (AES-GCM, key derived from the relay's secret)
  so the operator can see who an account belongs to on the admin page — the
  database file alone shows nothing;
- the hash of each key issued, with the device name you signed in from, how
  (code or password) and when it was last used; revoked keys keep their row
  so the sign-ins list can say so;
- the password, if you set one, as an scrypt hash — never the password;
- per request: the kind (chat, picture, video), the model, the token counts
  and the amount charged;
- a timeline of account events — signed in, failed sign-in, password set or
  changed, signed out, refused for budget, upstream error — with a
  device name, a model or an error code as the detail, never message content;
- the id of each video task, so only the account that started one can poll it;
- the agent's name and look (`/v1/me/profile`): which face it wears — the dragon,
  an emoji on a colour, or one drawn in the avatar studio, with that face's five
  stills as small WebP pictures — so every device of the account shows the same
  one. Since 0.1.34 the same profile lists the account's **connectors**: which
  device connected which service (a label, how it signed in — OAuth, a key, or
  open — and when), so another device can say "connected on your Mac". The
  credential itself stays on the device that holds it; the relay refuses an
  entry that carries anything named like one. Never a key or a setting.
- since relay 0.19, the **synced conversations** (*Sync conversations between
  my devices*, on by default): the text of the account's chats — each
  conversation's title, kind and which device started it, each message's role,
  text, time and device, and the names and sizes of attached files, never the
  files themselves — so every device shows the same ones. Turning the switch
  off deletes all of it; so does deleting the account. The section
  [Conversation sync](#conversation-sync) below has the shape.

Images and tool results are never stored, and message content only as the
*Data controls* and *Conversation sync* sections below say — with both switches off, nothing: the request
is forwarded to the upstream model (Alibaba Cloud Model Studio) and the reply
is streamed back. Every response carries an `X-Nanomuse-Request` id so a problem report
can be matched to a ledger row without any content being logged. Deleting the
account (`POST /v1/auth/delete` with the account's key) removes all of it. See
[privacy.md](privacy.md).

## Allowance

### Data controls

*Settings → Data controls → Help improve nanoMuse's AI models* is a switch each
person owns, the same on the phone, the web app, the desktop and the console.
Off, the relay forwards a chat request and keeps nothing of it. On, each turn
is kept as a training view: what you wrote, what the model answered and the
tool calls it chose, with the model, the token counts and the app's platform
and language from the request headers, tied to the account id only — never the
system prompt (your memory, SOUL and instructions), never what a tool returned
(your files, your screen, what another app showed), never a picture, a clip or
a voice note (a marker stands where one was). The point is a training set for
the community's own open model. The page shows how many turns are kept; turn
the switch off at any time (nothing more is kept) and delete what was kept
with one tap; deleting the account deletes it too. Nothing is credited for
the switch either way. On `cloud.nanomuse.cn` the switch is **on for accounts
created from relay 0.9 on, until the person turns it off** — the privacy
policy says so, the page says so next to the switch, and accounts from before
keep the choice they had made; a self-hosted relay sets its own default with
`IMPROVE_DEFAULT`. The operator sees the kept turns on the admin page's *Data
controls* panel (how many accounts have it on, turns by day, model and app,
the newest turns, every account's kept conversations in full) and exports them
as JSON lines without account ids or addresses (`GET /v1/admin/samples/export`,
`?account_id=` for one account's). The relay does not receive a location — the
apps never send one — but from relay 0.10 it records the network address and
the client software (`User-Agent`: the Android app and its version, the
runtime on Windows / macOS / Linux, a browser) with each sign-in, request,
event and device, and keeps the account's first and last address; the admin
page shows them per account and per address (`GET /v1/admin/address?ip=`), and
they are deleted with the account. From relay 0.11 the admin page also says
where an address is — country, province, city — looked up in an offline copy
of ip2region's database on the relay's own disk; no third party is asked, and
nothing more is stored (the place is computed when the page is drawn).

### Conversation sync

*Settings → Data controls → Sync conversations between my devices* (0.1.36,
relay 0.19) is the other switch on that page, **on by default** for a signed-in
account. With it on, each device pushes the text of its turns to the relay and
pulls what the others pushed, so the phone, the computer and the web app show
the same chats: the title of each conversation, who started it, and each
message's role, text, time and device. Files and images are not uploaded — a
synced message carries only the names and sizes of what was attached, and the
files stay on the device that made them. Deleting a chat on one device deletes
it on all of them; renaming does the same. Chats addressed to another device
or run for one (*From Pixel 8*) are not synced at all.

**One thread** (0.1.37). An account has one main conversation, and every
device's main chat *is* it: the first device to push names its id, the others
adopt it (`main_exists` → `cid_main`, pull first on sign-in), and the main chat
on each device shows the union of what was said on all of them, ordered by
time (a tie keeps the local message first, a message is known by its `mid`, so
nothing shows twice and a device's own messages coming back are ignored). A
message written on another device is a read-only bubble with *From Pixel 8*
under it, and the model reads it with the rest of the conversation. A side
chat pulled from the relay is a chat on the device at once, with its title and
time, and continues there under the same conversation id. The person's message
goes up the moment it is sent — the other devices see it in real time, before
the reply — and the assistant's final text when the turn ends; signing in or
turning the switch on sends the device's whole eligible history, oldest first,
200 messages a request. The muse's name is part of the account's profile: a
rename on any device, including the first conversation's naming, reaches the
others on the next pull.

**Main first** (0.1.38, relay 0.20). By default only the main conversation
travels: side chats stay on the device that made them, and a device pulls with
`scope=main` so other devices' side chats never arrive. *Also sync side chats*
(a second switch under *Data controls*, off by default, **per device** — the
relay has no account-wide setting for it) turns that around for the device it is
flipped on: its side chats go up, the other devices' side chats come down, and
the first pull after the flip starts over from zero. The first pull of a fresh
sign-in asks for the **tail** — the newest 300 messages with the conversations
they belong to — so a long history opens at once instead of paging from the
start; the older messages it skipped stay on the relay and are not pulled. While a
device is answering, the others show *kwai is working…* under the last message:
a `working` note that goes through the relay's memory and the hub, is never
stored, and dies after ten minutes if the device never says it is done.

The relay keeps at most 20 000 messages per account (the oldest conversations'
messages go first, their titles stay) and 16 384 bytes per message (longer
text is cut and marked `truncated`). Turning the switch off on any device tells
the relay, which deletes everything stored and refuses the other devices with
`sync_off` until the switch is turned on again — their switches follow.
*Delete synced conversations* on the same page empties the store and leaves the
switch as it is. Nobody but the account's devices can read the store: the
operator's admin page shows counts only — accounts with it on and off, how many
conversations and messages, their size — never a text, never which account
(`GET /v1/admin/sync`). The pulls are triggered by the hub's `sync` frame
([hub.md](hub.md#frames)), at launch and once a minute.

The API, all under the account's key (401 without one; 409 `sync_off` while the
switch is off, for reads as well as writes):

```
GET    /v1/sync/state                   → {enabled, cursor, counts{conversations, messages}, limits{messages, text_bytes}, working[]}
PUT    /v1/sync/state   {enabled}       → the same; false deletes everything stored, the counter keeps counting
GET    /v1/sync/changes ?since=0&limit=500&scope=all|main&tail=K   → {cursor, more, conversations[], messages[], skipped?}
POST   /v1/sync/changes {device, conversations[], messages[]}   → {cursor, accepted, rejected[{cid | mid, reason, cid_main?}]}
POST   /v1/sync/working {cid, working, device?}   → 204; the hub tells the other devices   404 no_conversation
DELETE /v1/sync/changes                 → the state, counts at zero     everything stored, switch unchanged
DELETE /v1/sync/conversations/{cid}     → {cursor, deleted: true}      a tombstone the other devices apply; 404 no_conversation
```

`scope` (relay 0.20) is `all` unless said; `main` returns only the main
conversation and its messages, and an account with no main yet gets an empty
page whose `cursor` is the account's counter. `tail=K` (K ≤ 500, honoured with
`since=0` only) returns the newest K messages in `seq` order, the conversations
they belong to, `cursor` at the account's counter, `more: false` and `skipped`
— how many older messages were left out. Any other `scope` is 400 `bad_scope`.
`POST /v1/sync/working` says the device named in `device` (or in
`X-Nanomuse-Device`) is answering in `cid` (`working: true`) or has finished
(`false`); the relay keeps the live ones in memory for ten minutes — never in
the database, so a restart forgets them — lists them under `working` in the
state (`[{cid, from, device_name, working, at}]`) and sends a `working` frame
to the account's other sockets ([hub.md](hub.md#frames)). Request bodies over
`MAX_REQUEST_BYTES` (16 MiB by default since 0.20) are 413 `too_large` with
*Request body is N MB; this relay accepts up to M MB*.

A conversation is `{cid, kind: main | side, title, device, device_name,
created_at, updated_at, deleted, seq}` and a message `{mid, cid, seq, device,
device_name, role: user | assistant, text, truncated, attachments[{name, mime,
size}], created_at, deleted}`; `cid` and `mid` are UUIDs the device makes (4–64
characters of `a-z 0-9 . _ : -`, folded to lower case), times are Unix seconds.
Every accepted change takes the account's next `seq`; a device keeps the
highest `cursor` it has pulled and asks for `since=` that. A push is idempotent
— a known `mid` is left alone unless the new row is a tombstone, a known `cid`
takes the newer title — and at most 200 messages or conversations long (413
`too_many_messages`). A page lists its conversations and messages in `seq`
order, and the relay adds the conversation of every message in the page even
when that conversation's own `seq` lies ahead (a rename moves it), so a client
applies the page's conversations first, then its messages, and is never handed
an orphan. Refusals name the row: `main_exists` with `cid_main` when a second
`main` is pushed — the device then re-sends under `cid_main` —, `unknown_cid`,
`conversation_deleted`, `bad_cid`, `bad_mid`, `bad_kind`, `bad_role`. A
tombstone keeps its row for 30 days and is then swept. After an accepted push
or a deletion the hub tells the account's other devices with a `sync` frame
(`DELETE` from the console carries the deleting device in `X-Nanomuse-Device`
so it can skip its own echo).

nanoMuse is a community project and charges nothing. The public relay at
`cloud.nanomuse.cn` is paid for by the developer, so each account has a pool
to draw on — for its lifetime, not by the day (relay 0.5):

| | `cloud.nanomuse.cn` |
|---|---|
| sign-up | open to anyone with a mainland China mobile number or an e-mail address |
| free allowance | **¥10 per account** at the time of writing, across chat, pictures and clips; it does not reset. The figure is the relay's to set (it can go up without an app update — the apps print what the relay says, `/v1/config`), and the account page always shows the current one |
| invitations | each *new* person who signs up with your code adds **¥5** (again, the relay's figure) to your pool — and the same to theirs |
| when it is gone | bring your own key or a plan you already pay for — in mainland China, [Alibaba Cloud Bailian](own-key.md) first (one key covers chat, the hands, pictures and clips); elsewhere, [OpenRouter](https://openrouter.ai/keys) or OpenAI first (Bailian only signs up accounts from mainland China); a ChatGPT, Claude or Kimi plan signs in where the client has the flow; any OpenAI-compatible endpoint works; sign-in and your devices are unaffected |
| members | the developer and the people they list have no limit, and may set any model the provider has (a chat model for chat, an image one for pictures, a video one for clips): the apps' model picker lists them after the menu as *More models on your account* (relay 0.10 reads the provider's list under the Cloud key), and an id can still be typed — *Other model…* |
| rate | 30 requests per minute |
| tokens | no ceiling; usage is metered and shown |

Spend is counted at the model provider's list prices (Alibaba Cloud Model
Studio, Beijing region, October 2026): `deepseek-v4.1-flash` — the chat model
since 0.1.34, it reads pictures and thinks before it answers — ¥2 in / ¥8 out
per million tokens, `qwen3.8-27b` — the hands model, usable for chat too — ¥3
/ ¥12, `qwen3.8-flash` ¥0.8 / ¥2.7, `qwen-image-3.0` ¥0.18 a picture,
`wan2.2-i2v-flash` ¥0.10 a second of video at 480P (a 5-second clip is
¥0.50). A typical day of chatting costs a few fen; ¥10 is roughly two million
tokens of the chat model or fifty pictures. A new face —
four candidates, four poses and four clips — comes to about ¥3.5, and the app
shows the estimate and what is left before it draws.

*Settings → nanoMuse Cloud* shows what was used of the pool in ¥ and $, what
is left, and how the pool grows. At 80 % the app says so once; when the pool
is spent the relay refuses with `allowance_exhausted` and the app shows the
ways on: your own key, a plan you already pay for, or an invitation (+¥5 for
each of you, or whatever the relay says that day). Which provider comes first
follows where you are (0.1.34: the relay's `region`, read from the number's
country code or from an offline copy of ip2region on its own disk — nothing is
sent anywhere): a mainland China account is pointed to Alibaba Cloud Bailian —
the provider form opens pre-filled, [guide](own-key.md) — and everyone else to
OpenRouter or OpenAI, since Bailian only signs up accounts from the mainland.

Since relay 0.21 the refusal and `/v1/me` carry the whole card as data, not
only two links (contract C11): `spend.guidance` — and `guidance` beside the
`allowance_exhausted` error — lists the region's providers in order with what
each one's key covers (`covers: chat | vision | image | video`, from the shared
catalogue [`nanomuse/llm/providers.json`](../nanomuse/llm/providers.json), of
which the relay ships its own copy), the plans a person may already pay for and
which clients can sign in with them (`plans`: ChatGPT everywhere, Claude and
Kimi on the phones, OpenRouter on the phones), the local servers (`local`), the
docs link and the honest line about the ChatGPT sign-in (`caveats.chatgpt`,
`caveats.chatgpt_zh`). The 0.17 `ways` rows are still sent, each now with the
provider's `name`, `name_zh`, `key_url`, `covers` and `auth`, so a 0.1.38
client draws the same two buttons it always did. The console at `/app` draws
the card from `guidance` and falls back to the two links on an older relay.
Other relays may set other rules
(`ALLOWANCE_CNY`, `INVITE_BONUS_CNY`, `SIGNUP_OPEN`, `ALLOWED_IDENTIFIERS` —
all three figures adjustable while the relay runs, relay 0.15; see
[`cloud/README.md`](../cloud/README.md)).

nanoMuse asks for one thing in return: a star on
[GitHub](https://github.com/nano-muse/nanoMuse), which is what helps the
project be found. The moments are the relay's to set, not the app's (0.1.35):
`GET /v1/nudges` says when an ask is fair — after the third, tenth and
thirtieth task it finishes for you, on the seventh and thirtieth day you open
it, when a goal is reached, when a new face is drawn, once on the account page,
and when the pool is spent — with at least a week between two asks and at most
four per device. Each ask is a card where it happens; "Not now" counts as one,
and none comes back after you have been to the page. The operator changes the
policy on the admin page (*Settings › Star asks*) without an app update; every
app keeps the same defaults built in for when the relay cannot be reached.

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

The app's calls, all JSON:

```
POST /v1/auth/code          {identifier}                      → 204
POST /v1/auth/verify        {identifier, code, device}        → {api_key, base_url, account, tokens, models}
POST /v1/auth/login         {identifier, password, device}    → the same; 401 bad_credentials, 429 locked, 400 no_password
POST /v1/auth/password      Bearer  {password, current?}      → 204; "" with current removes it
GET  /v1/me                 Bearer                            → {region: cn | intl | unknown, account{…, has_password, sessions, signed_in_via}, usage{today, total by kind / model}, tokens, spend{…, ways}, models, recent, nudges}
GET  /v1/nudges                                               → {version, star{enabled, url, moments{signed_in, tasks[], new_look, exhausted, days_used[], goal_done}, cooldown_days, max_asks}}; no key, cached an hour
GET  /v1/me/profile         Bearer  ?face=false               → {rev, device, name, avatar, …, face?, connectors: [{id, label, url, auth, device, device_id, enabled, at}]}
PUT  /v1/me/profile         Bearer  {device, name?, avatar?, …, connectors?}  → {rev, device}; a device's connectors replace only its own; 400 no_secrets_in_profile, too_many_connectors
DELETE /v1/me/profile       Bearer                            → 204
GET  /v1/me/sessions        Bearer                            → {sessions: [{prefix, device, via, created_at, last_used_at, current}]}
DELETE /v1/me/sessions/{prefix}  Bearer                       → 204
GET  /v1/me/events          Bearer  ?limit=50                 → {events: [{ts, kind, detail}]}
POST /v1/auth/sign-out      Bearer                            → 204
POST /v1/auth/sign-out-all  Bearer  {all?}                    → {signed_out}
POST /v1/auth/delete        Bearer                            → 204
```

Everything else is the OpenAI API: `GET /v1/models` (with `architecture`
modalities so the picture model is recognisable, and a `nanomuse` block per
model with its `kind`, prices, `for` — the lane(s) a chat model is for, `chat`
and / or `gui` — and `recommended_for`), `POST /v1/chat/completions`
with streaming, `POST /v1/images/generations` and `/v1/images/edits`. Errors
are `{"error": {"message", "type": "nanomuse_cloud", "code"}}` with a stable
`code` the app turns into a sentence.

Devices: `GET /v1/devices` lists the account's devices (online or last seen),
`DELETE /v1/devices/{id}` forgets an offline one, and `WS /v1/hub` is the hub
itself — the frames are in [hub.md](hub.md). Conversations: `/v1/sync/state`,
`/v1/sync/changes` and `/v1/sync/conversations/{cid}` — the section
[Conversation sync](#conversation-sync) above.
