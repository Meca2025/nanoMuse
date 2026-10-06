<p align="center">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/assets/brand/nanomuse-cover.png" alt="nanoMuse — あなたのすべてのデバイスのための、オープンソースのパーソナルエージェント">
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
  <a href="https://github.com/nano-muse/nanoMuse/stargazers"><img src="https://img.shields.io/github/stars/nano-muse/nanoMuse?style=flat&label=stars" alt="GitHub スター"></a>
  <a href="https://github.com/nano-muse/nanoMuse/releases"><img src="https://img.shields.io/github/downloads/nano-muse/nanoMuse/total?label=downloads" alt="ダウンロード数"></a>
  <a href="https://github.com/nano-muse/nanoMuse/actions/workflows/ci.yml"><img src="https://github.com/nano-muse/nanoMuse/actions/workflows/ci.yml/badge.svg?branch=main" alt="Test Suite"></a>
  <a href="https://nanomuse.cn/docs/"><img src="https://img.shields.io/badge/Docs-nanomuse.cn%2Fdocs-0a66e4" alt="ドキュメント"></a>
  <a href="https://github.com/nano-muse/nanoMuse/blob/main/LICENSE"><img src="https://img.shields.io/github/license/nano-muse/nanoMuse?label=license" alt="GPL-3.0-or-later"></a>
  <a href="https://discord.gg/bkTySmm28X"><img src="https://img.shields.io/badge/Discord-join-5865F2?logo=discord&logoColor=white" alt="Discord"></a>
</p>

**nanoMuse は、あなたのすべてのデバイスのためのオープンソースのパーソナルエージェントです。** 名前と姿を持つひとりのエージェント。Meta の [Muse](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/) と同じ種類のもので、質問に答えるのではなく実際に手を動かし、アプリを閉じても働き続け、あなたのことを覚えていて、取り消せない操作の前には立ち止まって尋ねます。

