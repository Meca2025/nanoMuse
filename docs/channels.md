# Chat apps

Your nanoMuse inside the chat apps you already use: Feishu (飞书 / Lark), DingTalk
(钉钉), WeCom (企业微信) and Telegram. Write to the bot from your phone and the same
Muse answers — one conversation per chat, the reply typed out as it comes, tool work
shown as a status line, approvals answered with a word or a button. Chats you mark
*deliver here* also get what the Muse does on its own: check-ins, reminders, the result
of a background task, the question it needs you to answer.

Nothing needs a public address. Each vendor offers a long connection the bot opens from
inside your network (Telegram: long polling), so the runtime behind your router or on a
laptop is enough. The vendors' own SDKs do the socket work; they are optional extras:

```sh
pip install 'nanomuse[feishu]'      # lark-oapi
pip install 'nanomuse[dingtalk]'    # dingtalk-stream
pip install 'nanomuse[wecom]'       # wecom-aibot-sdk-python
pip install 'nanomuse[channels]'    # all three; Telegram needs nothing extra
```

The Docker image carries all of them. Without an SDK the app shows the line to install
and leaves the switch alone.

## Where to find it

* **App** — Settings → *Chat apps* (「聊天入口」). One card per app: the switch, the
  credentials, who may talk to it, the paired chats and their *deliver here* switch,
  a *Send a test message* button and the setup steps with a link to the vendor console.
* **Terminal** — `nanomuse channels status | pending | approve <code> | deny <code> |
  login feishu [--lark] | test <name>`. With `nanomuse serve` running the commands go
  through its API; otherwise they edit the files under `<data_dir>/channels/` and the
  server picks them up when it starts (or on *Reload*).
* **API** — `GET /api/channels`, `PUT /api/channels/<name>`, `POST
  /api/channels/pairing/<code>/approve|deny`, `PUT|DELETE
  /api/channels/<name>/chats/<sender>`, `POST /api/channels/<name>/test`, `POST
  /api/channels/deliver {text}`, `POST /api/channels/reload`, and for Feishu `POST
  /api/channels/feishu/login` + `GET /api/channels/feishu/login/<device_code>`.
* **config.toml** — a `[channels.<name>]` table works too, for a server set up by hand:

  ```toml
  [channels.telegram]
  enabled = true
  bot_token = "${TELEGRAM_BOT_TOKEN}"
  allow_from = ["123456789"]      # Telegram user ids that never need a code
  group_policy = "mention"        # or "open"
  ```

  What the app saves wins per field. Secrets set in the app go to the vault
  (`{{vault:CHANNEL_TELEGRAM_BOT_TOKEN}}` stays in the file) and are never shown
  again — a secret field only says whether something is set.

## Setting up each app

The console names below are as of 2026; vendors move things around.

### Feishu / Lark

The short way: in the app press **Create the bot by QR code** (or run `nanomuse
channels login feishu`, `--lark` for the international edition), scan with Feishu,
confirm, done — the App ID and Secret are saved and the channel switches on. This is
Feishu's own scan-to-create flow for personal agents; it makes an app with the bot
capability and the long-connection events already set.

By hand, at <https://open.feishu.cn/app> (Lark: <https://open.larksuite.com/app>):

1. *Create custom app* → *Add capability* → **Bot**.
2. *Permissions*: `im:message`, `im:message.p2p_msg:readonly`,
   `im:message.group_at_msg:readonly`, `im:resource` (images and files).
3. *Events & callbacks*: subscription mode **Long connection**, add
   `im.message.receive_v1`; callback mode **Long connection**, add
   `card.action.trigger` (the approval buttons).
4. *Credentials & Basic Info*: copy **App ID** and **App Secret** into the app;
   pick *feishu* or *lark*. Leave *Encrypt Key* and *Verification Token* empty unless
   you set them in the console.
5. *Version management* → create a version → publish.

Replies are interactive cards with a markdown body; while a reply streams the card is
patched in place (about once a second). A 👍 on your message means the Muse is working
on it. In groups the bot answers when it is @-mentioned.

### DingTalk

At <https://open-dev.dingtalk.com/>:

1. *Create app* (企业内部应用) → *Add capability* → **Robot** (机器人).
2. Message receive mode: **Stream** (Stream 模式). No callback URL.
3. *Credentials & Basic Info* (凭证与基础信息): copy **Client ID** (AppKey) and
   **Client Secret** (AppSecret).
4. *Permissions*: the robot's send-message scope (`qyapi_robot_sendmsg`) so a
   *deliver here* chat can be written to without a message to reply to.
5. Publish the version; add the robot to a group or find it in the address book.

DingTalk messages cannot be edited, so a reply arrives once, when it is complete.
A robot in a DingTalk group only hears messages that @ it.

