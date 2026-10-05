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
  <a href="https://github.com/nano-muse/nanoMuse/releases"><img src="https://img.shields.io/github/downloads/nano-muse/nanoMuse/total?label=downloads" alt="下載次數"></a>
  <a href="https://github.com/nano-muse/nanoMuse/actions/workflows/ci.yml"><img src="https://github.com/nano-muse/nanoMuse/actions/workflows/ci.yml/badge.svg?branch=main" alt="Test Suite"></a>
  <a href="https://nanomuse.cn/web/"><img src="https://img.shields.io/badge/%E5%9C%A8%E7%80%8F%E8%A6%BD%E5%99%A8%E8%A3%A1%E8%A9%A6-nanomuse.cn%2Fweb-5B4EE6" alt="在瀏覽器裡試"></a>
  <a href="https://nanomuse.cn/"><img src="https://img.shields.io/badge/%E7%B6%B2%E7%AB%99-nanomuse.cn-0a66e4" alt="網站"></a>
  <a href="https://github.com/nano-muse/nanoMuse/blob/main/LICENSE"><img src="https://img.shields.io/github/license/nano-muse/nanoMuse?label=license" alt="GPL-3.0-or-later"></a>
</p>

> [!IMPORTANT]
> **免費、開源、非營利。** 用手機號碼或電子郵件登入後有一份起始額度，費用由開發者出；剩多少、怎麼加，帳號頁裡有數。用完可以填自己的 key：中國大陸用阿里雲百煉，其他地區用 OpenRouter（[教學](../own-key.md)）。訊息預設不存伺服器，資料不賣（[隱私權政策](https://nanomuse.cn/privacy/)）；帳號想刪就刪。**[在瀏覽器裡試試](https://nanomuse.cn/web/)**，或[下載 App](https://github.com/nano-muse/nanoMuse/releases/latest)。

> 這一頁是 [英文 README](../../README.md) 的譯文；英文版是基準，最新消息與完整版本表都在那裡。

nanoMuse 是一個開源的個人智慧體，為你的每一台裝置而生：一個有自己名字和形象的智慧體，像 Meta 的 [Muse](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/) 一樣，不只回答問題，而是把事情做完；App 關掉它也繼續工作，記得你，在任何無法復原的操作前先停下來問你。Android App 把整個智慧體跑在**手機上**：Linux 根檔案系統、shell、瀏覽器、MCP、技能和排程任務都在 APK 裡，模型由你自備。對那些從來沒有 API 的 App，它有一雙「手」——經你允許，直接看、直接點手機螢幕；它還能伸到你的電腦上：在手機上說一句，電腦上就做完。桌面版、網頁版和 iPhone App（TestFlight）也已經推出；眼鏡接著來。自己的 key，或是來自開放中繼的起始額度，GPL-3.0——也是一個底子，可以在它上面做出你自己的 Muse。

<p align="center">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/docs/avatar-moods.png" width="88%" alt="同一隻小龍的五種狀態：休息、工作中、等待、開心、抱歉">
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/docs/screenshots/chat-approval.png" width="23%" alt="對話：在工作區刪除之前，智慧體停下來問——只這一次、這個對話、工作區永遠允許，或拒絕">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/docs/screenshots/feed.png" width="23%" alt="動態：今天早上為你寫的貼文">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/docs/screenshots/goals.png" width="23%" alt="目標：按排程追蹤，還有例程">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/docs/screenshots/avatar.png" width="23%" alt="形象：描述一句，你的圖片模型畫出來，挑一張你喜歡的">
</p>

## 為什麼是 nanoMuse

四件事定義了這個專案。

| | |
|---|---|
| **Muse 風格** | 一個智慧體，不是一堆工具：自己的名字和形象、第一次對話、為你寫的動態、在背景推進的目標、可以讀也可以改的記憶，以及任何無法復原的操作之前先問你一次。 |
| **完全開源** | GPL-3.0-or-later，整個倉庫。沒有閉源元件，沒有非用不可的帳號、伺服器或模型——可選的 nanoMuse Cloud 中繼也在倉庫裡，任何人都能自己架一個；每個版本都從它的 tag 建置、手動安裝。Muse、豆包、千問是別人給你的產品；nanoMuse 是你自己擁有的——也是做你自己的 Muse 的底子：改名字、換形象、重寫個性、接上你自己的模型和工具。 |
| **任何 App，有沒有 API 都行** | 在中國，一天裡的大半事情都在從來沒有 API 的 App 裡完成。智慧體順著一把梯子往上試——先是技能、CLI 或 MCP 伺服器，再用你的登入狀態抓一頁，再是 App 內瀏覽器，最後在你允許之後直接操作裝置螢幕，像你一樣看、一樣點——付款、傳送、刪除前照樣先問你。預設關閉。 |
| **每一台裝置** | 一個智慧體，你擁有的每一台裝置都是它的一雙手、一個入口：在手機上說，在電腦上發生；對眼鏡說，兩邊都發生。手機已經能驅動你的電腦，桌面版、網頁版和 iPhone App 都已經推出；眼鏡接著來。 |

和 Muse、以及這個 App 所基於的執行環境 OpenMinis 怎麼比：見[英文 README](../../README.md#compared-with-muse-and-openminis)。計畫與理由：[docs/roadmap.md](../roadmap.md)。

## 安裝

什麼都不用裝就能先看一眼：[nanomuse.cn/web](https://nanomuse.cn/web/) 打開是瀏覽器裡的一台模擬手機，裡面有一個你自己的 nanoMuse，用手機號碼或電子郵件收個驗證碼登入就能試——這是示範，和 App 差得不少；要完整體驗，請裝下面的手機 App 和桌面版，同一個帳號。給你自己的裝置——[下載](https://nanomuse.cn/#download)：Android APK、Windows / macOS / Linux 桌面版（`nanoMuse-Desktop-<version>-…`）、終端機版（`nanomuse-desktop-terminal-<version>-…`），或用 Python 3.11+ 執行 `pipx install "git+https://github.com/nano-muse/nanoMuse"`；實測從中國大陸直接下載 GitHub 也是最快的；萬一在你那裡下不動，同樣的檔案也在專案的鏡像 [nanomuse.cn/dl](https://nanomuse.cn/dl/)（發佈後十五分鐘內同步，SHA-256 校驗過）；[docs/desktop.md](../desktop.md) 與 [docs/every-device.md](../every-device.md) 說明它們怎麼連在一起。在手機上：

1. 從[最新版本](https://github.com/nano-muse/nanoMuse/releases/latest)下載 `nanoMuse-<version>-arm64.apk`——Android 8.0 或更新、64 位元手機。願意的話用 `sha256sum -c nanoMuse-<version>-arm64.apk.sha256` 校驗。
2. 開啟它。Android 會問一次是否允許安裝；每個版本都用同一把金鑰簽名，所以更新會覆蓋安裝並保留你的資料。
3. 接上模型。「登入，免費開始」：手機號碼（驗證碼走簡訊）或電子郵件，智慧體就有了 [nanoMuse Cloud](../cloud.md) 的免費額度——不用 key，不用付錢；帳號頁會說還剩多少、怎麼增加。對話模型是 `deepseek-v4.1-flash`，「手」用 `qwen3.8-27b`，兩者是分開的設定。用完了換自己的 key：中國大陸用[阿里雲百煉](../own-key.md)，其他地區用 [OpenRouter](../own-key.md)（百煉不接受海外身分註冊）；任何 OpenAI 相容端點，或 App 內建的 OAuth 登入之一。然後，如果你願意，開啟讓它操作手機 App 的兩項權限（可跳過），再進行第一次對話：它會問怎麼稱呼你，並為自己挑一個名字。
4. 可選——*設定 → 圖片與影片模型*：一個圖片模型（阿里雲百煉的 qwen-image-3.0、gpt-image-1，或任何有 OpenAI images 端點的供應商）讓它能換形象、畫圖；一個影片模型（百煉的 wan2.2-i2v-flash）讓形象動起來。Muse 這兩樣是內建的；nanoMuse 用你自己的，缺哪個它會開口告訴你。

App 會到這個倉庫的 Releases 檢查更新；桌面版的版本號在「設定 → 關於」，旁邊有「檢查更新」。每個版本的發佈說明在 [docs/releases/](../releases) 與 [CHANGELOG](../../CHANGELOG.md)。

## 它能做什麼

| | |
|---|---|
| **把事做完** | Linux shell、瀏覽器、MCP 伺服器、[Agent Skills](https://agentskills.io) 格式的技能，以及——開啟 Hands 之後——透過螢幕操作手機上的 App：截一張圖、做一步、再截一張，先試 API 再上螢幕，登入由你接手，該問的照樣問（0.1.12）。用哪隻手它自己挑，每一步都是一張可以展開的卡片。頁面需要你本人——登入、驗證碼——它會停下來交給你，按「完成」繼續；手機、桌面、網頁都一樣。macOS 上「手」可以只操作某一個 App 的視窗、用自己的事件，你的游標還是你的；每個 App 第一次會問你。 |
| **先問再做** | 刪除、傳送、付款之前停下來問你——在 shell 裡、瀏覽器裡，以及 Hands 在手機螢幕上點按時都一樣——範圍由你定：只這一次、這個對話，或對這個收件人 / 網域 / 資料夾永遠允許，在「權限」裡隨時可以撤銷。密碼和驗證碼永遠由你自己輸入。桌面版的「允許一次 / 拒絕」就在舞台上，手機上在膠囊上——在哪就在哪答，不用切回 App。 |
| **在你常用的地方** | 在飛書、釘釘、企業微信或 Telegram 裡直接和你的 Muse 說話：機器人住在聊天軟體裡，第一則訊息用配對碼認人，就在那裡回答你（[docs/channels.md](../channels.md)）。在一台裝置上連好的服務，其他裝置會顯示「已在你的 Mac 上連接——在這台登入即可使用」；憑證留在登入的那台裝置上。 |
| **一直在做** | 目標在對話裡定下來，之後在各自的對話裡按排程檢查；例程在 App 關著時照樣跑；它操作手機時螢幕不會熄滅；到 200 步會問你「繼續嗎？」，而不是草草收尾。 |
| **為你寫動態** | 每天早上三到六則短貼文，來自它對你的了解和你要它留意的事，做成卡片——可以按讚、在旁聊裡討論，或刪掉。一句話就能調整方向。 |
| **記得你** | 它是誰（`SOUL.md`）、它了解你什麼（`USER.md`）、它記得什麼（`GLOBAL.md` 和一本日記）、它什麼時候醒來（`HEARTBEAT.md`）都是你在 App 裡可以讀、可以改的檔案。用「匯入記憶」把另一個助理知道的帶過來。 |
| **自己的形象** | 一句話描述；你的圖片模型畫出來；你挑一張喜歡的。App 再把它擺成每種狀態的姿勢——工作中、等待、開心、抱歉——並隨它正在做的事呼吸、晃動、歪頭、彈跳、搖頭；有影片模型時，每種狀態是一段循環短片。預設是一隻淡黃色的小龍，靜圖和短片都內建。 |
| **點子與資源庫** | 從目標和記憶裡冒出來的、接下來可以問的事；以及它做出來的一切，附預覽。 |

全部都在手機上執行；OpenMinis 的其餘部分——終端機、App 內瀏覽器、MCP 與技能管理、模型群組、token 用量、無障礙執行器、共用資料夾——都保留著，從同一組選單就能進入。

## 版本

每個階段一個小版本，每個版本都是附 APK 的 GitHub release。最新消息與完整版本表見[英文 README](../../README.md#versions)；計畫與理由在 [docs/roadmap.md](../roadmap.md)；每個版本的說明在 [docs/releases/](../releases) 與 [CHANGELOG](../../CHANGELOG.md)。接下來依序是：在你自己的機器上跑網頁版（虛擬機、家用伺服器）；眼鏡。

## 現在走到哪裡了

現在是 0.1 預覽版。我們自己每天在用，知道哪些地方還粗糙；哪裡壞了、想要什麼，直接開 issue。想折騰的——自己的模型、shell、MCP、技能、harness、執行環境的 API——都在設定和文件裡。執行環境的各個面、技能與外掛介面一段時間內還會變；[CHANGELOG](../../CHANGELOG.md) 記錄改了什麼，[路線圖](../roadmap.md) 說接下來做什麼。覺得有用，給一顆星，讓更多人看到。

## 參與

**[開 issue](https://github.com/nano-muse/nanoMuse/issues/new/choose) · [在 Discussions 提問或分享](https://github.com/nano-muse/nanoMuse/discussions) · [給倉庫一顆星](https://github.com/nano-muse/nanoMuse)**。免費額度、自己的 key 和你的資料怎麼運作：[docs/cloud.md](../cloud.md) · [docs/own-key.md](../own-key.md) · [docs/privacy.md](../privacy.md)。建置方式、慣例（`com.openminis.app` 保留、新程式碼放在 `io.github.nanomuse.*`、上游改動標 `// nanoMuse:`、commit 帶 `Signed-off-by`）與發版流程見 [CONTRIBUTING.md](../../CONTRIBUTING.md)。

## 致謝

nanoMuse 站在他人的工作之上；[THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md) 列出各自的授權條款。App 建立在 [OpenMinis](https://github.com/OpenMinis/OpenMinis) 1.13 之上——proot Linux、shell、瀏覽器、MCP、技能、排程任務、無障礙執行器；沙箱來自 [proot](https://github.com/proot-me/proot) 與 [Alpine Linux](https://alpinelinux.org/)。

## 免責聲明

nanoMuse 是獨立的社群專案，與 Meta Platforms, Inc. 及其 Muse 產品無關，未獲其背書，亦非衍生自它；Muse 是 Meta Platforms, Inc. 的商標。小龍是本專案自己的。

## 授權

[GPL-3.0-or-later](../../LICENSE)。Android App 基於 OpenMinis 1.13（GPL-3.0），自 2026-09-24 起修改；見 [NOTICE](../../NOTICE) 與 [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md)。Python 線的早期版本以 MIT 發佈（tag `pre-openminis`）。
