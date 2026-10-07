# Bring your own key


nanoMuse is free and non-profit. The model behind it costs money, and the
developer pays for a starting allowance per account (the app shows the relay's
current figures). When it is gone, there are two ways on that need nothing
from nanoMuse: a key of your own at a model provider, or a plan you already
pay for — ChatGPT, Claude, Kimi — signed in from the app.

Every client reads the same list of providers, with what each one covers:
**chat**, **the hands** (a model that sees screenshots), **pictures** (the
avatar studio) and **clips** (the avatar's short videos). A feature no
configured provider covers is simply not offered, with one sentence saying
which providers would — nothing breaks.

Your sign-in, your invite code and your devices are not affected: the account
stays, only the model provider changes. Nothing you say passes through nanoMuse
Cloud once your own key or plan is in use.

## Where you are decides who comes first

| | First | What one key there covers |
|---|---|---|
| Mainland China | **Alibaba Cloud Bailian** | chat, the hands, pictures and clips — all four under one key |
| Everywhere else | **OpenRouter**, then **OpenAI** | chat, the hands and pictures; clips are Bailian only for now |

Bailian only signs up accounts with a mainland Chinese identity; outside, one
OpenRouter account puts hundreds of models behind one key, pay as you go.
Beyond the first pick, every provider below works on its own or beside another
— DeepSeek for the chat and Zhipu for pictures, say.

The chat model and the hands model are two settings: the chat model in the
model picker, the hands model on the *Hands model* row (phone: *Settings →
Hands*; web and desktop: *Connections*). The hands model has to see pictures;
the app's hands picker lists only models that do.

## What each provider covers

Chat = the conversation; hands = reading screenshots to operate the phone or
the computer; pictures = the avatar studio's images; clips = the avatar's
short videos.

| Provider | Chat | Hands | Pictures | Clips | Region | Make a key |
|---|:-:|:-:|:-:|:-:|---|---|
| Alibaba Cloud Bailian | ● | ● | ● | ● | mainland China | [bailian.console.aliyun.com](https://bailian.console.aliyun.com/?apiKey=1) |
| DeepSeek | ● | ● | | | both | [platform.deepseek.com](https://platform.deepseek.com/api_keys) |
| Kimi (Moonshot AI) | ● | ● | | | both (a mainland and a global edition) | [platform.moonshot.cn](https://platform.moonshot.cn/console/api-keys) · [platform.kimi.ai](https://platform.kimi.ai/console) |
| Zhipu GLM | ● | ● | ● | | mainland China | [open.bigmodel.cn](https://open.bigmodel.cn/usercenter/apikeys) |
| SiliconFlow | ● | ● | ● | | mainland China | [cloud.siliconflow.cn](https://cloud.siliconflow.cn/account/ak) |
| Volcengine Ark (Doubao) | ● | ● | ● | | mainland China | [console.volcengine.com](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey) |
| MiniMax | ● | ● | | | both (a mainland and a global edition) | [platform.minimaxi.com](https://platform.minimaxi.com/user-center/basic-information/interface-key) |
| OpenRouter | ● | ● | ● | | outside mainland China | [openrouter.ai/keys](https://openrouter.ai/keys) |
| OpenAI | ● | ● | ● | | outside mainland China | [platform.openai.com](https://platform.openai.com/api-keys) |
| Anthropic Claude | ● | ● | | | outside mainland China | [platform.claude.com](https://platform.claude.com/settings/keys) |
| Google Gemini | ● | ● | ● | | outside mainland China | [aistudio.google.com](https://aistudio.google.com/apikey) |
| xAI Grok | ● | ● | ● | | outside mainland China | [console.x.ai](https://console.x.ai) |
| Groq | ● | ● | | | outside mainland China | [console.groq.com](https://console.groq.com/keys) |
| Mistral AI | ● | ● | | | outside mainland China | [console.mistral.ai](https://console.mistral.ai/api-keys) |
| Ollama / LM Studio / vLLM (on your machine) | ● | | | | both | no key |

Only Bailian has a dot under *Clips* because nanoMuse's clip generation speaks
Bailian's video API; the other vendors' video models sit behind their own task
APIs, not wired this round. Under *Pictures*, OpenRouter goes through its
Image API with models such as `openai/gpt-image-2`; Gemini uses
`gemini-2.5-flash-image`.

The table is the repository's catalogue,
[`nanomuse/llm/providers.json`](../nanomuse/llm/providers.json) — every client
and the relay read it; endpoints, default models and what each covers are in
there, checked against each vendor's documentation in October 2026.

## Making a key

The same three steps everywhere: sign up → create an API key in the console →
paste it into nanoMuse. **The key is for nanoMuse only; never send it to anyone
or paste it into a chat.**

- **Alibaba Cloud Bailian.** Sign in to [bailian.console.aliyun.com](https://bailian.console.aliyun.com/) with an Alibaba Cloud account (identity verification is required), accept *Enable Model Studio* on first entry, then create a key on the [API-KEY page](https://bailian.console.aliyun.com/?apiKey=1); it starts with `sk-`. A new account comes with free tokens for a while. Set a usage alert in the console.
- **DeepSeek.** Sign up, add credit and create a key at [platform.deepseek.com](https://platform.deepseek.com/); base URL `https://api.deepseek.com/v1`.
- **Kimi.** The mainland edition is [platform.moonshot.cn](https://platform.moonshot.cn/console/api-keys), base URL `https://api.moonshot.cn/v1`; the global one is [platform.kimi.ai](https://platform.kimi.ai/console), base URL `https://api.moonshot.ai/v1`. Accounts and keys are not shared between the two.
- **Zhipu GLM.** [open.bigmodel.cn](https://open.bigmodel.cn/usercenter/apikeys), base URL `https://open.bigmodel.cn/api/paas/v4`.
- **SiliconFlow.** [cloud.siliconflow.cn](https://cloud.siliconflow.cn/account/ak), base URL `https://api.siliconflow.cn/v1`; model ids carry the vendor prefix, e.g. `deepseek-ai/DeepSeek-V4-Flash`.
- **Volcengine Ark.** [console.volcengine.com](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey) — enable the models you want in Ark, then create a key; base URL `https://ark.cn-beijing.volces.com/api/v3`.
- **MiniMax.** Mainland edition at [platform.minimaxi.com](https://platform.minimaxi.com/user-center/basic-information/interface-key), base URL `https://api.minimaxi.com/v1`; the global base URL is `https://api.minimax.io/v1`.
- **OpenRouter.** Sign in at [openrouter.ai](https://openrouter.ai/) with Google, GitHub or an e-mail address, add credit under *Credits*, create a key under *Keys*; it starts with `sk-or-v1-`. *Settings → Limits* puts a monthly cap on a key.
- **OpenAI.** [platform.openai.com](https://platform.openai.com/api-keys), base URL `https://api.openai.com/v1`.
- **Anthropic.** [platform.claude.com](https://platform.claude.com/settings/keys). nanoMuse speaks Anthropic's own API; no compatibility layer is needed.
- **Google Gemini.** [aistudio.google.com/apikey](https://aistudio.google.com/apikey), base URL `https://generativelanguage.googleapis.com/v1beta/openai`.
- **xAI, Groq, Mistral.** A key from each console; base URLs `https://api.x.ai/v1`, `https://api.groq.com/openai/v1`, `https://api.mistral.ai/v1`.

**Paste it into nanoMuse.**

- Phone: *Set it up* on the allowance card opens the provider form pre-filled; or *Settings → Providers → Add*, pick the provider, paste the key, save.
- Web / desktop: *Set it up* on the allowance card opens *Connections* with the provider chosen; or *Connections → Model*, click the provider, paste the key, save. The address is already filled in.
- A runtime of your own: `[llm] provider = "bailian"` (any id from the table) and `api_key` in `config.toml`; the address and the default model fill in from the catalogue. Pictures or clips from another provider are an `[image]` / `[video]` block ([configuration.md](configuration.md#image-and-video)).

After saving, nanoMuse lists the models the key can use: pick one for chat and
one that sees for the hands; for a new face, choose under *Connections → Image
& video models*. Each provider's defaults are in the catalogue.

## Sign in with a plan you already pay for

Some plans sign in directly, with no key to make:

| Plan | Covers | Where the sign-in is |
|---|---|---|
| **ChatGPT** (Plus / Pro / Team) | chat, the hands | Android, iPhone, desktop, web |
| **Claude** (Pro / Max) | chat, the hands | Android, iPhone |
| **Kimi** | chat, the hands | Android, iPhone (device code) |
| **OpenRouter** | chat, the hands, pictures | Android, iPhone (one tap; the key comes back to the app) |

The ChatGPT sign-in uses the authorisation flow of OpenAI's own Codex (web and
desktop: *Connections → Or sign in with a ChatGPT plan*; phone: *Settings →
Providers → OpenAI → Sign in*). Signed in, it covers chat and the hands only —
the Codex backend has no image or video endpoints — so pictures and clips
still want a key.

From a terminal it is the same flow: `nanomuse chatgpt login` opens the page
and waits for the browser to come back, `nanomuse chatgpt status` says who is
signed in and until when, `nanomuse chatgpt logout` forgets it; then
`[llm] provider = "chatgpt"` in `config.toml` (no `base_url`, no `api_key`; an
empty `model` is `gpt-5.6-sol`). The browser has to reach port 1455 on the
machine the runtime runs on; when the runtime is elsewhere, copy the whole
address the browser ends on and give it to the CLI's prompt or to
`POST /api/chatgpt/callback {"url": …}`
([configuration.md](configuration.md#a-chatgpt-plan-instead-of-a-key)).

**One honest line.** OpenAI's terms cover using a ChatGPT plan inside OpenAI's
own Codex; other apps have had this access cut off before (OpenCode, January
2026). If it stops working, an API key does.

## When the provider cannot be reached

Some networks do not get to `chatgpt.com` at all (the name does not resolve,
the connection times out, TLS fails, an HTML interception page comes back
where JSON was due), and in some regions OpenAI refuses outright (HTTP 403
`unsupported_country_region_territory`). The chat on the phone then shows a
card, not the socket's words: what happened (*chatgpt.com cannot be reached
from this network* or *OpenAI does not serve this region*), what helps (a VPN
on this phone; the app's own proxy under *Settings → Network*; another
provider with a key of your own), a *Try again* button, and the raw line
behind *Details* for a bug report. An expired sign-in (401) reads *The ChatGPT
sign-in is no longer valid* with *Sign in again*; a plan whose window is spent
(a 429 that names a usage limit) reads *The ChatGPT plan has nothing left for
now* with OpenAI's own sentence and when it resets; any other 429 is *Too many
requests at once*. A key of your own that meets the same network trouble gets
the same card with that provider's host in it.

**Settings → Network → HTTP proxy for own providers** (Android and iPhone):
host, port, an optional user name and password; off by default, kept on this
phone only. Only the requests to the providers you added with your own key and
to the ChatGPT plan go through it; nanoMuse Cloud, your computers and the local
network never do. A *Test* row fetches `https://chatgpt.com/` through the proxy
as entered and says whether it got through and in how many milliseconds. The
same setting lives where each app keeps its keys: the phones have it in the
provider form; the desktop under **Settings → nanoMuse Cloud → Network**, one
address (`http://host:port` or `socks5://host:port`) that the app applies to its
host process at the next start — *Restart now* is under the row — so every own
key, the ChatGPT sign-in and the hands' runtime go through it and nanoMuse Cloud
never does ([desktop.md](desktop.md)); the web app has the *Proxy* field in the
own-key form; the runtime has `[llm] proxy` in `config.toml`
([configuration.md](configuration.md#llm)).

## Local models

Ollama, LM Studio and vLLM on your own computer work too: pick the preset
under *Connections*; the address defaults to the local port
(`http://127.0.0.1:11434/v1`, `:1234`, `:8000`) and no key is needed. They
count as *chat*; the hands need a model that sees, so run a multimodal one
locally (Ollama's `qwen3-vl`, say) and type its id on the *Hands model* row.
Pictures and clips need one of the providers in the table.

## Any other OpenAI-compatible endpoint

Anything that speaks the OpenAI API works — choose *Custom*:

| Field | Value |
|---|---|
| Base URL | the provider's address, usually ending in `/v1` |
| API key | the key made in the provider's console (a local server may leave it empty) |
| Model | pick from the list after saving; if none appears, type the model id from the provider's docs |

What a custom endpoint covers is yours to say: nanoMuse takes it for chat, and
the hands, picture and clip models count once their ids are filled in.