### WeCom

In the WeCom admin console (企业微信管理后台) → *Security & management* → **Intelligent
robot** (智能机器人):

1. *Create robot* → **API mode** (API 模式), connection **long connection** (长连接).
2. Copy the **Bot ID** and **Secret** into the app.
3. Add the robot to the chats where it should listen, or let people find it in the
   address book.

The socket host (`openws.work.weixin.qq.com`) is added to `NO_PROXY` for the runtime
process; a corporate HTTPS proxy usually cannot carry it. Replies stream over the same
socket; proactive messages (delivery) are markdown.

### Telegram

1. In Telegram talk to **@BotFather**, send `/newbot`, copy the token into the app.
2. Direct messages work at once. For a group, add the bot to it; with BotFather's
   *Group Privacy* on (the default) it only hears @-mentions and replies to its own
   messages, which matches the *mention* policy.
3. If `api.telegram.org` is out of reach from the computer, set **Proxy**
   (`socks5://…` or `http://…`).

Replies are sent and then edited in place while they stream (Telegram's 4096-character
limit splits long ones). Approvals are two inline buttons.

## Pairing: who may talk to the bot

Anyone who finds the bot can write to it; the Muse answers only people you let in.

* The first direct message from an unknown person gets a **pairing code** (six
  letters and digits, no 0/O/1/I, good for ten minutes) and nothing else — the
  message does not reach the Muse. Approve the code under Settings → Chat apps, or
  `nanomuse channels approve <code>`. The person is told, and from then on their
  messages go through.
* **Always allowed** (`allow_from`): vendor user ids that never need a code. A lone
  `*` lets everyone in — only for a bot nobody else can reach.
* **Groups**: unknown people in a group are ignored quietly (no codes in groups). An
  approved person's group message is answered when the bot is @-mentioned
  (`group_policy = "mention"`), or on every message (`"open"`). The group is its own
  conversation; the sender's name travels with each line.
* **Remove** a paired chat in the app (or delete it from `pairing.json`); the next
  message gets a new code.

Pairings and codes live in `<data_dir>/channels/pairing.json` — the data directory,
not the workspace, so the agent's own file tools cannot change who may talk to it.

## How a chat maps to the Muse

Each chat is one conversation of the agent, with the id
`channel-<app>-<chat id>` and the title *Feishu · Ann* / *Telegram · Team* in the app's
drawer. A message from the chat goes through the same entry point as a message typed in
the app, so everything else — memory, goals, the Sentinel, skills — is the same Muse.
Attachments (photos, files, voice notes) are saved under the workspace's `attachments/`
and attached to the message.

While the run works:

* text streams into the reply as the model writes (where the vendor allows edits);
* a running tool shows as a short italic line in the same message ("Searching the
  web", 正在运行命令) until text replaces it;
* an **approval** the Sentinel asks for arrives in the chat: a card with 允许 / 拒绝
  buttons on Feishu and Telegram, a message asking for the word on DingTalk and WeCom.
  `allow`, `yes`, `ok`, `允许`, `同意` approve once; `deny`, `no`, `拒绝`, `不行` refuse.
  The decision is the same as pressing the card in the app;
* files the run produced (an artifact event) are sent when the run ends;
* a **question** the Muse asks is delivered, and your next line answers it.

Language follows `agent.language`: `zh` for Chinese lines, `en` for English, `auto` for
both.

## Deliver here

Switch *Deliver here* on for a paired chat and it also receives what the Muse does
without being asked — the same events the phone app turns into notifications: a
background run's final words (quiet ones excepted), an approval that is waiting (answer
it from the chat), a question that needs you. One Muse may deliver to several chats;
each decides for itself. `POST /api/channels/deliver {"text": …}` sends a line to all
of them — useful from a script or a reminder.

## Security

* Secrets go to the vault and never come back out of the API; the settings file holds
  placeholders. Logs carry the vendor's error text, not credentials.
* Only paired or allow-listed people reach the Muse; unknown people get a code, or
  silence in a group. A button press on an approval card is honoured only from a
  paired person.
* An approval from a chat is a *once* decision with the reason "from Feishu" (etc.) —
  nothing is remembered from a chat.
* The channel data lives in the data directory, outside the agent's reach.
* The connections are outbound only; no port is opened and no public URL is involved.

## Troubleshooting

