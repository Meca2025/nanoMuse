# The web console: your model, your key, your plan

> The web console is the app `nanomuse serve` serves at `/` — the front door of
> the desktop app and of a self-hosted runtime ([app.md](app.md)). This page is
> about one part of it: how it picks the model that answers, and what it offers
> when the model lacks something. The guide for making a key is
> [own-key.md](own-key.md).

## One catalogue

The console reads the same list of providers as the phones, the desktop and the
relay: [`nanomuse/llm/providers.json`](../nanomuse/llm/providers.json) (contract
C11). Each provider says what one key there covers — `chat`, `vision` (the
hands read screenshots), `image` (the avatar studio's pictures), `video` (its
clips) — and which sign-ins it has besides a key. The console asks the runtime
first (`GET /api/providers`, which also says which slots are configured today
and what that covers) and falls back to the copy bundled at build time on an
older runtime, with nothing known about what is configured. `web/src/providers.ts`
is the module; `web/src/providers.test.ts` checks the ordering, the mapping
and the sentences.

## Where it shows

**Connections → Chat model.** The provider tiles are the runtime's presets, the
region's first pick first (Alibaba Cloud Bailian on the mainland, OpenRouter
elsewhere — [region.ts](../web/src/region.ts)). Under the tiles the chosen
provider's line from the catalogue says what its key covers and what to know
about it (the Kimi editions, the OpenRouter Image API, the ChatGPT caveat). The
*Hands model* picker lists models that see; a provider without `vision` gets
the one sentence instead of a blind hands model. Under *Pictures and clips*,
a provider without `image` or `video` shows the sentence in place of the
picker; one with them shows *Automatic — the catalogue's default* so you know
what *Automatic* will draw with.

**Connections → Or sign in with a ChatGPT plan.** The card asks the runtime to
start the Codex sign-in (`POST /api/chatgpt/login` → `{url}`), opens the page
in a new tab, polls `GET /api/chatgpt/status` every two seconds for up to ten
minutes, and when the tokens are in the runtime's store offers *Use it for the
chat* (`[llm] provider = "chatgpt"`) and *Sign out of ChatGPT*
(`POST /api/chatgpt/logout`). The card says what the sign-in covers — chat and
the hands, not pictures or clips — and carries the honest line about OpenAI's
terms. A runtime without these routes answers 404; the card then names the
command to run in a terminal, `nanomuse chatgpt login`, instead of pretending.
The sign-in's callback lands on port 1455 of the machine the runtime runs on.
When the browser cannot reach it (a runtime on another computer, or the port
taken — `port_bound: false` in the login's answer), the browser ends on an
address that will not load; the card has a box for that address and hands it
to the runtime (`POST /api/chatgpt/callback {url}`; a stale link is 400
`state_mismatch`, a login older than ten minutes 409 `no_login`). The box is
there in every case, with a sentence saying why when the port could not be
bound ([configuration.md](configuration.md#a-chatgpt-plan-instead-of-a-key)).

**The allowance card** (Account, and in the chat on `allowance_exhausted`) has
three ways on: *Use your own model key* with the region's first pick, a *Set it
up* that opens Connections on that provider, *Get a key from …*, the guide, and
under *Other providers and what each key covers* the rest of the region's list
(the relay's `guidance.providers` when the relay sends it, relay 0.21; else the
catalogue's) each with its covers line, its own *Set it up* and key link;
*Sign in with a plan you already pay for* with the ChatGPT card inline; and
the invitation. The 80 % heads-up and the first-sign-in sheet point the same
way.

**Avatar studio.** Without an image model the *Draw* button is off and the
line under it is the one sentence — *Pictures need a provider with image
models — Alibaba Cloud Bailian, Zhipu GLM, SiliconFlow or Volcengine Ark* on
the mainland, *OpenRouter, OpenAI, Google Gemini or xAI Grok* elsewhere — with
*Change model* beside it. **Settings → Image & video models** shows the same
sentence as its value when the runtime says pictures or clips are not covered.

## The sentences

Every unavailable feature is one sentence, never a raw error, built by
`unavailableLine(cap, region, locale)` from the region's providers with that
capability (four at most, in the catalogue's order):

| Capability | English | 中文 |
|---|---|---|
| `image` | Pictures need a provider with image models — {providers}. | 画图需要一个有图像模型的服务商——{providers}。 |
| `video` | Clips need a provider with video models — {providers}. | 生成视频需要一个有视频模型的服务商——{providers}。 |
| `vision` | The hands need a model that sees pictures — {providers}. | 动手需要一个能看图的模型——{providers}。 |
| `chat` | Chat needs a model — {providers}. | 对话需要一个模型——{providers}。 |

A *How* link beside each goes to [own-key.md](own-key.md). The provider names
come from the catalogue in the console's language (`name` / `name_zh`).

## Checks

```sh
cd web && npm run lint && LANG=en_US.UTF-8 npx vitest run && npm run build
```

The build writes `nanomuse/server/static/`, which is committed with the change;
`web/tsconfig.tsbuildinfo` is a by-product and is not.
