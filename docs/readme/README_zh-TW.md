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
> **免費 · 開源 · 非營利 —— 做屬於所有人的個人智慧代理。** nanoMuse 是社群專案，永久免費：用手機號碼或電子郵件登入，模型自帶一份免費額度，費用由開發者承擔；用完可以換成自己的 key。資料不會出售；伺服器保存什麼寫在[隱私權政策](https://nanomuse.cn/privacy/)裡，「設定 → 資料控制」由你決定；帳號隨時可以刪除。**[在瀏覽器裡試試](https://nanomuse.cn/web/)**，或[下載 App](https://github.com/nano-muse/nanoMuse/releases/latest)。

> 這一頁是 [英文 README](../../README.md) 的譯文；英文版是基準，最新消息與完整版本表都在那裡。

nanoMuse 是一個開源的個人智慧代理，為你的每一台裝置而生：一個有自己名字和模樣的代理，像 Meta 的 [Muse](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/) 一樣，不只回答問題，而是把事情做完；App 關掉它也繼續工作，記得你，在任何無法復原的操作前先停下來問你。Android App 把整個代理跑在**手機上**：一個 Linux 根檔案系統、shell、瀏覽器、MCP、技能和排程任務都在 APK 裡，模型由你自備。對於那些從來沒有 API 的 App，它有一雙「手」——經你允許，直接看手機螢幕、點手機螢幕；它還能連到你的電腦：在手機上說一句，電腦上就做完。桌面版和網頁版也已經推出；iOS 和眼鏡接著來。自己的 key，或是來自開放 relay 的起步額度，GPL-3.0——也是一個你可以拿來做自己的 Muse 的底子。

<p align="center">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/docs/avatar-moods.png" width="88%" alt="同一隻小龍的五種狀態：休息、工作中、等待、開心、抱歉">
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/docs/screenshots/chat-approval.png" width="23%" alt="對話：在工作區刪除之前，代理停下來問——只這一次、這個對話、工作區永遠允許，或拒絕">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/docs/screenshots/feed.png" width="23%" alt="動態：今天早上為你寫的貼文">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/docs/screenshots/goals.png" width="23%" alt="目標：按排程追蹤，附例行事項">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/docs/screenshots/avatar.png" width="23%" alt="虛擬形象：描述一個模樣，你的圖片模型畫出來，挑一張你喜歡的">
</p>

## 為什麼是 nanoMuse

四件事定義了這個專案。

| | |
|---|---|
| **Muse 風格** | 一個代理，不是一箱工具：自己的名字和模樣、第一次對話、為你寫的動態、在背景推進的目標、可以讀也可以改的記憶，以及任何無法復原的操作之前的一次確認。 |
| **完全開源** | GPL-3.0-or-later，整個倉庫。沒有閉源元件，沒有非用不可的帳號、伺服器或模型——可選的 nanoMuse Cloud relay 也在倉庫裡，任何人都能自己架一個；每個版本都從它的 tag 建置、手動安裝。Muse、豆包、千問是別人給你的產品；nanoMuse 是你自己擁有的——也是做你自己的 Muse 的底子：改名字、重畫模樣、重寫個性、接上你自己的模型和工具。 |
| **任何 App，有沒有 API 都行** | 一天裡的大部分事情都在那些從來沒有 API 的 App 裡。代理按一個梯子往上走——先試技能、CLI 或 MCP 伺服器，再用你的登入狀態抓網頁，再用 App 內瀏覽器，最後在你允許時直接看、直接點裝置的螢幕，像你自己一樣——付款、傳送、刪除前同樣先確認。預設關閉。 |
| **每一台裝置** | 一個代理，你擁有的每一台裝置都是它的一雙手、一扇門：在手機上說，在電腦上發生；對眼鏡說，兩邊都發生。手機已經能驅動你的電腦，桌面版和網頁版已經推出；iOS 和眼鏡接著來。 |

和 Muse、以及這個 App 所基於的執行時 OpenMinis 怎麼比：見[英文 README](../../README.md#compared-with-muse-and-openminis)。計畫與理由：[docs/roadmap.md](../roadmap.md)。

## 安裝

什麼都不用裝就能先看一眼：[nanomuse.cn/web](https://nanomuse.cn/web/) 打開是瀏覽器裡的一台模擬手機，裡面有一個你自己的 nanoMuse，用手機號碼或電子郵件收個驗證碼登入就能試——這是示範，和 App 差得不少；要完整體驗，請裝下面的手機 App 和桌面版，同一個帳號。給你自己的裝置——[下載](https://nanomuse.cn/#download)：Android APK、Windows / macOS / Linux 桌面版（`nanoMuse-Desktop-<version>-…`）、終端機版（`nanomuse-desktop-terminal-<version>-…`），或用 Python 3.11+ 執行 `pipx install "git+https://github.com/nano-muse/nanoMuse"`；GitHub 的下載在哪裡不通，同樣的檔案也在專案的鏡像 [nanomuse.cn/dl](https://nanomuse.cn/dl/)（發佈後十五分鐘內同步，SHA-256 校驗）；[docs/desktop.md](../desktop.md) 與 [docs/every-device.md](../every-device.md) 說明它們怎麼連在一起。在手機上：

1. 從[最新版本](https://github.com/nano-muse/nanoMuse/releases/latest)下載 `nanoMuse-<version>-arm64.apk`——Android 8.0 或更新、64 位元手機。願意的話用 `sha256sum -c nanoMuse-<version>-arm64.apk.sha256` 校驗。
2. 開啟它。Android 會問一次是否允許安裝；每個版本都用同一把金鑰簽名，所以更新會覆蓋安裝並保留你的資料。
3. 接上模型。*登入——免費*：手機號碼（驗證碼走簡訊）或電子郵件，代理就有了 [nanoMuse Cloud](../cloud.md) 的免費額度——不用 key，不用付錢；帳號頁會說還剩多少、怎麼增加。用完了換自己的：[阿里雲百煉](../own-key.md)大約兩分鐘，任何 OpenAI 相容端點加你的 key，或 App 內建的 OAuth 登入之一。然後，如果你願意，開啟讓代理使用手機 App 的兩項權限（可跳過），再進行第一次對話：它會問怎麼稱呼你，並為自己挑一個名字。
4. 可選——*設定 → 圖片與影片模型*：一個圖片模型（阿里雲百煉的 qwen-image-3.0、gpt-image-1，或任何有 OpenAI images 端點的供應商）讓代理能換模樣、畫圖；一個影片模型（百煉的 wan2.2-i2v-flash）讓模樣動起來。Muse 內建這些；nanoMuse 用你自己的，少了哪個代理會告訴你。

App 會檢查這個倉庫的 release 來更新。每個版本的發佈說明在 [docs/releases/](../releases) 與 [CHANGELOG](../../CHANGELOG.md)。

## 它能做什麼

| | |
|---|---|
| **把事做完** | Linux shell、瀏覽器、MCP 伺服器、[Agent Skills](https://agentskills.io) 格式的技能，以及——開啟「雙手」之後——透過螢幕操作手機上的 App：截一張圖、做一個動作、再截一張，先試 API 的梯子、登入時由你接手、同樣的確認機制。代理選擇這件事需要的那隻手，每一步都是一張可以展開的卡片。 |
| **先問再做** | 刪除、傳送、付款之前停下——在 shell 裡、瀏覽器裡，以及 Hands 在手機螢幕上點按時都是——由你決定允許的範圍：只這一次、這個對話，或對這個收件人、網域、資料夾永遠允許，並可在「權限」裡撤銷。密碼和驗證碼永遠由你來輸入。 |
| **持續推進** | 目標在對話裡成形，按排程在自己的對話裡檢查；例行事項在 App 關閉時也會執行；它操作手機時螢幕保持常亮；到 200 步時會問「繼續嗎？」而不是提前收尾。 |
| **為你寫動態** | 每天早上三到六則短貼文，來自它對你的了解和你要它關注的事，做成卡片——可以按讚、在側邊對話裡討論，或刪掉。一句話就能調整方向。 |
| **記得你** | 它是誰（`SOUL.md`）、它了解你什麼（`USER.md`）、它記得什麼（`GLOBAL.md` 和一本日記）、它什麼時候醒來（`HEARTBEAT.md`）都是你在 App 裡可以讀、可以改的檔案。用「匯入記憶」把另一個助理知道的帶過來。 |
| **自己的模樣** | 一句話描述；你的圖片模型畫出來；你挑一張。App 把它擺成每種狀態的姿勢——工作中、等待、開心、抱歉——並隨代理正在做的事呼吸、晃動、歪頭、彈跳、搖頭；有影片模型時，每種狀態是一段循環短片。預設是一隻淡黃色的小龍，靜圖和短片都附上。 |
| **靈感與媒體庫** | 接下來可以問的事，來自你的目標和記憶；以及它做出來的一切，附預覽。 |

全部都在手機上執行；OpenMinis 的其餘部分——終端機、App 內瀏覽器、MCP 與技能管理、模型群組、token 用量、無障礙執行器、共用資料夾——都保留著，從同一組選單就能進入。

## 版本

每個階段一個小版本，每個版本都是附 APK 的 GitHub release。最新消息與完整版本表見[英文 README](../../README.md#versions)；計畫與理由在 [docs/roadmap.md](../roadmap.md)；每個版本的說明在 [docs/releases/](../releases) 與 [CHANGELOG](../../CHANGELOG.md)。接下來依序是：iOS；在你自己的機器上跑網頁版（虛擬機、家用伺服器）；眼鏡。

## 現在走到哪裡了

nanoMuse 0.1 還是預覽版。智慧體、手機端、桌面端、網頁版和中繼每天都被做它的人用著，也都有我們知道的毛邊，和更多我們還不知道的——所以在你這裡哪裡壞了、你希望它能做什麼，是你能給我們最有用的東西。應用是給所有人用的；開發者的那一面——自己的模型和服務商、shell、MCP、技能、harness、執行時期的 API——都在設定和文件裡，打開就有。產品形態、執行時期的各個面、技能與外掛介面一段時間內還會快速變化，並逐步穩定下來；[CHANGELOG](../../CHANGELOG.md) 記錄改了什麼，[路線圖](../roadmap.md) 說接下來做什麼。

我們想做的事比一個應用大：一個屬於使用者本人的個人智慧體，在任何人都能重複使用、重組的開放基礎設施上公開地做出來——執行時期、中繼、手機上的 Hands、裝置之間的 hub——也一起回答這樣的智慧體到底能走多遠。我們期待和世界各地的使用者與開發者一起找到答案：把你的想法在這裡變成現實，一個技能、一個連接器、一個模型、一台裝置或一份翻譯，讓 nanoMuse 周圍的生態長起來。

## 參與

回報一個 bug、提一個需求、送一個 pull request——每一個都讓個人智慧代理離所有人更近一步：**[開 issue](https://github.com/nano-muse/nanoMuse/issues/new/choose) · [在 Discussions 提問或分享](https://github.com/nano-muse/nanoMuse/discussions) · [給倉庫一顆星](https://github.com/nano-muse/nanoMuse)**。免費額度、自己的 key 和你的資料怎麼運作：[docs/cloud.md](../cloud.md) · [docs/own-key.md](../own-key.md) · [docs/privacy.md](../privacy.md)。建置方式、慣例（`com.openminis.app` 保留、新程式碼放在 `io.github.nanomuse.*`、上游改動標 `// nanoMuse:`、commit 帶 `Signed-off-by`）與發版流程見 [CONTRIBUTING.md](../../CONTRIBUTING.md)。

## 致謝

nanoMuse 站在他人的工作之上；[THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md) 列出各自的授權條款。App 建立在 [OpenMinis](https://github.com/OpenMinis/OpenMinis) 1.13 之上——proot Linux、shell、瀏覽器、MCP、技能、排程任務、無障礙執行器；沙箱來自 [proot](https://github.com/proot-me/proot) 與 [Alpine Linux](https://alpinelinux.org/)。

## 免責聲明

nanoMuse 是獨立的社群專案，與 Meta Platforms, Inc. 及其 Muse 產品無關，未獲其背書，亦非衍生自它；Muse 是 Meta Platforms, Inc. 的商標。小龍是本專案自己的。

## 授權

[GPL-3.0-or-later](../../LICENSE)。Android App 基於 OpenMinis 1.13（GPL-3.0），自 2026-09-24 起修改；見 [NOTICE](../../NOTICE) 與 [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md)。Python 線的早期版本以 MIT 發佈（tag `pre-openminis`）。
