<p align="center">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/assets/brand/nanomuse-cover.png" alt="nanoMuse — an open-source personal agent for every device you own">
</p>

<p align="center">
  <a href="https://github.com/nano-muse/nanoMuse/blob/main/README.md">English</a> |
  <a href="https://github.com/nano-muse/nanoMuse/blob/main/docs/readme/README_zh.md">简体中文</a> |
  <a href="https://github.com/nano-muse/nanoMuse/blob/main/docs/readme/README_zh-TW.md">繁體中文</a> |
  <a href="https://github.com/nano-muse/nanoMuse/blob/main/docs/readme/README_es.md">Español</a> |
  <a href="https://github.com/nano-muse/nanoMuse/blob/main/docs/readme/README_fr.md">Français</a> |
  <a href="https://github.com/nano-muse/nanoMuse/blob/main/docs/readme/README_id.md">Bahasa Indonesia</a> |
  <a href="https://github.com/nano-muse/nanoMuse/blob/main/docs/readme/README_ja.md">日本語</a> |
  <a href="https://github.com/nano-muse/nanoMuse/blob/main/docs/readme/README_ko.md">한국어</a> |
  <a href="https://github.com/nano-muse/nanoMuse/blob/main/docs/readme/README_ru.md">Русский</a> |
  <a href="https://github.com/nano-muse/nanoMuse/blob/main/docs/readme/README_vi.md">Tiếng Việt</a>
</p>

<p align="center">
  <a href="https://github.com/nano-muse/nanoMuse/stargazers"><img src="https://img.shields.io/github/stars/nano-muse/nanoMuse?style=flat&label=stars" alt="GitHub stars"></a>
  <a href="https://github.com/nano-muse/nanoMuse/releases"><img src="https://img.shields.io/github/downloads/nano-muse/nanoMuse/total?label=downloads" alt="下载量"></a>
  <a href="https://github.com/nano-muse/nanoMuse/actions/workflows/ci.yml"><img src="https://github.com/nano-muse/nanoMuse/actions/workflows/ci.yml/badge.svg?branch=main" alt="Test Suite"></a>
  <a href="https://nanomuse.cn/web/"><img src="https://img.shields.io/badge/%E5%9C%A8%E7%BA%BF%E4%BD%93%E9%AA%8C-nanomuse.cn%2Fweb-5B4EE6" alt="在线体验"></a>
  <a href="https://nanomuse.cn/"><img src="https://img.shields.io/badge/%E7%BD%91%E7%AB%99-nanomuse.cn-0a66e4" alt="网站"></a>
  <a href="https://github.com/nano-muse/nanoMuse/blob/main/LICENSE"><img src="https://img.shields.io/github/license/nano-muse/nanoMuse?label=license" alt="GPL-3.0-or-later"></a>
</p>

