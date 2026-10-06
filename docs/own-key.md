# Bring your own key · 换成自己的 key

[中文](#中文) · [English](#english)

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

---

## 中文

### 先看你在哪

| | 首选 | 一把 key 能做什么 |
|---|---|---|
| 中国大陆 | **阿里云百炼** | 对话、动手、画图、生成视频——四样都在一把 key 下 |
| 海外 | **OpenRouter**，其次 **OpenAI** | 对话、动手、画图；生成视频目前只有百炼 |

百炼只给中国大陆身份注册；海外用户一个 OpenRouter 账号就能用到几百个模型，按量付费。首选之外，下面的每一家都可以单独用，或者和另一家搭配——比如对话用 DeepSeek、画图用智谱。

对话模型和手的模型是两个设置：对话模型在模型选择里，手的模型在「手的模型」一行（手机：设置 → Hands；网页版 / 桌面版：连接）。手的模型必须能看图；App 里的手的模型列表只列能看图的。

### 各家服务商能做什么

对话 = 聊天；动手 = 看截图操作手机和电脑；画图 = 形象工作室的图片；视频 = 形象的短动画。

| 服务商 | 对话 | 动手 | 画图 | 视频 | 地区 | 申请 key |
|---|:-:|:-:|:-:|:-:|---|---|
| 阿里云百炼 | ● | ● | ● | ● | 中国大陆 | [bailian.console.aliyun.com](https://bailian.console.aliyun.com/?apiKey=1) |
| DeepSeek | ● | ● | | | 都可以 | [platform.deepseek.com](https://platform.deepseek.com/api_keys) |
| Kimi（月之暗面） | ● | ● | | | 都可以（国内 / 国际两个版本） | [platform.moonshot.cn](https://platform.moonshot.cn/console/api-keys) · [platform.kimi.ai](https://platform.kimi.ai/console) |
| 智谱 GLM | ● | ● | ● | | 中国大陆 | [open.bigmodel.cn](https://open.bigmodel.cn/usercenter/apikeys) |
| 硅基流动 | ● | ● | ● | | 中国大陆 | [cloud.siliconflow.cn](https://cloud.siliconflow.cn/account/ak) |
| 火山方舟（豆包） | ● | ● | ● | | 中国大陆 | [console.volcengine.com](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey) |
| MiniMax | ● | ● | | | 都可以（国内 / 国际两个版本） | [platform.minimaxi.com](https://platform.minimaxi.com/user-center/basic-information/interface-key) |
| OpenRouter | ● | ● | ● | | 海外 | [openrouter.ai/keys](https://openrouter.ai/keys) |
| OpenAI | ● | ● | ● | | 海外 | [platform.openai.com](https://platform.openai.com/api-keys) |
| Anthropic Claude | ● | ● | | | 海外 | [platform.claude.com](https://platform.claude.com/settings/keys) |
| Google Gemini | ● | ● | ● | | 海外 | [aistudio.google.com](https://aistudio.google.com/apikey) |
| xAI Grok | ● | ● | ● | | 海外 | [console.x.ai](https://console.x.ai) |
| Groq | ● | ● | | | 海外 | [console.groq.com](https://console.groq.com/keys) |
| Mistral AI | ● | ● | | | 海外 | [console.mistral.ai](https://console.mistral.ai/api-keys) |
| Ollama / LM Studio / vLLM（本机） | ● | | | | 都可以 | 不需要 key |

「视频」一栏只有百炼，是因为 nanoMuse 的视频生成走的是百炼的接口；其他家的视频模型用的是各自的任务接口，这一轮还没有接。「画图」一栏里，OpenRouter 走的是它的 Image API，模型例如 `openai/gpt-image-2`；Gemini 用 `gemini-2.5-flash-image`。

这张表来自仓库里的目录文件 [`nanomuse/llm/providers.json`](../nanomuse/llm/providers.json)——每个客户端、中继都读它，地址、默认模型和「能做什么」都在里面；表里的事实在 2026 年 10 月对照各家文档核过。

### 怎么申请 key

每家的步骤都是一样的三步：注册 → 控制台里创建 API key → 复制到 nanoMuse。**key 只给 nanoMuse 用，不要发给任何人、不要贴到聊天里。**

- **阿里云百炼。** 用阿里云账号登录 [bailian.console.aliyun.com](https://bailian.console.aliyun.com/)（要实名认证），首次进入点「开通百炼服务」，再到 [API-KEY 页](https://bailian.console.aliyun.com/?apiKey=1) 创建；key 以 `sk-` 开头。新账号有一段时间的免费 token。建议在控制台设一个用量告警。
- **DeepSeek。** [platform.deepseek.com](https://platform.deepseek.com/) 注册、充值、API Keys 里创建。地址 `https://api.deepseek.com/v1`。
- **Kimi。** 国内版在 [platform.moonshot.cn](https://platform.moonshot.cn/console/api-keys)，地址 `https://api.moonshot.cn/v1`；国际版在 [platform.kimi.ai](https://platform.kimi.ai/console)，地址 `https://api.moonshot.ai/v1`。两个版本的账号和 key 不通用。
- **智谱 GLM。** [open.bigmodel.cn](https://open.bigmodel.cn/usercenter/apikeys)，地址 `https://open.bigmodel.cn/api/paas/v4`。
- **硅基流动。** [cloud.siliconflow.cn](https://cloud.siliconflow.cn/account/ak)，地址 `https://api.siliconflow.cn/v1`；模型 id 带厂商前缀，例如 `deepseek-ai/DeepSeek-V4-Flash`。
- **火山方舟。** [console.volcengine.com](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey)，先在方舟里开通要用的模型，再创建 key；地址 `https://ark.cn-beijing.volces.com/api/v3`。
- **MiniMax。** 国内版 [platform.minimaxi.com](https://platform.minimaxi.com/user-center/basic-information/interface-key)，地址 `https://api.minimaxi.com/v1`；国际版地址 `https://api.minimax.io/v1`。
- **OpenRouter。** [openrouter.ai](https://openrouter.ai/) 用 Google、GitHub 或邮箱登录，*Credits* 里充值，*Keys* 里创建；key 以 `sk-or-v1-` 开头。*Settings → Limits* 可以给 key 设每月上限。
- **OpenAI。** [platform.openai.com](https://platform.openai.com/api-keys)，地址 `https://api.openai.com/v1`。
- **Anthropic。** [platform.claude.com](https://platform.claude.com/settings/keys)。nanoMuse 直接用 Anthropic 的接口，不需要兼容层。
- **Google Gemini。** [aistudio.google.com/apikey](https://aistudio.google.com/apikey)，地址 `https://generativelanguage.googleapis.com/v1beta/openai`。
- **xAI、Groq、Mistral。** 各自的控制台创建 key；地址分别是 `https://api.x.ai/v1`、`https://api.groq.com/openai/v1`、`https://api.mistral.ai/v1`。

**贴到 nanoMuse 里。**

- 手机：额度用完时卡片上的「去设置」会打开预填好的服务商表单；或者 设置 → 服务商 → 添加，选服务商，贴 key，保存。
- 网页版 / 桌面版：额度卡片上的「去设置」会打开「连接」页并选好服务商；或者 连接 → 模型，点服务商，贴 key，保存。地址已经填好。
- 自己跑的运行时：在 `config.toml` 里写 `[llm] provider = "bailian"`（表里任一服务商的 id）加 `api_key`，地址和默认模型会从目录文件里补上；画图、生成视频用另一家，就加 `[image]` / `[video]` 一段（[configuration.md](configuration.md#image-and-video)）。

保存后 nanoMuse 列出这把 key 能用的模型：对话选一个，手的模型选一个能看图的；想换形象，再到 连接 → 图像与视频模型 里选。每家的默认模型在目录文件里。

### 用你已经在付费的套餐登录

有些套餐可以直接登录使用，不用申请 key：

| 套餐 | 能做什么 | 哪里可以登录 |
|---|---|---|
| **ChatGPT**（Plus / Pro / Team） | 对话、动手 | Android、iPhone、桌面版、网页版 |
| **Claude**（Pro / Max） | 对话、动手 | Android、iPhone |
| **Kimi** | 对话、动手 | Android、iPhone（设备码登录） |
| **OpenRouter** | 对话、动手、画图 | Android、iPhone（一键登录，key 自动回到 App） |

ChatGPT 登录走的是 OpenAI 自家 Codex 的授权流程（网页版 / 桌面版：连接 → 「或者用 ChatGPT 套餐登录」；手机：设置 → 服务商 → OpenAI → 登录）。登录后只有对话和动手——Codex 这条通道没有图像和视频接口；画图和生成视频仍要配一把 key。

在终端里也可以：`nanomuse chatgpt login` 打开登录页并等浏览器回来，`nanomuse chatgpt status` 看登录的是谁、什么时候过期，`nanomuse chatgpt logout` 忘掉它；然后在 `config.toml` 里写 `[llm] provider = "chatgpt"`（不用 `base_url`、`api_key`，`model` 留空就是 `gpt-5.6-sol`）。浏览器要能访问运行时所在机器的 1455 端口；运行时在别的机器上时，把浏览器最后停在的那个地址整条复制下来，贴给命令行的提示，或者 `POST /api/chatgpt/callback {"url": …}`（[configuration.md](configuration.md#a-chatgpt-plan-instead-of-a-key)）。

**一句老实话。** OpenAI 的条款只允许在它自家的 Codex 里使用 ChatGPT 套餐；其他应用曾被切断过这条路（OpenCode，2026 年 1 月）。哪天它不能用了，API key 仍然可以。

### 服务商连不上的时候

有些网络到不了 `chatgpt.com`（DNS 不解析、连接超时、TLS 失败、返回的是一张 HTML 拦截页），有些地区 OpenAI 直接拒绝（HTTP 403 `unsupported_country_region_territory`）。这时手机上的对话不再显示 socket 原文，而是一张卡片：发生了什么（「这个网络连不上 chatgpt.com」或「OpenAI 不向这个地区提供服务」）、能帮上忙的（这台手机上的 VPN；应用自己的代理，设置 → 网络；换一个服务商、用自己的 key）、一个「重试」按钮，原始错误收在「详情」里供提 issue 用。登录失效（401）显示「ChatGPT 登录已失效」和「重新登录」；套餐这几个小时的余量用完（429 且写明 usage limit）显示「ChatGPT 套餐暂时没有余量了」、OpenAI 自己的那句话和多久后恢复；其他 429 是「同时发出的请求太多」。自己的 key 遇到同样的网络问题，卡片一样出现，只是主机名换成那家服务商的。

**设置 → 网络 → 自有服务商的 HTTP 代理**（Android 和 iPhone 都有）：主机、端口、可选的用户名和密码，默认关闭，只存在这台手机上。只有发往你用自己 key 添加的服务商和 ChatGPT 套餐的请求走它；nanoMuse Cloud、你的电脑和局域网从不经过它。页面上有一行「测试」，通过这个代理抓一次 `https://chatgpt.com/`，告诉你通没通、多少毫秒。桌面版和运行时的对应项是 `config.toml` 里的 `[llm] proxy`（[configuration.md](configuration.md#llm)）。

### 本机模型

Ollama、LM Studio、vLLM 跑在自己电脑上的模型也能用：在「连接」里选对应的预设，地址默认是本机端口（`http://127.0.0.1:11434/v1`、`:1234`、`:8000`），不需要 key。它们算「对话」；手的模型要能看图，本机跑一个多模态模型（例如 Ollama 的 `qwen3-vl`）再在「手的模型」里手填 id 即可。画图和视频需要上面表里的一家。

### 其他 OpenAI 兼容服务

任何 OpenAI 兼容接口都能填，选「自定义」：

| 字段 | 填什么 |
|---|---|
| 地址（Base URL） | 服务商给的地址，通常以 `/v1` 结尾 |
| API key | 服务商控制台里创建的 key（本机服务可以留空） |
| 模型 | 保存后从列表里选；列不出来就手填服务商文档里的模型 id |

自定义接口能做什么由你来说：nanoMuse 会把它当作对话；手的模型、图片模型、视频模型各自填了 id 才算有。

---

## English

### Where you are decides who comes first

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

### What each provider covers

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

### Making a key

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

### Sign in with a plan you already pay for

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

### When the provider cannot be reached

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
as entered and says whether it got through and in how many milliseconds. On
the desktop and the runtime the same switch is `[llm] proxy` in `config.toml`
([configuration.md](configuration.md#llm)).

### Local models

Ollama, LM Studio and vLLM on your own computer work too: pick the preset
under *Connections*; the address defaults to the local port
(`http://127.0.0.1:11434/v1`, `:1234`, `:8000`) and no key is needed. They
count as *chat*; the hands need a model that sees, so run a multimodal one
locally (Ollama's `qwen3-vl`, say) and type its id on the *Hands model* row.
Pictures and clips need one of the providers in the table.

### Any other OpenAI-compatible endpoint

Anything that speaks the OpenAI API works — choose *Custom*:

| Field | Value |
|---|---|
| Base URL | the provider's address, usually ending in `/v1` |
| API key | the key made in the provider's console (a local server may leave it empty) |
| Model | pick from the list after saving; if none appears, type the model id from the provider's docs |

What a custom endpoint covers is yours to say: nanoMuse takes it for chat, and
the hands, picture and clip models count once their ids are filled in.
