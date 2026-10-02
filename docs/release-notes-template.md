# nanoMuse <version> · <Codename>

<!-- The first line is the GitHub release title (scripts/release-apk.sh reads it).
     English first; the Chinese version of the same notes goes in the <details> block at the end.
     Codenames so far: Foundation, Identity, Home, Guardrails, Memory, Avatar, Welcome, Polish,
     Portrait, Motion, Hatch, Hands, Reach, Home, Stage, Palette, Open, Ensemble, Presence,
     Footing, Commons, Welcome, Signal, Mirror, Window, Ledger, Harness (CHANGELOG.md has the list). One word, capitalised.

     The shape follows the releases people know (nanobot's): a short story, then Highlights,
     Upgrade Notes, Community; What's Changed, New Contributors, Contributors and the Full
     Changelog link are generated from the merged pull requests by scripts/release_notes.py
     where the marker below stands, when the release is published. -->

🐉 **nanoMuse `<version>` “<Codename>”** <one sentence: what this version is about>.

<One or two short paragraphs: the headline, and the other story — in plain words, what it means for the person using it.>

## Highlights

- **<Thing>.** <What it is, where to find it, what it replaces.>
- …

## Upgrade Notes

- **Android installs over <previous> and keeps your data.** `nanoMuse-<version>-arm64.apk` (Android 8.0+, arm64; versionCode <n>) is signed with the same key as every version before it. Verify with `sha256sum -c nanoMuse-<version>-arm64.apk.sha256`.
- **The desktop installers are not notarised.** On macOS open the app once from *System Settings → Privacy & Security → Open Anyway* (or right-click → *Open*); on Windows click *Run anyway*. They arrive a little after the APK — CI builds them from the tag — and `SHA256SUMS-desktop-app.txt` / `SHA256SUMS-desktop-terminal.txt` list every checksum.
- <Anything a person upgrading must know: a setting that moved, a relay version an operator needs, a platform that needs a newer build.>
- **Where to get it.**

  | | |
  |---|---|
  | Browser | [nanomuse.cn/web](https://nanomuse.cn/web/) — a phone number or an e-mail, nothing to install |
  | Android 8.0+, arm64 | `nanoMuse-<version>-arm64.apk` |
  | Windows 10+ | `nanoMuse-Harness-<version>-win-x64.exe` (on DeepSeek Harness) · `nanoMuse-Desktop-<version>-win-x64.exe` (the app) · `nanomuse-desktop-terminal-<version>-windows-x64-setup.exe` (terminal) |
  | macOS 12+ | `nanoMuse-Harness-<version>-mac-arm64.dmg` / `-mac-x64.dmg` (on DeepSeek Harness) · `nanoMuse-Desktop-<version>-mac-arm64.zip` / `-mac-x64.zip` (unzip, drag to Applications) or the `.dmg` (the app) · `nanomuse-desktop-terminal-<version>-macos-arm64.pkg` / `-x64.pkg` (terminal) |
  | Linux x64 | `nanoMuse-Harness-<version>-linux-x64.AppImage` / `.deb` (on DeepSeek Harness) · `nanoMuse-Desktop-<version>-linux-x64.AppImage` / `.deb` (the app) · `nanomuse-desktop-terminal-<version>-linux-x64.deb` / `.tar.gz` (terminal) |
  | DeepSeek Harness Desktop | `nanoMuse-Harness-<version>.tgz` — `dsh plugin --profile desktop add …` ([how](https://github.com/nano-muse/nanoMuse/blob/main/harness/README.md)) |

  GitHub's own downloads are the fastest source from China too in our measurements; if they fail where you are, the same files are on [nanomuse.cn/dl/v<version>/](https://nanomuse.cn/dl/v<version>/) within fifteen minutes.

## Community

**Free, open source, non-profit — open source, built together: a personal agent for all.** Sign in with a phone number or an e-mail and the model comes with a free allowance, paid by the developer — the account page says how much is left and how it grows; when it is gone, bring your own key, with a step-by-step guide. Nothing is sold; what the relay keeps is in the privacy policy (nanomuse.cn/privacy), and *Settings → Data controls* is yours; delete the account whenever you like.

This is a preview, and the people building it use it every day; what breaks for you, and what you wish it did, is the most useful thing you can send. The apps are for anyone; the developer side is in the settings and the docs when you turn it on; the product and the skill and plugin interfaces will keep moving quickly for a while and settle as they go. What we are after is bigger than one app — a personal agent that belongs to the person who runs it, built in the open on infrastructure anyone can reuse, and a shared answer to how far such an agent can go — and we look forward to finding it out with users and developers everywhere. Thank you to everyone who tried a build, reported what broke and asked for what was missing — every issue, idea and pull request brings a personal agent within everyone's reach. [Open an issue](https://github.com/nano-muse/nanoMuse/issues/new/choose) · [send a pull request](https://github.com/nano-muse/nanoMuse/blob/main/CONTRIBUTING.md) · [Discussions](https://github.com/nano-muse/nanoMuse/discussions) · [star the repo](https://github.com/nano-muse/nanoMuse).

Based on [OpenMinis](https://github.com/OpenMinis/OpenMinis) 1.13 (GPL-3.0), modified since 2026-09-24. The complete corresponding source of this build is tag `v<version>` plus the `android/deps/proot` submodule ([nano-muse/proot](https://github.com/nano-muse/proot)). The whole repository is GPL-3.0-or-later. nanoMuse Harness carries DeepSeek Harness unmodified, with its licence files inside; *harness* in the name is the word, not DeepSeek's. nanoMuse is not affiliated with Meta; Muse is a trademark of Meta Platforms, Inc. The desktop follows what Muse's app looks like and does, written down from using it; none of Meta's assets, code or content is in it.

<!-- pull requests -->

<details>
<summary>简体中文</summary>

🐉 **nanoMuse `<version>`「<Codename>」**：<一句话：这个版本是关于什么的>。

<一两段话：主线，以及另一条线——用平实的话说清对用的人意味着什么。>

### 亮点

- **<什么>。** <是什么、在哪里、替代了什么。>
- …

### 升级说明

- **Android 覆盖安装 <previous>，数据保留。** `nanoMuse-<version>-arm64.apk`（Android 8.0+，arm64；versionCode <n>）和之前每个版本用同一把签名。校验：`sha256sum -c nanoMuse-<version>-arm64.apk.sha256`。
- **桌面安装包没有经过公证。** macOS 第一次在「系统设置 → 隐私与安全性」里点「仍要打开」（或右键 → 「打开」），Windows 点「仍要运行」。安装包会比 APK 晚一点到——CI 从 tag 构建它们；`SHA256SUMS-desktop-app.txt` 和 `SHA256SUMS-desktop-terminal.txt` 列出了所有校验值。
- <升级的人必须知道的事：挪了位置的设置、运维者需要的中转版本、需要新构建的平台。>
- **去哪下载。**

  | | |
  |---|---|
  | 浏览器 | [nanomuse.cn/web](https://nanomuse.cn/web/)——手机号或邮箱，不用安装 |
  | Android 8.0+，arm64 | `nanoMuse-<version>-arm64.apk` |
  | Windows 10+ | `nanoMuse-Harness-<version>-win-x64.exe`（DeepSeek Harness 版）· `nanoMuse-Desktop-<version>-win-x64.exe`（App）· `nanomuse-desktop-terminal-<version>-windows-x64-setup.exe`（终端） |
  | macOS 12+ | `nanoMuse-Harness-<version>-mac-arm64.dmg` / `-mac-x64.dmg`（DeepSeek Harness 版）· `nanoMuse-Desktop-<version>-mac-arm64.zip` / `-mac-x64.zip`（解压后拖进「应用程序」）或 `.dmg`（App）· `nanomuse-desktop-terminal-<version>-macos-arm64.pkg` / `-x64.pkg`（终端） |
  | Linux x64 | `nanoMuse-Harness-<version>-linux-x64.AppImage` / `.deb`（DeepSeek Harness 版）· `nanoMuse-Desktop-<version>-linux-x64.AppImage` / `.deb`（App）· `nanomuse-desktop-terminal-<version>-linux-x64.deb` / `.tar.gz`（终端） |
  | DeepSeek Harness Desktop | `nanoMuse-Harness-<version>.tgz`——`dsh plugin --profile desktop add …`（[怎么装](https://github.com/nano-muse/nanoMuse/blob/main/harness/README.md)） |

  实测从国内直接下 GitHub 也是最快的；万一下不动，同样的文件十五分钟内会出现在 [nanomuse.cn/dl/v<version>/](https://nanomuse.cn/dl/v<version>/)。

### 社区

**免费 · 开源 · 非盈利 —— 开源共建，做属于所有人的个人智能体。** 用手机号或邮箱登录，模型自带一份免费额度，费用由开发者承担——还剩多少、怎么增加，账号页里写得清楚；用完可以换自己的 key，有一步步的教程。数据不会出售；服务器保存什么写在隐私政策里（nanomuse.cn/privacy），「设置 → 数据控制」由你决定；随时可以删除账号。

谢谢每一位装过试过、报过问题、提过需求的人——每一个 issue、想法和 PR，都在让个人智能体离所有人更近一步。[提 issue](https://github.com/nano-muse/nanoMuse/issues/new/choose) · [发 PR](https://github.com/nano-muse/nanoMuse/blob/main/CONTRIBUTING.md) · [Discussions](https://github.com/nano-muse/nanoMuse/discussions) · [点个 Star](https://github.com/nano-muse/nanoMuse)。

基于 [OpenMinis](https://github.com/OpenMinis/OpenMinis) 1.13（GPL-3.0），自 2026-09-24 起修改；本版本的完整对应源码是 tag `v<version>` 加子模块 `android/deps/proot`（[nano-muse/proot](https://github.com/nano-muse/proot)）。整个仓库以 GPL-3.0-or-later 发布。nanoMuse Harness 原样携带 DeepSeek Harness 及其许可证文件；名字里的 *harness* 是普通词，不是 DeepSeek 的名字。nanoMuse 与 Meta 无关，Muse 是 Meta Platforms, Inc. 的商标。桌面端照着 Muse 应用用起来的样子做，是用过之后写下来的；里面没有 Meta 的任何素材、代码或内容。

</details>