| What you see | What it means |
|---|---|
| **Not installed** | the SDK is missing on the machine running nanoMuse: run the line shown (`pip install 'nanomuse[feishu]'`), then switch the channel on again |
| **Needs settings** | a required field is empty; the card names it |
| **Error** with the vendor's words | the credentials were refused or the vendor is unreachable; fix and switch off/on, or *Save* again |
| the bot does not answer in a group | the group policy is *mention* and the bot was not @-mentioned; or the sender is not paired (groups never show codes) |
| Feishu replies but no reaction / no card buttons | missing `im:message.group_at_msg:readonly` / `im:resource`, or `card.action.trigger` is not on the long connection |
| Feishu: "app secret invalid" | the App Secret was regenerated in the console; paste the new one |
| DingTalk connects but gets nothing | the robot's receive mode is not *Stream*, or the version was not published |
| WeCom: connection errors behind a proxy | the socket bypasses `HTTPS_PROXY`; the host must be reachable directly |
| Telegram: `Conflict: terminated by other getUpdates request` | the same token is polled from two places (another runtime, or a webhook); use one |
| codes keep coming back | approve one within ten minutes; `nanomuse channels pending` lists them |
| `nanomuse channels …` says the server refused the token | `server.token` in config.toml differs from the running server's; or run it with the same `--config` |

`nanomuse channels status --json` prints the same view the app gets.

---

## 聊天入口（简体中文）

把 nanoMuse 放进你已经在用的聊天软件：飞书 / Lark、钉钉、企业微信、Telegram。在手机上
给机器人发消息，回答的就是同一个 Muse——每个聊天对应一个会话，回复边写边发回来，工具
在跑时显示一行状态，审批用一个词或一个按钮回答。开了「推送到这里」的聊天还会收到 Muse
主动做的事：问候、提醒、后台任务的结果、需要你回答的问题。

不需要公网地址。每家都提供从内网主动发起的长连接（Telegram 是长轮询），家里路由器后面
或一台笔记本上的运行时就够了。各家 SDK 是可选依赖：`pip install 'nanomuse[channels]'`
装齐三家，Telegram 不需要额外安装。Docker 镜像已经带全。

**在哪里**：应用的「设置 → 聊天入口」；终端 `nanomuse channels status | pending |
approve <配对码> | deny <配对码> | login feishu [--lark] | test <名称>`；也可以在
`config.toml` 写 `[channels.<名称>]`。密钥进保险库，接口不回显。

**各家设置**：
- 飞书：最快的是应用里按「扫码创建机器人」（或 `nanomuse channels login feishu`），
  扫码确认即可。手动的话在开放平台创建自建应用 → 添加「机器人」→ 权限 `im:message`、
  `im:message.p2p_msg:readonly`、`im:message.group_at_msg:readonly`、`im:resource`
  → 事件与回调都选「长连接」，添加 `im.message.receive_v1` 和 `card.action.trigger`
  → 复制 App ID / App Secret → 发布版本。回复是可交互卡片，流式时原地更新；👍 表示
  在处理；群里 @ 它才回答。
- 钉钉：开放平台创建企业内部应用 → 添加「机器人」→ 消息接收模式选「Stream」→ 复制
  Client ID / Client Secret → 加上机器人发消息权限 → 发布。钉钉消息不能编辑，回复在写
  完后一次发出。
- 企业微信：管理后台「智能机器人」→ 创建 API 模式、长连接的机器人 → 复制 Bot ID 和
  Secret → 把机器人加进聊天。长连接主机已加入 `NO_PROXY`。
- Telegram：找 @BotFather 发 `/newbot`，复制 token。群聊需要先拉进群；连不上
  `api.telegram.org` 就填代理。

**配对**：陌生人第一次私聊只会收到一个 6 位配对码（10 分钟有效），消息不会到 Muse；
在应用里通过或运行 `nanomuse channels approve <配对码>`。「免配对的 ID」里的人不需要
配对码，单独一个 `*` 放行所有人。群里的陌生人直接忽略，不发配对码；已配对的人在群里
默认被 @ 才回答（`mention`），也可以改成每条都回（`open`）。配对信息存在
`<data_dir>/channels/pairing.json`，不在工作区，智能体自己的文件工具改不到。

**审批与推送**：Sentinel 要确认的操作会发到聊天里——飞书和 Telegram 是带「允许 / 拒绝」
按钮的卡片，钉钉和企业微信是一条消息，回复「允许」「同意」或「拒绝」「不行」即可，
效果和在应用里按卡片一样，只生效一次。开了「推送到这里」的聊天还会收到后台任务的最后
一句、等待中的审批、Muse 要问你的问题（直接回复就是答案）。
`POST /api/channels/deliver` 可以给所有这类聊天发一行字。

**排错**：「未安装」→ 在运行 nanoMuse 的机器上装对应 extra 再开；「还缺设置」→ 卡片
上写了缺什么；「出错」→ 显示的是厂商原话，改好后关掉再开；群里不回 → 没 @ 或发送者没
配对；Telegram 报 `Conflict` → 同一个 token 在两处轮询。`nanomuse channels status --json`
输出和应用看到的一样。
