# Bring your own key · 换成自己的 key

[中文](#中文) · [English](#english)

nanoMuse is free and non-profit. The model behind it costs money, and the
developer pays for a starting allowance — ¥10 per account at the time of
writing, plus ¥5 for you and ¥5 for them each time a friend signs up with your
code (the app shows the relay's current figures). When it is gone, the quickest
way on is a key of your own.

Which provider depends on where you are:

| | Provider | Chat model | Hands model | Base URL |
|---|---|---|---|---|
| Mainland China | **Alibaba Cloud Bailian (阿里云百炼)** | `deepseek-v4.1-flash` | `qwen3.8-27b` | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| Everywhere else | **OpenRouter** | `deepseek/deepseek-v4.1-flash` | `qwen/qwen3.8-27b` | `https://openrouter.ai/api/v1` |

Bailian only signs up accounts with a mainland Chinese identity, and its
international edition (dashscope-intl) does not carry these two models. Outside
mainland China, OpenRouter is the easy way: one account, one key, international
cards, pay as you go. The other provider stays as a second option on every
client, and any OpenAI-compatible endpoint works too.

Your sign-in, your invite code and your devices are not affected: the account
stays, only the model provider changes. Nothing you say passes through nanoMuse
Cloud once your own key is in use.

---

## 中文

### 先看你在哪

| | 服务商 | 对话模型 | 手的模型 | 地址 |
|---|---|---|---|---|
| 中国大陆 | **阿里云百炼** | `deepseek-v4.1-flash` | `qwen3.8-27b` | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| 海外 | **OpenRouter** | `deepseek/deepseek-v4.1-flash` | `qwen/qwen3.8-27b` | `https://openrouter.ai/api/v1` |

百炼只给中国大陆身份注册，国际版（dashscope-intl）也没有这两个模型。海外用户用不了百炼，推荐 OpenRouter：一个账号一把 key，国际信用卡，按量付费。两家在每个客户端里都是预设，另一家始终是第二选择。

对话模型和手的模型是两个设置：对话模型在模型选择里，手的模型在「手的模型」一行（手机：设置 → Hands；网页版 / 桌面版：连接）。额度没用完时它们默认分别是 `deepseek-v4.1-flash` 和 `qwen3.8-27b`，换成自己的 key 之后也照这两个选。

### 阿里云百炼（中国大陆）

- 新账号有一段时间的免费 token；对话、画图（qwen-image）、视频（Wan）都在同一把 key 下，形象生成也能直接用。
- 国内直连，接口 OpenAI 兼容，nanoMuse 里已经预置好地址，只要贴 key。
- 注册需要阿里云账号和实名认证，海外身份注册不了。

**五步，约 2 分钟：**

1. **开通百炼。** 打开 [bailian.console.aliyun.com](https://bailian.console.aliyun.com/)，用阿里云账号登录（没有就注册一个，要实名认证）。第一次进入会提示「开通百炼服务」，点开通，不收费。
2. **创建 API key。** 进入 [API-KEY 管理页](https://bailian.console.aliyun.com/?apiKey=1)（右上角头像 → API-KEY），点「创建我的 API-KEY」，归属选默认业务空间，确定。
3. **复制 key。** 新建的 key 以 `sk-` 开头。点「查看」再「复制」。**这串字符只给 nanoMuse 用，不要发给任何人、不要贴到聊天里。**
4. **贴到 nanoMuse 里。**
   - 手机：额度用完时卡片上的「去设置」会打开预填好的「阿里云百炼」表单；或者 设置 → 服务商 → 添加 → OpenAI 类型，地址填 `https://dashscope.aliyuncs.com/compatible-mode`（勾上 `/v1`）。贴 key，保存。
   - 网页版 / 桌面版：额度卡片上的「去设置」会打开「连接」页并选好「阿里云百炼」；或者 连接 → 模型 → 「阿里云百炼」。贴 key，保存。
5. **选模型，试一句。** 保存后 nanoMuse 列出这把 key 能用的模型：对话选 `deepseek-v4.1-flash`（能看图，便宜），手的模型选 `qwen3.8-27b`；想更省，对话也可以选 `qwen3.8-flash`。回到聊天说一句，能回答就成了。想换形象，再到 连接 → 图像与视频模型 里选 `qwen-image-3.0` 和 `wan2.2-i2v-flash`。

**之后怎么算钱。** 免费额度用完后按百炼标价计费（北京地域）：`deepseek-v4.1-flash` 每百万 token 输入 ¥2 / 输出 ¥8（忙时；闲时 ¥1 / ¥4），`qwen3.8-27b` ¥3 / ¥12，`qwen3.8-flash` ¥0.8 / ¥2.7，`qwen-image-3.0` 每张 ¥0.18，`wan2.2-i2v-flash` 每秒 ¥0.10。正常聊一天几分钱。建议在百炼控制台设一个**用量告警**。nanoMuse 自己不收任何费用。

### OpenRouter（海外）

- 一个账号、一把 key，几百个模型都在后面；国际信用卡付费，按量扣。
- 不用代理，不用国内身份。
- 手机 App（Android、iPhone）可以一键登录 OpenRouter，不用手抄 key。

**四步：**

1. **注册。** 打开 [openrouter.ai](https://openrouter.ai/)，用 Google、GitHub 或邮箱登录。
2. **充值。** 右上角头像 → *Credits* → *Add Credits*，国际信用卡；先充 5 美元足够用很久。
3. **拿 key。** 头像 → *Keys* → *Create Key*，起个名（比如 nanoMuse），复制以 `sk-or-v1-` 开头的那串。**只给 nanoMuse 用，别发给任何人。**
4. **贴到 nanoMuse 里。**
   - 手机：设置 → 服务商 → 添加 → OpenRouter → 「登录」，浏览器里批准一下，key 自动回到 App，不用复制；或者把 key 贴进 OpenRouter 表单。
   - 网页版 / 桌面版：连接 → 模型 → 「OpenRouter」，贴 key，保存。地址已经填好：`https://openrouter.ai/api/v1`。

**选模型。** 对话选 `deepseek/deepseek-v4.1-flash`，手的模型选 `qwen/qwen3.8-27b`。每个模型的单价在 OpenRouter 的模型页上写着；*Settings → Limits* 可以给 key 设每月上限。

### DeepSeek 官方接口

只想要 DeepSeek 的话，可以直接用它家的接口：[platform.deepseek.com](https://platform.deepseek.com/) 注册、充值、创建 key，地址 `https://api.deepseek.com/v1`，模型选 `deepseek-v4.1-flash`。它没有图像和视频模型，形象生成要另配一家。

### 其他 OpenAI 兼容服务商

任何 OpenAI 兼容接口都能填：智谱、月之暗面、OpenAI 本身，或你自己跑的 vLLM / Ollama。通用填法：

| 字段 | 填什么 |
|---|---|
| 类型 | OpenAI（兼容） |
| 地址（Base URL） | 服务商给的地址，通常以 `/v1` 结尾，例如 `https://api.deepseek.com/v1` |
| API key | 服务商控制台里创建的 key |
| 模型 | 保存后从列表里选；列不出来就手填服务商文档里的模型 id |

网页版和桌面版的「连接」页里有常见服务商的预设，选中即填好地址，只差 key。手的模型要能看图：DeepSeek 的模型里只有 id 带 `v4.1`（或更新）、`vision`、`ocr` 的才看得见截图。

---

## English

### Where you are decides the provider

| | Provider | Chat model | Hands model | Base URL |
|---|---|---|---|---|
| Mainland China | **Alibaba Cloud Bailian (阿里云百炼)** | `deepseek-v4.1-flash` | `qwen3.8-27b` | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| Everywhere else | **OpenRouter** | `deepseek/deepseek-v4.1-flash` | `qwen/qwen3.8-27b` | `https://openrouter.ai/api/v1` |

Alibaba Cloud Bailian only signs up accounts from mainland China, and its
international edition (dashscope-intl) does not carry these two models.
Outside, OpenRouter is the easy way: one account, one key, pay as you go. Both
are presets on every client; the other one stays as the second option.

The chat model and the hands model are two settings: the chat model in the
model picker, the hands model on the *Hands model* row (phone: *Settings →
Hands*; web and desktop: *Connections*). On the free allowance they default to
`deepseek-v4.1-flash` and `qwen3.8-27b`; pick the same two under your own key.

### Alibaba Cloud Bailian (mainland China)

- A new account comes with free tokens for a while; chat, pictures (qwen-image) and video (Wan) sit under one key, so the avatar studio works too.
- Direct from China, OpenAI-compatible; nanoMuse already knows the endpoint, you only paste the key.
- Sign-up needs an Alibaba Cloud account with mainland identity verification; it does not accept overseas accounts.

**Five steps, about two minutes:**

1. **Open Bailian.** Go to [bailian.console.aliyun.com](https://bailian.console.aliyun.com/) and sign in with an Alibaba Cloud account (create one if needed; identity verification is required). On first entry accept *Enable Model Studio* — it is free.
2. **Create an API key.** Open the [API-KEY page](https://bailian.console.aliyun.com/?apiKey=1) (avatar, top right → API-KEY), click *Create my API-KEY*, keep the default workspace, confirm.
3. **Copy it.** The key starts with `sk-`. Click *View*, then *Copy*. **It is for nanoMuse only — never send it to anyone or paste it into a chat.**
4. **Paste it into nanoMuse.**
   - Phone: *Set it up* on the allowance card opens the provider form pre-filled for Bailian; or *Settings → Providers → Add → OpenAI*, base URL `https://dashscope.aliyuncs.com/compatible-mode` with `/v1` on. Paste the key, save.
   - Web / desktop: *Set it up* on the allowance card opens *Connections* with *Alibaba Cloud Bailian* chosen; or *Connections → Model → Alibaba Cloud Bailian*. Paste the key, save.
5. **Pick the models, say something.** After saving, nanoMuse lists the models the key can use: `deepseek-v4.1-flash` for chat (sees images, cheap), `qwen3.8-27b` as the hands model; `qwen3.8-flash` is the cheaper chat option. Back in the chat, one sentence answered means it works. For the avatar, choose `qwen-image-3.0` and `wan2.2-i2v-flash` under *Connections → Image & video models*.

**What it costs afterwards.** Past the free quota, Bailian bills at list price (Beijing region): `deepseek-v4.1-flash` ¥2 in / ¥8 out per million tokens in busy hours (¥1 / ¥4 off-peak), `qwen3.8-27b` ¥3 / ¥12, `qwen3.8-flash` ¥0.8 / ¥2.7, `qwen-image-3.0` ¥0.18 a picture, `wan2.2-i2v-flash` ¥0.10 a second. An ordinary day of chatting is a few fen. Set a **usage alert** in the Bailian console. nanoMuse itself charges nothing.

### OpenRouter (everywhere else)

- One account and one key in front of hundreds of models; international cards; pay as you go.
- No proxy, no mainland identity.
- The phone apps (Android, iPhone) sign in to OpenRouter with one tap — no key to copy.

**Four steps:**

1. **Sign up.** Go to [openrouter.ai](https://openrouter.ai/) and sign in with Google, GitHub or an e-mail address.
2. **Add credit.** Avatar, top right → *Credits* → *Add Credits*, with an international card; $5 lasts a long time.
3. **Make a key.** Avatar → *Keys* → *Create Key*, give it a name (nanoMuse, say), copy the string starting `sk-or-v1-`. **For nanoMuse only; never send it to anyone.**
4. **Paste it into nanoMuse.**
   - Phone: *Settings → Providers → Add → OpenRouter → Sign in* — the browser opens OpenRouter, you approve, and the key comes back to the app on its own; or paste the key into the OpenRouter form.
   - Web / desktop: *Connections → Model → OpenRouter*, paste the key, save. The address is already filled in: `https://openrouter.ai/api/v1`.

**Pick the models.** `deepseek/deepseek-v4.1-flash` for chat, `qwen/qwen3.8-27b` as the hands model. Each model's price is on its OpenRouter page; *Settings → Limits* puts a monthly cap on a key.

### DeepSeek direct

If DeepSeek is all you want, its own endpoint works: sign up, add credit and create a key at [platform.deepseek.com](https://platform.deepseek.com/), base URL `https://api.deepseek.com/v1`, model `deepseek-v4.1-flash`. DeepSeek has no image or video models, so the avatar studio needs a second provider.

### Any other OpenAI-compatible provider

Anything that speaks the OpenAI API works: Zhipu, Moonshot, OpenAI itself, or your own vLLM / Ollama. The generic fill-in:

| Field | Value |
|---|---|
| Type | OpenAI (compatible) |
| Base URL | the provider's address, usually ending in `/v1`, e.g. `https://api.deepseek.com/v1` |
| API key | the key made in the provider's console |
| Model | pick from the list after saving; if none appears, type the model id from the provider's docs |

The web and desktop *Connections* page has presets for the common providers: choose one and the address is filled in — only the key is missing. The hands model has to see pictures: of DeepSeek's models, only ids containing `v4.1` (or later), `vision` or `ocr` can read a screenshot.