*nano* は、自分で動かして自分で配備できるくらい小さい、ひとそろいの完全なセットという意味です。スマホアプリ、デスクトップアプリ、ウェブコンソール、そしてそれらをつなぐリレーが、すべてこのリポジトリに GPL-3.0-or-later で入っています。nanoMuse は非営利です。サインインするとコミュニティのリレーでモデルを使える無料枠がもらえます。費用は開発者が負担しています。使い切ったら[自分のキーに切り替えて](../own-key.md)ください。同じリレーは自分のサーバーでも動くので、データを外に出さないこともできます。最新版は **0.1.39 Keys** — [リリースノート](https://github.com/nano-muse/nanoMuse/releases/tag/v0.1.39) · [ブラウザで試す](https://nanomuse.cn/web/)。

<p align="center">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/docs/screenshots/chat-approval.png" width="23%" alt="チャット: ワークスペース内を削除する前にエージェントが立ち止まって尋ねる — 一度だけ、このチャット、ワークスペースでは常に許可、または拒否">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/docs/screenshots/feed.png" width="23%" alt="フィード: 今朝あなたのために書かれた投稿">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/docs/screenshots/goals.png" width="23%" alt="目標: スケジュールどおりに確認され、ルーティンもある">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/docs/screenshots/avatar.png" width="23%" alt="アバター: 姿を言葉で描写すると画像モデルが描き、気に入ったものを選ぶ">
</p>

## インストール

| | |
|---|---|
| **Android** 8.0 以上、arm64 | [nanoMuse-0.1.39-arm64.apk](https://github.com/nano-muse/nanoMuse/releases/download/v0.1.39/nanoMuse-0.1.39-arm64.apk) — すべてのバージョンが同じ鍵で署名され、上書きインストールできます |
| **iPhone / iPad** | TestFlight、現在は内部テスターのみ <!-- coordinator: 公開 TestFlight リンクができたらここに --> |
| **macOS** 12 以上 | [Apple シリコン](https://github.com/nano-muse/nanoMuse/releases/download/v0.1.39/nanoMuse-Desktop-0.1.39-mac-arm64.dmg) · [Intel](https://github.com/nano-muse/nanoMuse/releases/download/v0.1.39/nanoMuse-Desktop-0.1.39-mac-x64.dmg) — 公証なし。初回は右クリック → 「開く」 |
| **Windows** 10 以上 | [nanoMuse-Desktop-0.1.39-win-x64.exe](https://github.com/nano-muse/nanoMuse/releases/download/v0.1.39/nanoMuse-Desktop-0.1.39-win-x64.exe) — 一度だけ「実行」を押してください |
| **Linux** x64 | [AppImage](https://github.com/nano-muse/nanoMuse/releases/download/v0.1.39/nanoMuse-Desktop-0.1.39-linux-x64.AppImage) · [.deb](https://github.com/nano-muse/nanoMuse/releases/download/v0.1.39/nanoMuse-Desktop-0.1.39-linux-x64.deb) · [tar.gz](https://github.com/nano-muse/nanoMuse/releases/download/v0.1.39/nanoMuse-Desktop-0.1.39-linux-x64.tar.gz) |
| **Docker** | `bash scripts/self-host.sh --local` で自分のリレーを、`docker compose up -d app` で自分のサーバーにウェブアプリを — [セルフホスティング](../self-hosting.md) |

ダウンロードはすべて [GitHub の最新リリース](https://github.com/nano-muse/nanoMuse/releases/latest)から。GitHub が遅い地域では同じファイルが [nanomuse.cn/dl](https://nanomuse.cn/dl/) にあります。アプリを開き、メールアドレスか中国本土の携帯番号でサインインすれば、エージェントは考えるためのモデルを持ちます。スマホ、デスクトップ、ウェブはひとつのアカウントを共有し、同じ会話が見えます。

## できること

<table>
  <tr>
    <td width="50%" valign="top"><b>実際に手を動かす。</b><br>Linux シェル、ブラウザ、MCP サーバー、スキル。さらに <i>Hands</i> をオンにすれば、API が一度も存在しなかったものに向けて、スマホのアプリやパソコンのウィンドウを画面越しに操作します。</td>
    <td width="50%" valign="top"><b>先に尋ねる。</b><br>削除、送信、支払いの前に一度止まり、「一度だけ / このチャット / 常に」として記憶します。パスワードや認証コードはあなたが入力します。ログインや CAPTCHA はあなたに引き渡され、「完了」で再開します。</td>
  </tr>
  <tr>
    <td width="50%" valign="top"><b>他のデバイスに届く。</b><br>スマホで言えば PC で実行されます。メッセージの先頭に <code>@Mac …</code> と書くとそのマシンへ送られます。承認は手元のデバイスに戻ってきます。</td>
    <td width="50%" valign="top"><b>動き続ける。</b><br>目標はスケジュールどおりに確認され、ルーティンはアプリを閉じていても動き、毎朝あなた宛てのフィードが書かれます。</td>
  </tr>
  <tr>
    <td width="50%" valign="top"><b>あなたを覚えている。</b><br>自分が何者か、あなたについて何を知っているか、いつ起きるかは、読めて編集できる Markdown ファイルです。</td>
    <td width="50%" valign="top"><b>チャットアプリの中に住む。</b><br>飞书、钉钉、企业微信、Telegram で返事をします。</td>
  </tr>
  <tr>
    <td width="50%" valign="top"><b>自分の姿。</b><br>言葉で描写すれば画像モデルが描き、動画モデルが動かします。デフォルトは小さなドラゴン。</td>
    <td width="50%" valign="top"><b>どのモデルでも。</b><br>リレーの無料枠、18 社（Bailian、OpenRouter、OpenAI、Gemini、DeepSeek など）のいずれかで自分のキー、あるいは既に支払っているプラン：ChatGPT、Claude、Kimi。画像や動画のモデルがない事業者ではその二つは使えず、アプリがそう伝えます。</td>
  </tr>
</table>

## 仕組み

どのデバイスも自分のエージェントを動かします。スマホは APK の中で(proot 上の Alpine Linux、シェル、ブラウザ、MCP)、パソコンは nanoMuse Desktop の中で(DeepSeek Harness と、手のための Python ランタイム)。サインインするとリレーで出会い、互いに頼みごとができます。会話のテキストはリレーを通りますが、ファイルやスクリーンショットは作られたデバイスに残ります。

<p align="center">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/assets/brand/devices-loop.png" alt="Android、デスクトップ（Mac、Windows、Linux）、iPhone と iPad、ウェブ版がひとつのアカウントを囲む：リレーが各端末をサインインさせ、端末間で会話を運ぶ" width="92%">
</p>

デバイスについては [docs/every-device.md](../every-device.md)、フレームは [docs/hub.md](../hub.md)、リレーは [docs/cloud.md](../cloud.md)、何を保存するかは [docs/privacy.md](../privacy.md)。

## Muse、OpenMinis との比較

| | Meta Muse | OpenMinis | nanoMuse |
|---|---|---|---|
| エージェントが動く場所 | ユーザーごとのクラウド VM | インストールしたスマホ | あなたのスマホ、パソコン、または自分のサーバー — ひとつのアカウントで |
| API のないアプリ | 届かない。VM はデバイスに触れない | Android のアクセシビリティ CLI | スマホでもパソコンでも画面を手として使う。スクリーンショットを見て、API を先に試し、ログインはあなたが引き受ける。iOS では不可 — OS が許していない |
| 他のデバイス | ひとつの VM のクライアント | インストールした 1 台だけ | デバイス同士が hub 経由で頼み合い、承認はあなたのいる場所で |
| モデル | Meta のもの | 自分で用意 | リレーの無料枠、または自分のもの |
| ライセンス | クローズド | GPL-3.0 | GPL-3.0-or-later、OpenMinis の上に構築 |

## ドキュメント

[nanomuse.cn/docs](https://nanomuse.cn/docs/) — プラットフォーム別のインストール、すべてのデバイス、Hands、コネクタ、記憶、セルフホスティング、プロトコル。ソースは [docs/](../) に、各バージョンの変更点は [CHANGELOG](../../CHANGELOG.md) と [docs/releases/](../releases/) にあります。

## セルフホスティング

VPS 1 台、1 時間: [docs/self-hosting.md](../self-hosting.md)。三つの道 — サーバーなしで自分のキーだけ、`scripts/self-host.sh` で自分のリレー、ウェブアプリ用に自分のランタイム。

## 貢献する

実際の用事に使い、壊れたところを報告し、それから小さく具体的なことをひとつ選んでください。[CONTRIBUTING.md](../../CONTRIBUTING.md) にセットアップと規約、[AGENTS.md](../../AGENTS.md) にこのツリーでコーディングエージェントが守るルール、[ロードマップ](../roadmap.md)にどこから始めるか。[Issues](https://github.com/nano-muse/nanoMuse/issues) · [Discussions](https://github.com/nano-muse/nanoMuse/discussions) · [Discord](https://discord.gg/bkTySmm28X)。

## 謝辞

nanoMuse は他の人たちの仕事の上に立っています。条件は [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md) に。

- [OpenMinis](https://github.com/OpenMinis/OpenMinis) — スマホアプリの土台となったオンデバイスのエージェント。サンドボックスは [proot](https://github.com/nano-muse/proot) と [Alpine Linux](https://alpinelinux.org/)。
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) — デスクトップアプリがプラグインとして載っているエージェントハーネス。
- [UI-TARS-desktop](https://github.com/bytedance/UI-TARS-desktop)(ByteDance)— デスクトップの手のオペレーターはその移植で、ステージのマーカーは ScreenMarker に倣っています。
- [MobileGym](https://github.com/Purewhiter/mobilegym)、[MemGUI-Bench](https://github.com/lgy0404/MemGUI-Bench)、[PhoneHarness](https://github.com/PhoneHarness/PhoneHarness)、[CopilotKit/OpenMuse](https://github.com/CopilotKit/OpenMuse)、[Open-AutoGLM](https://github.com/zai-org/Open-AutoGLM)、[ClawGUI](https://github.com/ZJU-REAL/ClawGUI) — スマホのオペレーター、トレース、製品の着想。

## 免責事項

nanoMuse は独立したコミュニティプロジェクトで、Meta Platforms, Inc. とは無関係であり、その支持も受けていません。Muse は同社の商標です。ドラゴンはこのプロジェクトのものです。

## ライセンス

[GPL-3.0-or-later](../../LICENSE)。スマホアプリは OpenMinis 1.13(GPL-3.0)をもとに 2026-09-24 以降改変しています — [NOTICE](../../NOTICE) を参照。それ以前の Python 系統のバージョンは MIT でした(タグ `pre-openminis`)。
