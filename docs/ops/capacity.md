# What ¥5,000 buys: capacity and running costs

*October 2026, three days after sign-ups opened. Figures are what the relay's ledger and
the showcase's visitor log recorded, priced at Model Studio's list prices for the Beijing
region; the operator's own bill may be lower (idle-hour rates, cache hits, promotions).
Re-run the numbers from the admin console's* Today *and* Where from *panels when they age.*

## The parts that cost money

| Part | Unit cost | Note |
|---|---|---|
| Server (Alibaba Cloud ECS, Hong Kong, 4 vCPU / 8 GB / 60 GB NVMe) | ≈ ¥250–400 a month, pay-as-you-go | runs the relay, the showcase gateway, Caddy and up to 20 demo containers; sits at ~1 % CPU and ~150 MB between demos |
| Domains (`nanomuse.cn`, `nanomuse.dev`) | ≈ ¥120 a year | |
| Cloud chat — `qwen3.8-27b` (the menu's recommended model) | ¥3 per M input tokens, ¥12 per M output | what the ledger bills against the ¥10 allowance |
| Cloud chat — `qwen3.8-flash` | ¥0.8 / ¥2.7 per M | 0.3× in the ledger |
| Cloud pictures — `qwen-image-3.0` | ¥0.18 a picture | |
| Cloud clips — `wan2.2-i2v-flash` | ¥0.10 a second, 5 s clips → ¥0.50 | |
| Demo chat — `deepseek-v4.1-flash` (the showcase's model) | ¥1–2 per M input, ¥4–8 per M output (idle / busy hours) | the showcase's own key, not the relay's ledger |
| A sign-in code by SMS (Aliyun) | ≈ ¥0.045 a message | mainland numbers only |
| A sign-in code by e-mail (DirectMail) | ≈ ¥0.002 a message | |

GitHub (Actions, Pages, ghcr.io) costs nothing for a public repository.

## What a person actually costs

**A Cloud account** (39 ordinary accounts, three days): the relay has billed **¥215** in total,
so **¥5.5 per account on average**, median ¥3.7. Nine of the 39 (23 %) used up the ¥10
allowance; the heaviest reached ¥25 through invite bonuses (+¥5 per invited friend). The
allowance is the ceiling: an ordinary account can never cost more than ¥10 plus the bonuses
it earned. A sign-in costs one or two codes (¥0.05–0.10 by SMS, a fraction of a fen by mail).

**A day of ordinary use**: ¥78 → ¥95 → ¥42 on the three days (505–1,376 chat requests a
day), from 16 active accounts on the third. The agent is prompt-heavy — 14 M prompt tokens
against 79 k completion tokens on one day — so input price is what matters, which is why
`qwen3.8-flash` for routine work is six times cheaper than the 27B.

**Members** (unlimited accounts, 4 of them) are the one open-ended line: ¥109 on the day
the operator tested everything, under ¥10 a day since. Budget them separately.

**A demo session** (browser phone): capped at 80 LLM requests / 300 k tokens / 12 pictures /
4 clips in 30 minutes, 6 sessions per account per day (production's `SESSION_LLM_REQUESTS=80`;
the gateway's shipped default is 60). The one full session observed used
19 requests and 236 k tokens ≈ **¥0.5**; a session that hits every cap costs about
¥0.8 (chat) + ¥2.2 (pictures) + ¥2 (clips) ≈ **¥5**. A visitor who tries once or twice costs
about ¥1; the worst a single account can do in a day is 6 × ¥5 = ¥30.

## Three readings of ¥5,000

Fixed costs first: server + domains ≈ **¥300 a month** (take ¥250–400). Then what is left buys
people.

| Horizon | Fixed | Left for people | Ordinary accounts it covers (at ¥5.5 avg; worst case ¥10) | Or demo visitors (¥1 each) |
|---|---|---|---|---|
| 6 months | ¥1,800 | ¥3,200 | **≈ 580** (worst case ≈ 320) | ≈ 3,200 |
| 12 months | ¥3,600 | ¥1,400 | ≈ 250 (worst case ≈ 140) | ≈ 1,400 |
| 3 months, growth push | ¥900 | ¥4,100 | **≈ 750** (worst case ≈ 410) | ≈ 4,100 |

The mix is the operator's to choose — the demo converts visitors at ¥1 a head, an account
costs ¥5–10 and is what people stay with. Members' use and the operator's own testing come
out of the same pot and are not in the table.

Concurrency is not the constraint at this scale: the relay is I/O-bound and idles at 64 MB;
the hub holds 64 device sockets today and would hold thousands; the demo's ceiling is the
20 containers (`MAX_SESSIONS`), about 250 MB each — 20 people in the browser phone at once,
which the 8 GB box carries.

## The levers, in order of effect

1. **The allowance** (`ALLOWANCE_CNY`, ¥10). Halving it to ¥5 doubles the accounts a yuan
   buys and still gives a week of ordinary chat; 23 % of accounts reached the ceiling, so it
   is the number people feel. The invite bonus (`INVITE_BONUS_CNY`, ¥5) is paid for by the
   friend who stays.
2. **The recommended model.** `qwen3.8-27b` at ¥3/¥12 is the default; routines and the
   hands can use `qwen3.8-flash` (¥0.8/¥2.7) without anyone noticing. A `priced_as` for
   catalog models keeps a member's `deepseek-v4-pro` from being billed as the cheap one.
3. **A daily cap that members feel too** (`DAILY_CAP_TOKENS`, off today; it is counted in
   billed tokens and applies to every account, unlimited ones included) — 6 M tokens a day
   is about ¥20 of the 27B and stops a runaway routine from eating a month of budget
   overnight. The relay already refuses with `daily_cap` and the apps show the reset time.
4. **The demo's caps** are already tight; `PER_ACCOUNT_DAILY=6` is the one to lower first
   if the demo is abused (3 a day still lets a person try everything).
5. **The server.** The 4-core box is bigger than the load; a 2 vCPU / 4 GB instance
   (≈ ¥120 a month) carries the relay and 8–10 demo sessions and would stretch the fixed
   line to a year. Move up again when the demo queue is busy.
6. **Alerts.** Set a Model Studio spend alert at ¥20 a day and ¥400 a month; the admin
   console's *Today* panel shows the same number in real time, and `Where from` says who
   the people are.

## How to re-run this

```sh
# the ledger's view, from the box
tok=$(grep '^CLOUD_ADMIN_TOKEN=' /opt/nanomuse/relay/.env | cut -d= -f2-)
curl -s -H "X-Admin-Token: $tok" https://cloud.nanomuse.cn/v1/admin/overview | jq '.today, .week'
curl -s -H "X-Admin-Token: $tok" 'https://cloud.nanomuse.cn/v1/admin/places?days=30' | jq '.new_accounts[:10]'
# the showcase's visitors and sessions
curl -s -H "X-Admin-Token: $tok" 'https://cloud.nanomuse.cn/v1/admin/demo?days=30' | jq '.visitors_total, .visits_total'
```

Prices: [Model Studio pricing](https://help.aliyun.com/zh/model-studio/model-pricing) and the
model pages (`deepseek-v4.1-flash`, `qwen3.8-27b`). The relay's menu prices live in
`cloud/nanomuse_cloud/config.py` (`DEFAULT_MODELS`) and may be overridden with
`CLOUD_MODELS`.
