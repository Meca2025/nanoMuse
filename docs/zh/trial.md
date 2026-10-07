# 试用手册：一个账号，你的所有设备

把私下试用从头到尾跑起来需要什么——中继、手机、电脑、网页——从一台干净的 VPS
到「手机让 Mac 编译项目」。这里写的一切都在私有仓库 `nanomuse-trial`（分支 `trial`）里，
直到它进入公开仓库为止。

## 0. 你需要什么 {#_0-what-you-need}

| | 用来 |
|---|---|
| 一台装了 Docker 的小 Linux VPS（1 vCPU / 1 GB 就够）和一个指向它的域名，比如 `cloud.example.com` | 中继 + hub + 网页控制台 |
| 一把 OpenAI 兼容的模型 key——默认是阿里云百炼（Model Studio）；同一把 key 也负责画图 | 各台设备上的 Muse 用它思考 |
| 一个发验证码的途径：SMTP 凭据（邮箱登录）和/或阿里云短信（中国大陆手机号）——或者 `CODE_SENDER=log`，趁着只有你自己在用，从服务器日志里读验证码 | 登录 |
| Android 手机：`./gradlew :app:assembleDebug` 打出来的 arm64 调试 APK（手动安装） | 手机上的 Muse |
| 电脑：各自的安装包来自 `desktop` 工作流的产物——*Actions → desktop → Run workflow* 一次构建全部四个（Windows `-setup.exe`、macOS `.pkg` 的 Apple 芯片版和 Intel 版、Linux `.deb`）；打一个 `desktop-v*` 标签也会把它们发布成一个版本 | 电脑上的 Muse |
| iPhone（可选）：通过 `ios-testflight` 工作流上 TestFlight——需要 Apple Developer 账号和放在仓库 secrets 里的 App Store Connect API key；先跑 *iOS · build check*，它这两样都不需要 | hub 上的 iPhone（它能响应 `info`、`open`、`notify`；iPhone 上的 shell、文件和任务还没做） |

## 1. 中继 {#_1-the-relay}

```bash
git clone git@github.com:nano-muse/nanomuse-trial.git && cd nanomuse-trial/cloud
cp .env.example .env
```

填写 `.env`：

```
CLOUD_DOMAIN=cloud.example.com
PUBLIC_BASE=https://cloud.example.com
CLOUD_SECRET=<openssl rand -hex 32>        # back it up with data/: rotating it orphans accounts
CLOUD_ADMIN_TOKEN=<openssl rand -hex 32>
UPSTREAM_BASE=…/compatible-mode/v1          # your Model Studio endpoint
UPSTREAM_KEY=sk-…
DASHSCOPE_BASE=…/api/v1
SIGNUP_OPEN=0                               # members only while you try it; 1 opens sign-up
ALLOWED_IDENTIFIERS=139xxxxxxxx, you@example.com   # members: no daily cap
DAILY_CAP_CNY=25                            # yuan a day for everyone else once sign-up is open
CODE_SENDER=smtp                            # or aliyun / both / log
SMTP_HOST=… SMTP_PORT=465 SMTP_USER=… SMTP_PASSWORD=… SMTP_FROM=nanoMuse <no-reply@example.com>
HUB_ENABLED=true
```

```bash
docker compose up -d            # relay on :8787 behind Caddy, which fetches the certificate
docker compose logs -f relay    # codes appear here when CODE_SENDER=log
curl https://cloud.example.com/healthz
```

网页控制台在 `https://cloud.example.com/app/`，运营者的页面在 `/app/admin/`
（需要 `CLOUD_ADMIN_TOKEN`：谁登录了、用量、设备、发放额度 / 停用 / 删除）。
数据（SQLite）放在 `cloud/data/`；连同 `CLOUD_SECRET` 一起备份。token 数默认
没有上限；真正限制一个账号的是每日金额上限（`DAILY_CAP_CNY`），成员不受它约束。

