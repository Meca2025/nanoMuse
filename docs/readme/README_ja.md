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
  <a href="https://github.com/nano-muse/nanoMuse/stargazers"><img src="https://img.shields.io/github/stars/nano-muse/nanoMuse?style=flat&label=stars" alt="GitHub スター"></a>
  <a href="https://github.com/nano-muse/nanoMuse/releases"><img src="https://img.shields.io/github/downloads/nano-muse/nanoMuse/total?label=downloads" alt="ダウンロード数"></a>
  <a href="https://github.com/nano-muse/nanoMuse/actions/workflows/ci.yml"><img src="https://github.com/nano-muse/nanoMuse/actions/workflows/ci.yml/badge.svg?branch=main" alt="Test Suite"></a>
  <a href="https://nanomuse.cn/web/"><img src="https://img.shields.io/badge/%E3%83%96%E3%83%A9%E3%82%A6%E3%82%B6%E3%81%A7%E8%A9%A6%E3%81%99-nanomuse.cn%2Fweb-5B4EE6" alt="ブラウザで試す"></a>
  <a href="https://nanomuse.cn/"><img src="https://img.shields.io/badge/%E5%85%AC%E5%BC%8F%E3%82%B5%E3%82%A4%E3%83%88-nanomuse.cn-0a66e4" alt="公式サイト"></a>
  <a href="https://github.com/nano-muse/nanoMuse/blob/main/LICENSE"><img src="https://img.shields.io/github/license/nano-muse/nanoMuse?label=license" alt="GPL-3.0-or-later"></a>
</p>