> [!IMPORTANT]
> **免费、开源、非盈利。** 手机号或邮箱登录后有一份起始额度，钱是开发者出的；剩多少、怎么加，账号页里有数。用完可以填自己的 key：国内用阿里云百炼，海外用 OpenRouter（[教程](../own-key.md)）。消息默认不存服务器，数据不卖（[隐私政策](https://nanomuse.cn/privacy/)）；账号想删就删。**[在线体验](https://nanomuse.cn/web/)**，或者[下载 App](https://github.com/nano-muse/nanoMuse/releases/latest)。

nanoMuse 是一个开源的个人智能体，面向你的每一台设备。和 Meta 的 [Muse](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/) 一样，它是一个有名字、有自己形象的智能体：不只回答问题，而是动手做事；App 关掉了也继续干活；记得你；遇到无法撤销的操作会先停下来问你。Android App 把整个智能体跑在**手机上**：Linux 根文件系统、shell、浏览器、MCP、技能和定时任务都在 APK 里，模型由你自己带。它有一双手，能去碰那些没有 API 的 App——经你允许后，直接操作手机屏幕；也能伸到你的电脑上：在手机上说一句，事情在电脑上办好。桌面 App、网页版和 iPhone App（TestFlight）也已经有了；接下来是眼镜。用自己的 key，或者领一份开放中继的起始额度；GPL-3.0——也是一个底子，可以在它上面做出你自己的 Muse。

<p align="center">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/docs/avatar-moods.png" width="88%" alt="同一只小龙的五种状态：休息、工作、等你、开心、抱歉">
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/docs/screenshots/zh/chat-approval.png" width="23%" alt="对话：删工作区里的东西之前停下来问你——只此一次、本次对话、对工作区总是允许，或者拒绝">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/docs/screenshots/zh/feed.png" width="23%" alt="动态：今天早上写给你的几条">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/docs/screenshots/zh/goals.png" width="23%" alt="目标：按时检查，还有例程">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/docs/screenshots/zh/avatar.png" width="23%" alt="形象：描述一句，你的图像模型来画，你挑一张喜欢的">
</p>

## 动态

- **2026-10-05 · 0.1.35「Accord」** — iPhone 和桌面端按手机的设计逐屏对齐：每个房间都有 Muse 顶栏，设置是同样的卡片、同样的顺序，画出来的形象有了动态短片（iPhone 现在也会生成；桌面端也是），桌面端有了手机的初次使用和第一次对话——应用先开口、问你怎么称呼，不再弹选择题。Mac 上发现的三个桌面端问题修了：点形象没反应、点子是空的、启动页有小龙。什么时候提醒 star 现在是中转下发的策略（第一次对话里绝不提醒；第 3 个任务、用满一周、达成一个目标……），不用更新软件就能改；每个端都把已安装版本和最新版本并排显示。还没定的事在 [docs/parity.md](../parity.md)。[发布说明](https://github.com/nano-muse/nanoMuse/releases/tag/v0.1.35)。
- **2026-10-05 · 0.1.34「Turns」** — 「手」碰到登录、验证码、付款、人机验证时，智能体把页面交给你，然后*等着*——现在桌面端和网页版也这样，和手机一样——你在哪就在哪点「完成」：实时舞台、胶囊、浏览器视图、聊天；同样这些地方也能直接回答「允许一次 / 拒绝」。你的 nanoMuse 能在飞书、钉钉、企业微信和 Telegram 里回复（「设置 → 聊天入口」）。两个模型设置——对话用 `deepseek-v4.1-flash`，动手用 `qwen3.8-27b`；账号知道你在哪，额度用完时相应指向百炼或 OpenRouter；连接跟着账号走，但不带凭据；macOS 上，「手」可以只在一个窗口里干活，鼠标还归你。iPhone 有了智能体页面、聊天里换形象、带调度器的目标 / 动态 / 点子、初次使用和 iPad；桌面端同样，外加真正的版本号和检查更新。各处的文案更平实。还没补齐的在 [docs/parity.md](../parity.md)。[发布说明](https://github.com/nano-muse/nanoMuse/releases/tag/v0.1.34)。
- **2026-10-04 · 0.1.33「Steps」** — 头像下面那行字说的是这一步*本身*，用模型自己的话（「打开携程网站」），各端一致：每个工具都带 `step`。iPhone 有了 Muse 外壳——表情、状态行、抽屉、房间、形象工坊、连接器、数据控制、Reach。Android 上需要本人的页面会交给你（`hand_over`、「轮到你了」、「完成，继续」），「手」的审批直接在胶囊上回答。八个不会自动注册客户端的连接器会带你建自己的 OAuth 应用；新增六个服务（共 75 个）。桌面端记住设置（端口固定）、头像菜单可见、轨迹视图有出口、权限实时回读、舞台可拖动缩放、全黑截图变成带解法的错误、`?token=` 被拒绝。还没补齐的在 [docs/parity.md](../parity.md)。[发布说明](https://github.com/nano-muse/nanoMuse/releases/tag/v0.1.33)。
- **2026-10-04 · 0.1.32「Union」** — 四个客户端拉齐到各自能力的并集。桌面端和 iPhone 有了完整的账号页（以元计的额度和用完时的几条路、邀请码、用量、密码、设备、时间线、注销）；桌面端约七十个连接器的目录到了手机上，OAuth 登录在手机上完成；每个端的执行步骤默认关闭、状态行只说正在做什么；三个时机的 star 提示；数字来自中继（nanoMuse Cloud 0.15 在运行时设置额度）；iOS 能用密码和邀请码登录、开始页上有「登录——免费」，已上 TestFlight。还没补齐的在 [docs/parity.md](../parity.md)。[发布说明](https://github.com/nano-muse/nanoMuse/releases/tag/v0.1.32)。
- **2026-10-03 · 0.1.31「Locks」** — 0.1.30 之后那轮全面排查留下的 27 条待决项，逐条定了、做了。令牌不再出现在任何网址里：WebSocket 在第一帧里收令牌，内嵌文件和截图走短时效的签名链接，配对链接把令牌放在片段里。被远程控制的设备先同意；读别的设备上的文件要问；「本次对话」成了各端统一的中档范围；在聊天应用里按 Enter 和点「发送」一样要审批；编程 CLI 只拿到清洗过的环境变量；MCP 桥接的 `confirmed` 必须是宿主签的票。nanoMuse Cloud 按请求预留额度、限制同时处理的请求数、限制 hub 帧速率，并每十分钟自检一次；展示站只为主人唤醒留存的 Muse，用会话 key 启动容器，钉住自带 key 的服务商地址，通过收窄的代理访问 Docker。[发布说明](https://github.com/nano-muse/nanoMuse/releases/tag/v0.1.31)。
- **2026-10-03 · 0.1.30「Rooms」** — 桌面端只剩一个，建在 DeepSeek Harness 上：Windows、macOS、Linux 的 nanoMuse Desktop 直接覆盖安装旧版，并接管 nanoMuse Harness 的数据。Muse 桌面版的四个房间——动态、点子、目标、资源库——上了图标栏，由宿主保存、智能体来写；屏中屏：智能体操作哪块屏幕，就在聊天上方小窗里看着它做，带说明和「接管」；记忆加上 Muse 的导入页；形象工坊，四个候选一格格挑；Muse 剩下的设置分页——带快速唤起的应用行为、连接器、文件访问、听写、权限、带下载与重置的数据控制——以及会自动截图的问题反馈。Android 上在设置里换的模型会立刻用到已经打开的聊天。[发布说明](https://github.com/nano-muse/nanoMuse/releases/tag/v0.1.30)。
- **2026-10-03 · 0.1.29「Likeness」** — nanoMuse Harness 按 Muse 桌面版的样子一屏一屏重做：整窗的首次启动（欢迎 → 手机号或邮箱登录 → 验证码 → 一张一张卡片请求权限 → 就绪）、带主要聊天和旁聊的会话列表、钉在对话上方的形象和名字加状态与「停止」、胶囊形输入框、Muse 式的权限卡、聊天旁边带审批记录的个人面板、按 Muse 分页的设置；macOS 上窗口没有标题栏。macOS 安装包重新能打出来了。[发布说明](https://github.com/nano-muse/nanoMuse/releases/tag/v0.1.29)。
- **2026-10-03 · 0.1.28「Harness」** — DeepSeek Harness 版桌面端做成了安装包：Windows、macOS、Linux 三个平台的 nanoMuse Harness，harness、nanoMuse 插件包和负责「手」的运行时都在里面，不用先装任何东西；运营者页面上的每个地址都用离线数据库标出国家、省份和城市，账号、登录和访客按地区汇总；中继逐个验证 catalog 模型的能力，不再看名字猜；Android App 里选的模型会一直是它，「手」也用它；手机任务不再因断线而失败，网页应用不再向已结束的会话重连；还带翻译腔的中文改自然了。[发布说明](https://github.com/nano-muse/nanoMuse/releases/tag/v0.1.28)。
- **2026-10-02 · 0.1.27「Ledger」** — 中继保存你哪些对话，由一个开关说了算：每个 App 的「设置 → 数据控制」取代共创计划（邀请改为双方各得 ¥5）；会员从 Cloud key 下的模型列表里选，不用手敲 id；运营者的页面看得到每一条——谁从哪儿、用什么登录，每次请求是什么，演示站的访客也在——隐私政策写明记了什么；DeepSeek Harness 版桌面端以预览发布（`nanoMuse-Harness-0.1.27.tgz`）；Android 单元测试重新能编译。[发布说明](https://github.com/nano-muse/nanoMuse/releases/tag/v0.1.27)。
- **2026-10-02 · 0.1.26「Window」** — 浏览器里的手机取代了网页版：[nanomuse.cn/web](https://nanomuse.cn/web/) 打开是一台模拟手机，里面有一个你自己的 Muse，用的是 DeepSeek V4 Pro；体验前先登录 nanoMuse Cloud（这个账号在 App 里同样能用），页面上明说这是演示、App 在哪里下载；桌面版的布局向 Muse 看齐——图标栏、旁边的对话列表、左侧分节的设置——加上快速对话快捷键、「开机自动启动」，开发者的那一面收进一个开关；README 多了「现在走到哪儿了」一节，十种语言放在 `docs/readme/`；Linux 桌面版恢复可用，Windows 上拦截本机回环的机器会被明确告知。[发布说明](https://github.com/nano-muse/nanoMuse/releases/tag/v0.1.26)。
- **2026-10-01 · 0.1.25「Mirror」** — 名字和形象跟着账号走：在任一设备改名或换形象，其他设备片刻之后就一样（中继 0.7）；桌面版操作电脑时屏幕顶部有「停止」；网页和桌面版的形象工坊有手机上那七种画风；所有界面默认浅色，「外观」里可选；运行时先开端口再启动其余部分，桌面壳能分清启动慢、`config.toml` 有错和 glibc 太旧；macOS 运行时用自带的证书链验证中继，电脑不再显示「被拒绝」；登录页适配横屏窗口；注册后第三步就能填自己的 key，设置里也有入口；生图在中继排队重试而不是报 429；每个页面的字都少了。[发布说明](../releases/v0.1.25.md)。
- **2026-10-01 · 0.1.24「Signal」** — 手机号在每个平台都能登录（验证码走短信；设过密码两者都能用）；网页和桌面版的形象动起来了——小龙的四段短片，工作室在有视频模型时也给新形象做短片；电脑只有登录这一种接入方式，局域网脚本去掉，电脑不在时手机会说明自己登的是哪个账号；登录了账号但没配 key 的运行时自动用中继；启动慢的时候两边都会说走到哪一步；Linux 运行时兼容 glibc 2.31；Hands 关着也找得到；门面更清爽，下载默认走 GitHub，nanomuse.cn/web 多了密码登录。[发布说明](../releases/v0.1.24.md)。
- **2026-09-30 · 0.1.23「Welcome」** — 正式介绍给大家之前的一版：一份不会归零的额度（有多少、怎么增加，账号页里写得清楚），用完之后有三条路，配自己的 key 有一步步的教程；新账号之后的两个小步骤；网页和桌面版的形象工坊；真正像桌面软件的桌面版；电脑登同一个账号即接入；国内可达的下载镜像 nanomuse.cn/dl；管理后台里不存地址的官网访问与下载统计；Discussions 开放。[发布说明](../releases/v0.1.23.md)。
- **2026-09-30 · 0.1.22「Commons」** — 免费 / 开源 / 非盈利的说明放到每个地方的最前面；每天一份额度，图片和视频模型便宜五倍，换形象之前先看花费；邀请朋友能多得额度和视频；邮箱登录；去掉打电话，网页和桌面版换回麦克风；「贡献对话」默认关闭，用于社区自己训练的模型；桌面版在 macOS 和 Windows 上装得上了；舞台四周的流光。[发布说明](../releases/v0.1.22.md)。
- **2026-09-30 · 0.1.21「Footing」** — 没有新功能；把运行时、中继、网页 App、桌面版、手机版和文档都过了一遍。出错只说一句话，细节收起来；nanoMuse Cloud 作为一个有名字的模型直接可选；被拒的请求、重试的视频只算一次；中继的管理员令牌恒定时间比较、图片只从服务商域名取；手机上配对电脑的令牌进加密存储、不进备份；网页 App 会显示正在连接、能重试、发失败保留草稿；桌面版会拉起停掉的运行时，多了「关于」和「检查更新」；用 `pipx`/Docker 跑的运行时会提示新版本；文档写的是你真正下载的那个 App。[发布说明](../releases/v0.1.21.md)。
- **2026-09-30 · 0.1.20「Presence」** — 给你的 Muse 打个电话，语音或开着摄像头，你还没说完它就用自己的声音接上；电脑上 Cursor、Codex、Claude Code 的会话，在手机、浏览器或另一台电脑上都能看、都能指挥；每个 App 都从登录开始，有密码、登录记录和历史，用量按类型和按模型统计；网页、桌面、控制台和管理后台用上手机版的那套设计，Hands 干活时盖在屏幕上的舞台更细了。[发布说明](../releases/v0.1.20.md)。
- **2026-09-30 · 0.1.19「Ensemble」** — 每一台设备，以及一台都没有时的浏览器：Windows、macOS、Linux 的桌面 App，形状和手机版一样，运行时打包在里面（形象、对话、设备、审批、在电脑屏幕上的 Hands 和盖在上面的舞台、全局「停止」）；电脑双向接入 hub，手机和电脑可以互相拜托，在一台上发起的审批在你手里的那台上回答；还有 **nanoMuse 网页版** [nanomuse.cn/web](https://nanomuse.cn/web/)——用邮箱或手机验证码登录，就有一台属于你的 nanoMuse 跑在项目的服务器上，什么都不用装。[发布说明](../releases/v0.1.19.md)。
- **2026-09-29 · 0.1.18「Open」** — 注册向所有人开放：一个邮箱、一个验证码，每天约 ¥25 的模型用量，免费（社区成员不限量）。每次请求的花费在 App 和管理后台里以 ¥ 和 $ 显示。全新的首次启动流程——欢迎页、上面这段说明、邮箱登录优先、一开始就引导开启 Hands 所需权限（可跳过）、然后是第一次对话。授权分成三个等级；付款可以对某一个应用「记住」，需要验证锁屏，「设置 → 权限」按等级列出你记住的所有授权。Hands 不再有 25 步的上限。没有声明模态的模型（qwen3.8-27b）不再说自己「看不了图」。[发布说明](../releases/v0.1.18.md)。
- **2026-09-26 · 0.1.16「Palette」** — 图片与视频模型从你的 key 能用的列表里选；在百炼上通过原生接口画图；MiniMax-H3 之外加入 Wan 视频模型。[说明](../releases/v0.1.16.md)。
- **2026-09-25 · 0.1.12 – 0.1.15** — **Hands**：把手机屏幕当成一只手，全程有胶囊和「停止」；**Reach**：用手机驱动你的电脑；**Stage**：看得见的操作过程。[说明](../releases)。

更早的版本见[下方表格](#版本)和 [CHANGELOG](../../CHANGELOG.md)。

## 为什么是 nanoMuse

这个项目由四件事定义。

| | |
|---|---|
| **Muse 风格** | 一个智能体，而不是一堆工具：有名字、有自己的形象，第一次见面先聊一聊，每天有写给你的动态，目标在后台持续推进，记忆能看也能改，无法撤销的操作前先问你。 |
| **完全开源** | 整个仓库 GPL-3.0-or-later。没有闭源组件，不强制账号或服务器，也不绑定任何模型——可选的 nanoMuse Cloud 中继也在仓库里，谁都可以自己搭一个；每个版本都从对应的 tag 构建，手动安装。Muse、豆包、千问是别人给你用的产品；nanoMuse 是你自己拥有的——也是做一个属于你自己的 Muse 的底子：改名字、换形象、重写性格、接上自己的模型和工具。 |
| **任何 App，有没有 API 都行** | 国内日常用的 App，大多从来没有 API。智能体会顺着一把梯子往上试：先是技能、CLI 或 MCP 服务，再是用你的登录态抓一页，再是应用内浏览器，最后在你允许之后直接操作设备屏幕，像你一样看、一样点——付款、发送、删除前照样要经你审批。默认关闭。 |
| **多端协同** | 一个智能体，你的每台设备都是它的一双手、一个入口：在手机上说一句，事情在电脑上办好；对眼镜说，两边一起办。手机操作电脑、桌面 App、网页版和 iPhone App 都已经能用；接下来是眼镜。 |

和 Muse、以及 App 所基于的运行时 OpenMinis 有什么区别：[见下](#和-museopenminis-的对比)。计划和理由：[docs/roadmap.md](../roadmap.md)。

## 安装

什么都不用装就能先看一眼：[nanomuse.cn/web](https://nanomuse.cn/web/) 打开是浏览器里的一台模拟手机，里面有一个你自己的 nanoMuse，用手机号或邮箱收个验证码登录就能试——这是演示，和 App 差得不少；想要完整体验，装下面的手机 App 和桌面版，登同一个账号。想装在自己的设备上——[下载页](https://nanomuse.cn/#download)：Android APK、Windows / macOS / Linux 的桌面 App（`nanoMuse-Desktop-<版本>-…`）、终端版（`nanomuse-desktop-terminal-<版本>-…`），或者用 Python 3.11+ 执行 `pipx install "git+https://github.com/nano-muse/nanoMuse"`；实测在国内直接从 GitHub 下载也是最快的；万一下不动，同样的文件在项目的备用镜像 [nanomuse.cn/dl](https://nanomuse.cn/dl/)（发布后十五分钟内同步，SHA-256 核对过）；它们怎么连在一起，见 [docs/desktop.md](../desktop.md) 和 [docs/every-device.md](../every-device.md)。手机上：

1. 从[最新版本](https://github.com/nano-muse/nanoMuse/releases/latest)下载 `nanoMuse-<版本>-arm64.apk`——Android 8.0 以上的 64 位手机。想校验就 `sha256sum -c nanoMuse-<版本>-arm64.apk.sha256`。
2. 打开安装。Android 会问一次是否允许；每个版本都用同一把签名，直接覆盖安装升级，数据不丢。
3. 接入模型。「登录，免费开始」：手机号收一条短信，或者邮箱收一个验证码，就有 [nanoMuse 云](../cloud.md)的免费额度——不用配 key，不用付钱；还剩多少、怎么增加，账号页里写得清楚。对话模型是 `deepseek-v4.1-flash`，手用 `qwen3.8-27b`，两个是分开的设置。用完可以换自己的 key：国内用[阿里云百炼](../own-key.md)，海外用 [OpenRouter](../own-key.md)（百炼不给海外身份注册），任何 OpenAI 兼容接口，或者 App 自带的 OAuth 登录。接着是让它操作手机所需的两项权限（可跳过），然后是第一次对话：它会问你叫什么，并给自己起名字。
4. 可选——「设置 → 图像与视频模型」：图像模型（阿里云百炼的 qwen-image-3.0、gpt-image-1，或任何有 OpenAI images 接口的服务商）让它能换形象、画图；视频模型（百炼上的 wan2.2-i2v-flash）让形象动起来。Muse 这两样是官方自带的，nanoMuse 用你自己的，缺哪个它会开口告诉你。

App 会到本仓库的 Releases 检查更新；桌面端的版本号在「设置 → 关于」里，旁边有「检查更新」。每个版本的说明在 [docs/releases/](../releases) 和 [CHANGELOG](../../CHANGELOG.md)。

## 能做什么

| | |
|---|---|
| **动手做事** | Linux shell、浏览器、MCP 服务、[Agent Skills](https://agentskills.io) 格式的技能；打开 Hands 后，还能通过屏幕操作手机上的 App：看一张截图、做一步、再看一张，先试 API 再上屏幕，登录由你接管，审批一样不少（0.1.12）。用哪只手它自己挑，每一步都是一张能点开的卡片。页面需要你本人——登录、验证码——它会停下来交给你，点「完成」继续；手机、桌面、网页都一样。macOS 上「手」可以只操作某一个应用的窗口、用自己的事件，你的鼠标还是你的；每个应用第一次会问你。 |
| **关键处先问** | 删除、发送、付款前先停下来问你——shell 里、浏览器里，以及 Hands 在手机屏幕上点按时都一样——范围由你定：只此一次、本次对话，或对这个收件人 / 域名 / 目录一直允许，在「权限」里随时可以撤销。密码和验证码永远由你自己输入。桌面端的「允许一次 / 拒绝」就在舞台上，手机上在胶囊上——在哪就在哪答，不用切回 App。 |
| **在你常用的地方** | 在飞书、钉钉、企业微信或 Telegram 里直接和你的 Muse 说话：机器人住在聊天软件里，第一条消息用配对码认人，就在那儿回答你（[docs/channels.md](../channels.md)）。在一台设备上连好的服务，其他设备会显示「已在你的 Mac 上连接——在这台上登录即可使用」；凭证留在登录的那台设备上。 |
| **一直在干** | 目标在对话里定下来，之后在各自的会话里按时检查；例程在 App 关着时照样跑；操作手机时屏幕不会熄灭；到 200 步会问你「继续？」，而不是草草收尾。 |
| **写给你的动态** | 每天早上三到六条短帖，来自它对你的了解和你让它留意的事，做成卡片：可以点赞、在旁聊里讨论，也可以删除。说一句话就能调整方向。 |
| **记得你** | 它是谁（`SOUL.md`）、了解你什么（`USER.md`）、记住了什么（`GLOBAL.md` 和日记）、什么时候醒来（`HEARTBEAT.md`），都是 App 里能看、能改的文件。别的助手对你的记忆，用「导入记忆」贴过来就行。 |
| **有自己的形象** | 一句话描述；你的图像模型来画；你挑一张喜欢的。App 再给它摆出每种状态的姿势——工作、等你、开心、抱歉——它会跟着智能体正在做的事呼吸、点头、歪头、跳一下、抖一下；设了视频模型，每个状态是一段循环短片。默认是一只奶黄色的小龙，静态图和短片都内置。 |
| **点子与资源库** | 从目标和记忆里冒出来的、接下来可以问的事；以及它做出来的所有东西，都带预览。 |

以上这些都跑在手机上；OpenMinis 原有的其他部分——终端、应用内浏览器、MCP 与技能管理、模型组、token 用量、无障碍执行器、共享文件夹——都保留着，入口还在原来的菜单里。

## 怎么工作

App 是修改过的 [OpenMinis](https://github.com/OpenMinis/OpenMinis) 1.13：一个完整的端侧智能体——[proot](https://github.com/nano-muse/proot) 下的 Alpine Linux、shell、WebView 浏览器、MCP、技能、定时任务、无障碍执行器、任何 OpenAI 兼容模型——用 `git subtree` 放进 [`android/`](../../android)，上游版本仍能合并。nanoMuse 加的东西都在 `io.github.nanomuse.*`：

| 包 | 内容 |
|---|---|
| `ui/home`、`ui/header` | 首页外壳：一条主聊天、抽屉里的旁聊、动态 · 点子 · 目标 · 资源库底栏，以及页头——形象、名字胶囊、状态行 |
| `guard` | `ShellGuard` 与 `BrowserGuard` 给命令和页面动作分类；`RiskGate` 拦下工具调用并弹出审批卡；授权按范围记住 |
| `goals`、`ideas`、`library` | 目标是带计划和检查的定时会话；点子来自记忆和目标；资源库是它写出来的东西 |
| `feed`、`sysfiles` | 每天早上把 ` ```nanomuse-feed ` 段写进 `minis-global/nanomuse/feed/` 的例程、卡片、那句指示；系统文件页和记忆导入 |
| `avatar`、`ui/avatar` | 架在 OpenMinis 图像接口（`images/generations`、`images/edits`、DashScope 原生编辑）上的 `ImageGen`、形象工坊、`AvatarStore`，以及会动的 `AgentAvatar` |
| `status` | 两级状态（形象下面是工具标题，卡片上是动作 chips）、`KeepAwake`、每个步骤的最后一帧浏览器画面 |
| `cloud`、`ui/cloud` | `NanoMuseCloud`：对着 [`cloud/`](../../cloud) 里的中继用手机号/邮箱验证码注册，配置成一个普通的 OpenAI 兼容服务商；登录页和账号页（[docs/cloud.md](../cloud.md)） |

改到上游文件的地方都标着 `// nanoMuse:`；每次 subtree 拉取之后 `scripts/rebrand.py` 重新套一遍品牌。从源码构建见 [CONTRIBUTING.md](../../CONTRIBUTING.md)。你的消息只发给你配置的模型——走中继时也只是转发，不会存下来；文件、记忆和形象图片都在 App 的私有存储里。

## 版本

按小版本逐个发布，每个都是一个 GitHub release 加一个 APK。计划和理由见 [docs/roadmap.md](../roadmap.md)。

| 版本 | 代号 | 加了什么 |
|---|---|---|
| [0.1.1](https://github.com/nano-muse/nanoMuse/releases/tag/v0.1.1) | Foundation | OpenMinis 变成 nanoMuse：图标、名字、品牌色、关于 / 反馈 / 更新源、GPL 声明、一把签名 |
| [0.1.2](https://github.com/nano-muse/nanoMuse/releases/tag/v0.1.2) | Identity | 小熊猫和 Muse 风格的页头；第一次对话里给它起名；每条通知都带名字和脸 |
| [0.1.3](https://github.com/nano-muse/nanoMuse/releases/tag/v0.1.3) | Home | 打开就是对话而不是列表；旁聊在抽屉里；点子、目标、资源库；目标在对话里定、按时检查 |
| [0.1.4](https://github.com/nano-muse/nanoMuse/releases/tag/v0.1.4) | Guardrails | 删除、发送、付款前带范围的审批；密码永远由你输 |
| [0.1.5](https://github.com/nano-muse/nanoMuse/releases/tag/v0.1.5) | Memory | 动态；SOUL / USER / MEMORY / HEARTBEAT 可看可改；记忆导入；屏幕常亮；「继续？」 |
| [0.1.6](https://github.com/nano-muse/nanoMuse/releases/tag/v0.1.6) | Avatar | 你描述、你的图像模型画、你挑的脸，摆好每种状态并动起来；页面淡入淡出、卡片落进来、红心会跳 |
| [0.1.7](https://github.com/nano-muse/nanoMuse/releases/tag/v0.1.7) | Welcome | 第一次运行：欢迎页带三步——服务商、它提供的模型、认识它 |
| [0.1.8](https://github.com/nano-muse/nanoMuse/releases/tag/v0.1.8) | Polish | 外壳打磨：统一字体排印、胶囊输入框、脸下只留名字、灰色回复气泡、设置页统一风格 |
| [0.1.9](https://github.com/nano-muse/nanoMuse/releases/tag/v0.1.9) | Portrait | 在对话里换脸：说一句「把虚拟形象换成…」，四张候选任选，配好姿势，还有分享卡；点脸进入它的资料页；形象大小五档；名字牌重新调整尺寸 |
| [0.1.10](https://github.com/nano-muse/nanoMuse/releases/tag/v0.1.10) | Motion | 三个模型说清楚——对话、图像、视频——在「设置 → 图像与视频模型」里，也在它自己知道的事里；设了视频模型，形象每个状态一段循环短片；按需生图生视频；缺模型时由它开口说明，不是写死的提示 |
| [0.1.11](https://github.com/nano-muse/nanoMuse/releases/tag/v0.1.11) | Hatch | 内置小龙——静态图和循环短片都在 APK 里；第一次对话由对话模型来读：你说了别的它先答、稍后再问名字，给自己提的名字跟着你的语言；一把百炼 key 跑三个模型，或者每个模型各接一个平台 |
| [0.1.12](https://github.com/nano-muse/nanoMuse/releases/tag/v0.1.12) | Hands | 手机屏幕当手：它只看截图、不读无障碍树，在没有 API 的 App 里点、打字、滑动；技能、CLI、MCP 服务或浏览器能做的先用它们；一个带「停止」的悬浮胶囊；登录和验证码由你接管；付款、发送、删除前的审批一样不少；默认关着 |
| [0.1.13](https://github.com/nano-muse/nanoMuse/releases/tag/v0.1.13) | Reach | 手机操作你的电脑：在电脑上跑一个 Python 文件、在 App 里用配对码配对，手机上的一句话就在那边执行——shell、文件、浏览器、看一眼屏幕——结果和审批回到手机上；暂时是单向的，手机到电脑 |
| [0.1.14](https://github.com/nano-muse/nanoMuse/releases/tag/v0.1.14) | Home | 修复：从通知、悬浮胶囊或 Hands 跑完之后回到 App，落回它自己的主页，而不是 OpenMinis 的聊天页 |
| [0.1.15](https://github.com/nano-muse/nanoMuse/releases/tag/v0.1.15) | Stage | 看得见的动手：干活时四边有呼吸的光，要点的位置先出现带动作名的转动圆环，落指时荡开波纹，滑动时圆环沿路径滑过——参考 UI-TARS-desktop 的 ScreenMarker；胶囊让手势穿过并主动让位；图标快捷方式在主页里打开 |
| [0.1.16](https://github.com/nano-muse/nanoMuse/releases/tag/v0.1.16) | Palette | 图像、视频模型像对话模型一样从 key 能用的里面选，推荐的有标记；百炼画图改走原生接口（404 没了）；MiniMax-H3 之外可选通义万相视频模型 |
| [0.1.18](https://github.com/nano-muse/nanoMuse/releases/tag/v0.1.18) | Open | 注册向所有人开放，每天约 ¥25 的模型用量，免费；花费以 ¥ 和 $ 显示；全新首次启动流程——社区说明、邮箱登录优先、一开始就引导 Hands 权限；授权分三级，付款可按应用记住（需验证锁屏）；Hands 不再限步数；未声明模态的模型不再被当成纯文本 |
| [0.1.19](https://github.com/nano-muse/nanoMuse/releases/tag/v0.1.19) | Ensemble | 多端协同：Windows、macOS、Linux 的桌面 App（运行时打包在内）、终端版，以及什么都不用装的网页版 nanomuse.cn/web；手机和电脑互相拜托，双向，审批在你手里的设备上；任何一台上的「停止」停下所有设备 |
| [0.1.20](https://github.com/nano-muse/nanoMuse/releases/tag/v0.1.20) | Presence | 和 Muse 打电话——语音和视频，实时，走账号或自己的 key；电脑上的 coding agent 在任何设备上指挥；先登录，有密码、登录记录、历史和按类型、按模型的用量；手机版的设计搬到网页、桌面、控制台和管理后台；更细的舞台 |
| [0.1.21](https://github.com/nano-muse/nanoMuse/releases/tag/v0.1.21) | Footing | 全面过一遍：出错一句话说清，Cloud 作为有名字的模型，钱只算一次，管理员令牌和图片抓取加固，手机上的密钥加密且不进备份，网页 App 会连接、重试、保留草稿，桌面版拉起运行时并有「关于」「检查更新」，运行时提示新版本，文档写的是真正发布的东西 |
| [0.1.22](https://github.com/nano-muse/nanoMuse/releases/tag/v0.1.22) | Commons | 说明放最前面；每天 ¥15，图片和视频模型更便宜，换形象前先看花费；邀请得 ¥3 额度和视频；邮箱登录；去掉打电话，网页和桌面版有麦克风；「贡献对话」默认关闭；桌面版在 macOS 和 Windows 装得上；舞台流光 |
| [0.1.23](https://github.com/nano-muse/nanoMuse/releases/tag/v0.1.23) | Welcome | 一份永久有效的额度（¥10，邀请 +¥5，共创 +¥10），用完有三条路；注册后设密码、加入共创两步；网页和桌面版的形象工坊；桌面版像桌面软件；电脑登录即接入；国内下载镜像；管理后台的官网统计；Discussions |
| [0.1.24](https://github.com/nano-muse/nanoMuse/releases/tag/v0.1.24) | Signal | 手机号在各平台登录（短信验证码，密码两者通用）；网页和桌面版的形象会动，工作室做短片；电脑只靠登录接入，去掉局域网脚本；没 key 的账号自动用中继；两端的启动诊断；Linux 运行时兼容 glibc 2.31；更清爽的门面 |
| [0.1.25](https://github.com/nano-muse/nanoMuse/releases/tag/v0.1.25) | Mirror | 名字和形象跟着账号到每台设备；桌面舞台上的「停止」；网页和桌面版的七种画风；默认浅色，「外观」可选；先开端口，桌面报错框说清原因；macOS 上验证中继证书；横屏登录页；注册后一步就能填自己的 key；生图排队不报错；每页字更少 |
| [0.1.26](https://github.com/nano-muse/nanoMuse/releases/tag/v0.1.26) | Window | 浏览器里的手机取代网页版，先登录云账号，模型换成 DeepSeek V4 Pro；桌面版按 Muse 的布局来，加快速对话，开发者功能收进开关；十种语言的 README 放进 `docs/readme/`，多了「现在走到哪儿了」；修好 Linux 桌面版和 Windows 回环拦截的提示。 |
| [0.1.27](https://github.com/nano-muse/nanoMuse/releases/tag/v0.1.27) | Ledger | 数据控制取代共创计划，邀请双方得额度；会员从 Cloud key 下的模型里选；运营者看每一条，带地址和客户端；DeepSeek Harness 版桌面端预览；Android 单元测试恢复。 |
| [0.1.28](https://github.com/nano-muse/nanoMuse/releases/tag/v0.1.28) | Harness | nanoMuse Harness——DeepSeek Harness 版桌面端——做成 Windows、macOS、Linux 安装包；管理页能看出人在哪儿；catalog 模型逐个验证；选的模型一直是它，「手」也用它；手机任务不怕断线；中文更自然；容量估算。 |
| [0.1.29](https://github.com/nano-muse/nanoMuse/releases/tag/v0.1.29) | Likeness | nanoMuse Harness 按 Muse 桌面版一屏一屏重做：首次启动、会话列表、对话上方的形象、胶囊输入框、权限卡、带审批记录的个人面板、Muse 式的设置分页；macOS 安装包重新能打出来。 |
| [0.1.30](https://github.com/nano-muse/nanoMuse/releases/tag/v0.1.30) | Rooms | 建在 DeepSeek Harness 上的唯一桌面端，覆盖安装旧版；图标栏上的动态、点子、目标、资源库；屏中屏；带导入的记忆；一格格挑的形象工坊；应用行为、连接器、文件访问、听写、权限、数据控制；Android 上设置里的模型用到已打开的聊天。 |
| [0.1.31](https://github.com/nano-muse/nanoMuse/releases/tag/v0.1.31) | Locks | 排查的 27 条：网址里不再有令牌（首帧鉴权、签名内嵌链接、`#token=` 配对）、被控设备先同意、各端统一「本次对话」、Enter 按发送审批、CLI 环境清洗、宿主签票的 `confirmed`；中继按请求预留额度并限制并发；展示站只为主人唤醒、会话 key、钉住 BYOK、收窄 Docker 套接字。 |
| [0.1.32](https://github.com/nano-muse/nanoMuse/releases/tag/v0.1.32) | Union | 各端取并集：桌面端与 iPhone 的完整账号页、手机上的七十个连接器（OAuth 在设备上完成）、各端默认关闭的执行步骤与「在做」状态行、三个 star 提示、中继给的数字（Cloud 0.15 运行时可改）、iOS 的密码与邀请码登录；待决清单在 `docs/parity.md`。 |
| [0.1.33](https://github.com/nano-muse/nanoMuse/releases/tag/v0.1.33) | Steps | 各端头像下和胶囊上都是这一步自己的话（每个工具带 `step`）；iPhone 的 Muse 外壳；Android 的浏览器交接与胶囊审批；八个无动态注册的连接器有客户端 ID 面板，新增六个服务；桌面端固定端口、记住设置、头像菜单、轨迹出口、实时权限、可拖动舞台、`BlackScreen`；拒绝 `?token=`；Cloud 0.16 额度池任意设值。 |
| [0.1.34](https://github.com/nano-muse/nanoMuse/releases/tag/v0.1.34) | Turns | 各种手都有交接和 `hand_over`，舞台、胶囊、浏览器视图和聊天里都能点「完成」；桌面舞台和演示胶囊上的「允许一次 / 始终允许 / 拒绝」；聊天入口（飞书、钉钉、企业微信、Telegram）；对话与动手两条模型线（`deepseek-v4.1-flash` / `qwen3.8-27b`）；按地区的继续方式（百炼 / OpenRouter）；连接经账号资料共享；macOS 窗口模式与光晕、胶囊悬浮层；iPhone 与桌面端对齐（智能体页面、换形象、带调度器的房间、初次使用、iPad）；桌面端版本号与检查更新；更平实的文案；Cloud 0.17 的模型线、连接、地区。 |
| [0.1.35](https://github.com/nano-muse/nanoMuse/releases/tag/v0.1.35) | Accord | iPhone 的界面和设置照着手机做（每个房间的 Muse 顶栏、卡片式设置、外观页、初次使用里的通知页）；iPhone 和桌面端画出来的形象有动态短片（`wan2.2-i2v-flash`，四种状态，设置 → 媒体）；桌面端有手机的初次使用和第一次对话（`firstrun.json`、`nanomuse-naming` 卡片）；修了 Mac 上点形象没反应、点子为空、启动页小龙；各端的 star 提醒走中继策略（`/v1/nudges`，控制台 → Star 提醒）；各端并排显示已安装与最新版本；动态的介绍卡和第一天；macOS 权限重新排查（只需打开 nanoMuse Desktop 一项）；窗口模式的保底；Cloud 0.18 的提醒策略。 |
| 0.2.0 | Beta | 多端使用头几周后的打磨；iPhone App 上架 App Store；第一个 beta |

**再之后**，依次：部署在你自己机器上——一台 VM、一台家里的服务器——的网页版，用同一个网关；眼镜。每加一台设备，同一个智能体就多一双手、多一个入口。项目起步时的 Python 线——智能体和它的 Sentinel、网页 App、模拟手机——冻结在 tag [`pre-openminis`](https://github.com/nano-muse/nanoMuse/releases/tag/pre-openminis)，文档在 [docs/](../../docs)，是桌面和网页这两个入口的底座。

## 和 Muse、OpenMinis 的对比

| | Meta Muse | OpenMinis | nanoMuse |
|---|---|---|---|
| 是什么 | 作为一项服务提供的个人智能体：iOS、Android、网页、WhatsApp、Mac 客户端，背后是每个用户一台的云端 VM | 跑在设备上的智能体 App，iOS 和 Android：Linux 沙盒、浏览器、设备工具、技能、记忆、工作区 | 一个 Muse 风格的智能体，跑在 OpenMinis 的端侧运行时上，完全开源，面向你的每一台设备 |
| 智能体跑在哪 | Meta 的云端 VM | 装了它的那台手机 | 手机上；手机上说一句，能在你的电脑上办；再之后你说在哪就在哪 |
| 形状 | 一个有名字、有形象的智能体，动态、目标、Sentinel | 会话、工具、设置——一个工作台 | 一个智能体：有名字和自己的形象、第一次对话、动态、按时检查的目标、能改的记忆 |
| 无法撤销的操作前 | Sentinel 模型审批 | 按工具授权 | `RiskGate` 拦下这次调用，问你：只此一次、本次对话、对这个收件人 / 域名 / 目录一直允许，或者拒绝；密码和验证码从不由它输入 |
| 没有 API 的 App | 碰不到——VM 里有浏览器，但够不着你的手机 | Android 上有一个模型可以调用的无障碍 CLI（`android-a11y-cli`） | 把屏幕当成一双真正的手：只看截图，先试 API 再上屏幕，登录由你接管，同一套审批——0.1.12 起 |
| 其他设备 | 多个客户端连同一台 VM；VM 不碰你的设备 | 只有装了它的那一台 | 一个智能体，跨你的所有设备：电脑装桌面版、登同一个账号，手机就能在任何网络下操作它，所有设备双向互通 |
| 形象 | 一个干活时会换姿势的毛绒形象 | — | 你的图像模型画出并摆好姿势的形象，每个状态一段你的视频模型做的循环短片；默认是一只已经会动的小龙 |
| 模型 | Meta 的 | 自己带 | nanoMuse 云的默认（对话 `deepseek-v4.1-flash`，手 `qwen3.8-27b`）或自己带——对话、手、图像、视频各一个模型，或一把百炼 key 全包；OpenMinis 自带的 OAuth 登录保留 |
| 许可 | 闭源 | GPL-3.0 | GPL-3.0-or-later，基于 OpenMinis——致谢；上游版本仍可合并 |

## 现在走到哪儿了

现在是 0.1 预览版。我们自己每天在用，知道哪些地方还糙；哪里坏了、想要什么，直接提 issue。想折腾的——自己的模型、shell、MCP、技能、harness、运行时的 API——都在设置和文档里。运行时的各个面、技能与插件接口一段时间内还会变；[CHANGELOG](../../CHANGELOG.md) 记录改了什么，[路线图](../roadmap.md) 说接下来做什么。觉得有用，点个 Star，让更多人看到。

## 参与

**[提 issue](https://github.com/nano-muse/nanoMuse/issues/new/choose) · [到 Discussions 提问、交流](https://github.com/nano-muse/nanoMuse/discussions) · [点个 Star](https://github.com/nano-muse/nanoMuse)**。免费额度、自己的 key 和数据的去向：[docs/cloud.md](../cloud.md) · [docs/own-key.md](../own-key.md) · [docs/privacy.md](../privacy.md)。

拿它做一件真事，报告哪里坏了，然后挑一件小而具体的事做。[CONTRIBUTING.md](../../CONTRIBUTING.md) 有构建环境（[android/BUILDING.md](../../android/BUILDING.md) 和 `scripts/android/` 里的工具链脚本）、约定（包名 `com.openminis.app` 不动，新代码放 `io.github.nanomuse.*`，改上游处标 `// nanoMuse:`，提交带 `Signed-off-by`）和发版方式。iOS 版从同一棵树构建，由 CI 交给 TestFlight，见 [docs/ios.md](../ios.md)。[Issues](https://github.com/nano-muse/nanoMuse/issues) · [Pull requests](https://github.com/nano-muse/nanoMuse/pulls)。

## 致谢

nanoMuse 站在别人的工作之上；条款见 [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md)。

- [OpenMinis](https://github.com/OpenMinis/OpenMinis)——App 所基于的端侧智能体：proot Linux、shell、浏览器、MCP、技能、定时任务、无障碍执行器。
- [proot](https://github.com/proot-me/proot)（经 [nano-muse/proot](https://github.com/nano-muse/proot)）与 [Alpine Linux](https://alpinelinux.org/)——APK 里的沙箱。
- [MobileGym](https://github.com/Purewhiter/mobilegym)、[MemGUI-Bench](https://github.com/lgy0404/MemGUI-Bench)、[PhoneHarness](https://github.com/lsdefine/PhoneHarness)、[CopilotKit/OpenMuse](https://github.com/CopilotKit/OpenMuse)、[Open-AutoGLM](https://github.com/zai-org/Open-AutoGLM)、[ClawGUI](https://github.com/ClawGUI/ClawGUI-APP)——Python 线里的手机操作器、轨迹和产品思路。

## 声明

nanoMuse 是独立的社区项目，与 Meta Platforms, Inc. 及其 Muse 产品无关，未获其背书，也不派生自它；Muse 是 Meta Platforms, Inc. 的商标。小龙是本项目自己的。

## 许可

[GPL-3.0-or-later](../../LICENSE)。Android App 基于 OpenMinis 1.13（GPL-3.0），自 2026-09-24 起修改；见 [NOTICE](../../NOTICE) 与 [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md)。Python 线更早的版本以 MIT 发布（tag `pre-openminis`）。