生产环境的中继 `https://cloud.nanomuse.cn` 就是这份代码，跑在给 nanomuse.cn 提供
服务的那台机器上，在展示站的 Caddy 后面；
[`cloud/deploy/nanomuse-hk/`](../../cloud/deploy/nanomuse-hk/README.md) 里有
compose 文件、Caddy 站点配置、备份定时器和部署脚本。

## 2. 手机 {#_2-the-phone}

安装 APK。在第一屏上，「接入模型」→ 你的手机号或邮箱地址 → 验证码 → 完成：
nanoMuse Cloud 服务商、一个默认模型组和 hub 连接一次设好。（调试版会显示
「中转服务器」一栏；把你中继的地址填在那里。正式版用默认的中继。）

「设置 → nanoMuse Cloud」现在多了一个**设备**区：两个开关（可被找到 · 可被操作）、
手机的名字（改成一个你会念出口的——「pixel」「小米」）、其他设备，以及控制台的链接。
手机在 hub 上时，会一直有一条安静的通知。

## 3. 电脑 {#_3-the-computers}

安装软件包。然后在终端里：

```
nanomuse-desktop
```

服务器 → 手机号或邮箱地址 → 验证码。给电脑起个名字（`nanomuse-desktop rename mac`）。
`nanomuse-desktop run --open` 在终端里聊天并打开控制台；
`nanomuse-desktop serve` 不开聊天，只让它保持可被联系（想让它一直在线，
就放进登录项 / systemd 用户服务 / 任务计划程序）。

## 4. 试一试 {#_4-try-it}

在手机上：「在 mac 上列一下下载文件夹」 「让 desk 把 ~/proj 编译一遍，把最后二十行日志发我」
「电脑截个图给我看」 「给电脑发个通知：该睡了」

在电脑上：「在手机上截个图」「让 pixel 的 Muse 把最后一条通知读给我」
「给 pixel 发个通知：构建完成」。

在控制台里：选一台设备，打字；审批以卡片的形式出现。

凡是删除、发送、付款或者动系统的事都会先问——在你打字的那台设备上问。
远端 Muse 的审批问题也同样回到你手里。

## 5. 运维 {#_5-operating}

```bash
# accounts (hints only, never identifiers) and allowance
curl -H "X-Admin-Token: $CLOUD_ADMIN_TOKEN" https://cloud.example.com/v1/admin/accounts
# top up
curl -H "X-Admin-Token: $CLOUD_ADMIN_TOKEN" -X POST https://cloud.example.com/v1/admin/grant \
     -H 'content-type: application/json' -d '{"identifier":"139…","tokens":1000000}'
# who is on the hub (with a device's own key)
curl -H "Authorization: Bearer nm_…" https://cloud.example.com/v1/devices
```

放别人进来：`SIGNUP_OPEN=1`，再跑一次 `docker compose up -d`，任何人都能注册，
受每日上限约束；在管理页上点「设为成员」，或者在 `ALLOWED_IDENTIFIERS` 里加一行，
就为某一个人解除上限。

## 6. 现状 {#_6-where-it-stands}

在开发机上验证过的：中继 + hub、Linux 桌面版、Android 模拟器和网页控制台在同一个
账号下——手机→电脑（`devices`、`run`、`ls`、`notify`、`task`），电脑→手机（`info`、
`notify`、`task`，自然语言的通知 + 委派），网页→手机和网页→电脑（任务、审批卡片），
重命名和忘记（控制台里也能做）。macOS 和 Windows 的安装包出自 CI（`desktop` 工作流，
四个目标全绿），没有在真机上跑过。iOS 这边——登录和 hub 客户端——是在没有 Mac 的情况下
写的；`ios-check` 工作流是编译测试，`ios-testflight` 工作流负责交付。手机上的 shell
和文件用的是 Linux 沙箱，arm64 手机上有它（模拟器版没有）。