> [!IMPORTANT]
> **無料・オープンソース・非営利 —— すべての人のためのパーソナルエージェント。** nanoMuse はコミュニティプロジェクトで、ずっと無料です。電話番号かメールアドレスでサインインすると、開発者が負担する無料枠付きのモデルが使えます。使い切ったら、自分の API キーを使ってください。メッセージは、あなたが提供を選ばない限り保存されません。何も販売しません。アカウントはいつでも削除できます。**[ブラウザで試す](https://nanomuse.cn/web/)**、または[アプリをダウンロード](https://github.com/nano-muse/nanoMuse/releases/latest)。

> このページは[英語版 README](../../README.md) の翻訳です。英語版が基準で、最新情報と完全なバージョン表はそちらにあります。

nanoMuse は、オープンソースのパーソナルエージェントで、あなたのすべてのデバイスのためのものです。Meta の [Muse](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/) のように、自分の名前と姿を持つひとりのエージェントが、質問に答えるのではなく物事を片づけ、アプリを閉じていても働き続け、あなたのことを覚え、取り消せない操作の前には立ち止まって確認します。Android アプリはエージェント全体を**スマートフォン上で**動かします。Linux のルートファイルシステム、シェル、ブラウザ、MCP、スキル、スケジュールタスクが APK の中にあり、モデルはあなたが用意します。API を持たないアプリのための「手」もあります —— あなたの許可のもと、スマートフォンの画面そのものを見て、タップします。そしてあなたのパソコンにも届きます。スマートフォンで言えば、パソコンで実行されます。デスクトップアプリと Web 版も提供中。iOS とグラスはこの後に続きます。自分のキー、またはオープンなリレーからのスタート枠、GPL-3.0 —— そして、あなた自身の Muse を作るための土台です。

<p align="center">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/docs/avatar-moods.png" width="88%" alt="同じ小さなドラゴンの五つの状態：休憩、作業中、待機、嬉しい、ごめんなさい">
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/docs/screenshots/chat-approval.png" width="23%" alt="チャット：ワークスペース内で削除する前にエージェントが立ち止まって確認 —— 今回だけ、このチャット、ワークスペースでは常に許可、または拒否">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/docs/screenshots/feed.png" width="23%" alt="フィード：今朝あなたのために書かれた投稿">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/docs/screenshots/goals.png" width="23%" alt="ゴール：スケジュールに沿って追跡、ルーティン付き">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/docs/screenshots/avatar.png" width="23%" alt="アバター：姿を言葉で描写すると画像モデルが描き、気に入ったものを選ぶ">
</p>

## なぜ nanoMuse か

このプロジェクトを定義する四つのこと。

| | |
|---|---|
| **Muse スタイル** | ツールボックスではなく、ひとりのエージェント。自分の名前と姿、最初の会話、あなたのために書かれるフィード、バックグラウンドで進むゴール、読んで編集できる記憶、そして取り消せない操作の前の承認。 |
| **完全にオープン** | GPL-3.0-or-later、リポジトリ全体が対象です。クローズドなコンポーネントはなく、使わなければならないアカウントやサーバーもモデルもありません —— オプションの nanoMuse Cloud リレーもリポジトリにあり、誰でも自分で動かせます。各リリースはそのタグからビルドされ、手動でインストールします。Muse、豆包、千問は与えられる製品。nanoMuse はあなたが所有するもの —— そして、自分の Muse を作るための土台です。名前を変え、姿を描き直し、性格を書き換え、自分のモデルとツールをつなげられます。 |
| **API の有無を問わず、どんなアプリでも** | 一日の大半は、API を持ったことのないアプリの中で過ぎていきます。エージェントは梯子を登ります —— まずスキル、CLI、MCP サーバー、次にあなたのログインで取得したページ、次にアプリ内ブラウザ、そして許可があればデバイスの画面そのものを、あなたと同じように見てタップします —— 支払い・送信・削除の前には同じ承認があります。デフォルトではオフです。 |
| **すべてのデバイス** | ひとりのエージェント。あなたの持つすべてのデバイスが、その手であり入口です。スマートフォンで言えば PC で実行され、グラスに言えば両方で実行されます。スマートフォンからパソコンを操作することはすでにでき、デスクトップアプリと Web もあります。iOS とグラスが続きます。 |

Muse との比較、そしてアプリの土台であるランタイム OpenMinis との比較は[英語版 README](../../README.md#compared-with-muse-and-openminis) に。計画とその理由は [docs/roadmap.md](../roadmap.md) に。

## インストール

インストールせずにまず一目：[nanomuse.cn/web](https://nanomuse.cn/web/) を開くとブラウザの中にシミュレートされたスマートフォンが現れ、その中に専用の nanoMuse がいます。電話番号かメールアドレスと認証コードでサインインすれば試せます —— これはデモで、アプリとは大きく違います。本物は、以下のスマートフォンアプリとデスクトップアプリを同じアカウントで。自分のデバイス向けには[ダウンロード](https://nanomuse.cn/#download)：Android APK、Windows / macOS / Linux 用デスクトップアプリ（`nanoMuse-Desktop-<version>-…`）、ターミナル版バイナリ（`nanomuse-desktop-terminal-<version>-…`）、または Python 3.11+ で `pipx install "git+https://github.com/nano-muse/nanoMuse"`。GitHub からのダウンロードがうまくいかない場合は、同じファイルがプロジェクトのミラー [nanomuse.cn/dl](https://nanomuse.cn/dl/) にあります（リリース後15分以内に同期、SHA-256 で検証）。それぞれがどうつながるかは [docs/desktop.md](../desktop.md) と [docs/every-device.md](../every-device.md) に。スマートフォンでは：

1. [最新リリース](https://github.com/nano-muse/nanoMuse/releases/latest)から `nanoMuse-<version>-arm64.apk` をダウンロード —— Android 8.0 以降、64 ビットの端末。必要なら `sha256sum -c nanoMuse-<version>-arm64.apk.sha256` で検証してください。
2. 開きます。Android がインストールの許可を一度だけ尋ねます。どのバージョンも同じキーで署名されているので、更新は前のバージョンに上書きされ、データは保持されます。
3. モデルをつなぎます。*サインイン —— 無料*：電話番号（コードは SMS で届きます）かメールアドレスで、エージェントは [nanoMuse Cloud](../cloud.md) の無料枠を使えます —— キー不要、支払いなし。アカウントページに残量と増え方が表示されます。使い切ったら自分のものを：[Alibaba Cloud Bailian](../own-key.md) なら2分ほど、OpenAI 互換のエンドポイントならあなたのキーで、またはアプリに同梱の OAuth サインインのいずれか。その後、よければエージェントがスマートフォンのアプリを使うための二つの権限（スキップ可）、そして最初の会話 —— あなたの呼び方を尋ね、エージェントが自分の名前を選びます。
4. 任意 —— *設定 → 画像・動画モデル*：画像モデル（Alibaba Cloud Model Studio の qwen-image-3.0、gpt-image-1、または OpenAI の images エンドポイントを持つ任意のプロバイダー）があれば、エージェントは姿を変えたり絵を描いたりできます。動画モデル（Model Studio の wan2.2-i2v-flash）があれば、その姿が動きます。Muse はこれらを内蔵していますが、nanoMuse はあなたのものを使い、足りないときはエージェントがそう伝えます。

アプリはこのリポジトリのリリースを見て更新を確認します。各バージョンのリリースノートは [docs/releases/](../releases) と [CHANGELOG](../../CHANGELOG.md) に。

## できること

| | |
|---|---|
| **物事を片づける** | Linux シェル、ブラウザ、MCP サーバー、[Agent Skills](https://agentskills.io) 形式のスキル、そして *ハンズ* をオンにすれば、スマートフォンのアプリをその画面を通じて操作します。スクリーンショット、ひとつの操作、またスクリーンショット —— API を先に試す梯子、ログイン時の引き継ぎ、同じ承認とともに。エージェントは仕事に必要な手を選び、各ステップを開けるカードとして見せます。 |
| **先に尋ねる** | 削除・送信・支払いの前に止まります —— シェルでもブラウザでも。承認の範囲は、今回だけ、このチャット、またはこの宛先・ドメイン・フォルダでは常に、から選べ、「権限」で取り消せます。パスワードと認証コードは、いつもあなたが入力します。 |
| **続ける** | ゴールはチャットの中で形になり、専用の会話でスケジュールに沿って確認されます。ルーティンはアプリを閉じていても動き、スマートフォンを操作している間は画面が点いたままになり、200 ステップで早めに切り上げる代わりに「続けますか？」と尋ねます。 |
| **あなたのためにフィードを書く** | 毎朝、あなたについて知っていることと、追いかけるよう頼まれたことから、三〜六本の短い投稿をカードとして。いいねしたり、サイドチャットで話したり、削除したりできます。一文で方向を変えられます。 |
| **あなたを覚えている** | 自分が誰か（`SOUL.md`）、あなたについて知っていること（`USER.md`）、覚えていること（`GLOBAL.md` と日記）、いつ目を覚ますか（`HEARTBEAT.md`）は、アプリ内で読んで編集できるファイルです。別のアシスタントが知っていたことは *記憶をインポート* で持ち込めます。 |
| **自分の姿** | 一文で描写すると、あなたの画像モデルが描き、気に入ったものを選びます。アプリはそれをすべての状態 —— 作業中、待機、嬉しい、ごめんなさい —— のポーズにし、エージェントの動きに合わせて息をし、揺れ、首をかしげ、跳ね、震えます。動画モデルがあれば、各状態は短いループ動画になります。デフォルトは、静止画とクリップ付きの淡い黄色の小さなドラゴンです。 |
| **アイデアとライブラリ** | ゴールと記憶から生まれる、次に聞くこと。そして作ったものすべてを、プレビュー付きで。 |

これらはすべてスマートフォン上で動きます。OpenMinis のそれ以外 —— ターミナル、アプリ内ブラウザ、MCP とスキルの管理、モデルグループ、トークン使用量、アクセシビリティ実行器、共有フォルダ —— も残っていて、同じメニューから使えます。

## バージョン

各段階ごとに小さなバージョンをひとつ、それぞれ APK 付きの GitHub リリースです。最新情報と完全なバージョン表は[英語版 README](../../README.md#versions) に、計画とその理由は [docs/roadmap.md](../roadmap.md) に、各バージョンのノートは [docs/releases/](../releases) と [CHANGELOG](../../CHANGELOG.md) に。この後は順に：iOS、自分のマシン（VM やホームサーバー）で動かす Web 版、グラス。

## いまどこにいるか

nanoMuse 0.1 はプレビュー版です。エージェント、スマートフォン、デスクトップ、Web、リレーのどれも、作っている本人たちが毎日使えるところまで動いています——そしてどれにも、私たちが知っている粗さと、まだ知らない粗さがあります。だから、あなたの手元で何が壊れたか、何ができてほしいかが、いちばん役に立つ知らせです。アプリは誰でも手に取れるように作ってあります。開発者向けの面——自分のモデルとプロバイダー、シェル、MCP、スキル、ハーネス、ランタイムの API——は設定とドキュメントの中にあり、オンにすれば使えます。製品の形、ランタイムの各面、スキルとプラグインのインターフェースはしばらく速く変わり続け、少しずつ安定していきます。何が変わったかは [CHANGELOG](../../CHANGELOG.md) に、次に何をするかは[ロードマップ](../roadmap.md)にあります。

私たちが目指すものはひとつのアプリより大きいものです。使う本人のものであるパーソナルエージェントを、誰でも再利用し組み合わせ直せる開かれた基盤——ランタイム、リレー、スマートフォンの手、デバイス間のハブ——の上で公開のまま作り、そうしたエージェントがどこまで行けるのかという問いに、みんなで答えを出すこと。世界中のユーザーと開発者と一緒にそれを確かめていけるのを楽しみにしています。アイデアを持ってきて、スキル、コネクター、モデル、デバイス、翻訳として、ここで形にしてください。nanoMuse のまわりのエコシステムを一緒に育てましょう。

## 貢献する

バグ報告、機能の提案、プルリクエスト —— そのひとつひとつが、パーソナルエージェントをすべての人の手の届くところへ近づけます：**[Issue を開く](https://github.com/nano-muse/nanoMuse/issues/new/choose) · [Discussions で質問・共有する](https://github.com/nano-muse/nanoMuse/discussions) · [リポジトリにスターを付ける](https://github.com/nano-muse/nanoMuse)**。無料枠、自分のキー、あなたのデータの扱い：[docs/cloud.md](../cloud.md) · [docs/own-key.md](../own-key.md) · [docs/privacy.md](../privacy.md)。ビルド環境、規約（`com.openminis.app` は維持、新しいコードは `io.github.nanomuse.*` に、上流ファイルの変更には `// nanoMuse:`、コミットには `Signed-off-by`）、リリースの切り方は [CONTRIBUTING.md](../../CONTRIBUTING.md) に。

## 謝辞

nanoMuse は他の人々の仕事の上に立っています。[THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md) に各ライセンスがあります。アプリは [OpenMinis](https://github.com/OpenMinis/OpenMinis) 1.13 の上に作られています —— proot 上の Linux、シェル、ブラウザ、MCP、スキル、スケジュールタスク、アクセシビリティ実行器。サンドボックスは [proot](https://github.com/proot-me/proot) と [Alpine Linux](https://alpinelinux.org/) によるものです。

## 免責事項

nanoMuse は独立したコミュニティプロジェクトです。Meta Platforms, Inc. およびその製品 Muse とは提携しておらず、承認も受けておらず、派生したものでもありません。Muse は Meta Platforms, Inc. の商標です。ドラゴンはこのプロジェクト独自のものです。

## ライセンス

[GPL-3.0-or-later](../../LICENSE)。Android アプリは OpenMinis 1.13（GPL-3.0）をもとに、2026-09-24 以降に変更を加えたものです。[NOTICE](../../NOTICE) と [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md) を参照してください。Python 系統の初期バージョンは MIT で公開されていました（タグ `pre-openminis`）。
