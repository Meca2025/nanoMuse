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
  <a href="https://github.com/nano-muse/nanoMuse/stargazers"><img src="https://img.shields.io/github/stars/nano-muse/nanoMuse?style=flat&label=stars" alt="GitHub 스타"></a>
  <a href="https://github.com/nano-muse/nanoMuse/releases"><img src="https://img.shields.io/github/downloads/nano-muse/nanoMuse/total?label=downloads" alt="다운로드 수"></a>
  <a href="https://github.com/nano-muse/nanoMuse/actions/workflows/ci.yml"><img src="https://github.com/nano-muse/nanoMuse/actions/workflows/ci.yml/badge.svg?branch=main" alt="Test Suite"></a>
  <a href="https://nanomuse.cn/web/"><img src="https://img.shields.io/badge/%EB%B8%8C%EB%9D%BC%EC%9A%B0%EC%A0%80%EC%97%90%EC%84%9C%20%EC%8D%A8%20%EB%B3%B4%EA%B8%B0-nanomuse.cn%2Fweb-5B4EE6" alt="브라우저에서 써 보기"></a>
  <a href="https://nanomuse.cn/"><img src="https://img.shields.io/badge/%EC%9B%B9%EC%82%AC%EC%9D%B4%ED%8A%B8-nanomuse.cn-0a66e4" alt="웹사이트"></a>
  <a href="https://github.com/nano-muse/nanoMuse/blob/main/LICENSE"><img src="https://img.shields.io/github/license/nano-muse/nanoMuse?label=license" alt="GPL-3.0-or-later"></a>
</p>

> [!IMPORTANT]
> **무료, 오픈 소스, 비영리 — 모두를 위한 개인 에이전트.** nanoMuse는 커뮤니티 프로젝트이며 영구 무료입니다. 전화번호나 이메일로 로그인하면 개발자가 비용을 부담하는 무료 사용량이 포함된 모델이 제공되고, 다 쓰면 자신의 API 키를 쓰면 됩니다. 아무것도 판매하지 않으며, 릴레이가 보관하는 내용은 [개인정보 처리방침](https://nanomuse.cn/privacy/)에 적혀 있고, *설정 → 데이터 제어*는 여러분의 몫입니다. 계정은 언제든 삭제할 수 있습니다. **[브라우저에서 써 보기](https://nanomuse.cn/web/)** 또는 [앱 다운로드](https://github.com/nano-muse/nanoMuse/releases/latest).

> 이 페이지는 [영어 README](../../README.md)의 번역본입니다. 영어판이 기준이며, 소식과 전체 버전 표는 그곳에 있습니다.

nanoMuse는 오픈 소스 개인 에이전트로, 당신이 가진 모든 기기를 위한 것입니다. Meta의 [Muse](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/)처럼 자기만의 이름과 모습을 가진 하나의 에이전트가 질문에 답하는 대신 일을 해내고, 앱을 닫아도 계속 일하며, 당신을 기억하고, 되돌릴 수 없는 일 앞에서는 멈춰서 먼저 묻습니다. Android 앱은 에이전트 전체를 **휴대폰 위에서** 실행합니다. Linux 루트 파일 시스템, 셸, 브라우저, MCP, 스킬, 예약 작업이 APK 안에 들어 있고, 모델은 당신이 가져옵니다. API가 없는 앱을 위한 '손'도 있습니다 — 당신의 허락 아래 휴대폰 화면 자체를 보고 누릅니다 — 그리고 당신의 컴퓨터까지 닿습니다. 휴대폰에서 말하면 컴퓨터에서 처리됩니다. 데스크톱 앱과 웹 버전도 제공되며, iOS와 글래스가 뒤따릅니다. 자신의 키 또는 공개 릴레이의 시작 사용량, GPL-3.0 — 그리고 자신만의 Muse를 만들 수 있는 토대입니다.

<p align="center">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/docs/avatar-moods.png" width="88%" alt="같은 작은 용의 다섯 가지 상태: 휴식, 작업 중, 대기, 기쁨, 미안함">
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/docs/screenshots/chat-approval.png" width="23%" alt="대화: 작업 공간에서 삭제하기 전에 에이전트가 멈춰서 묻는다 — 이번 한 번, 이 대화, 작업 공간에서는 항상, 또는 거부">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/docs/screenshots/feed.png" width="23%" alt="피드: 오늘 아침 당신을 위해 쓴 글">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/docs/screenshots/goals.png" width="23%" alt="목표: 일정에 따라 추적, 루틴 포함">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/docs/screenshots/avatar.png" width="23%" alt="아바타: 모습을 설명하면 이미지 모델이 그리고, 마음에 드는 것을 고른다">
</p>

## 왜 nanoMuse인가

네 가지가 이 프로젝트를 정의합니다.

| | |
|---|---|
| **Muse 스타일** | 도구 상자가 아니라 하나의 에이전트: 자기만의 이름과 모습, 첫 대화, 당신을 위해 쓰는 피드, 백그라운드에서 진행되는 목표, 읽고 고칠 수 있는 기억, 그리고 되돌릴 수 없는 일 앞에서의 승인. |
| **완전한 오픈** | GPL-3.0-or-later, 저장소 전체. 닫힌 구성 요소도, 꼭 써야 하는 계정이나 서버도, 꼭 써야 하는 모델도 없습니다 — 선택 사항인 nanoMuse Cloud 릴레이도 저장소에 있어 누구나 직접 운영할 수 있고, 모든 릴리스는 태그에서 빌드되어 수동으로 설치됩니다. Muse, 豆包, 千问은 누군가 주는 제품이지만 nanoMuse는 당신이 소유하는 것 — 그리고 자신만의 Muse를 만들 토대입니다. 이름을 바꾸고, 모습을 다시 그리고, 성격을 다시 쓰고, 자신의 모델과 도구를 연결하세요. |
| **API가 있든 없든, 어떤 앱이든** | 하루의 대부분은 API가 있어 본 적 없는 앱 안에서 흘러갑니다. 에이전트는 사다리를 오릅니다 — 먼저 스킬, CLI, MCP 서버, 다음은 당신의 로그인으로 가져온 페이지, 다음은 앱 내 브라우저, 그리고 허락하면 기기 화면 자체를 당신처럼 보고 누릅니다 — 결제, 전송, 삭제 전에는 같은 승인을 거칩니다. 기본은 꺼짐입니다. |
| **모든 기기** | 하나의 에이전트, 그리고 당신이 가진 모든 기기가 그 손이자 입구입니다. 휴대폰에서 말하면 PC에서 이루어지고, 글래스에 말하면 둘 다에서 이루어집니다. 휴대폰이 컴퓨터를 조작하는 것은 이미 가능하고, 데스크톱 앱과 웹도 있습니다. iOS와 글래스가 뒤따릅니다. |

Muse 및 앱의 토대인 런타임 OpenMinis와의 비교는 [영어 README](../../README.md#compared-with-muse-and-openminis)에, 계획과 그 이유는 [docs/roadmap.md](../roadmap.md)에 있습니다.

## 설치

설치 없이 먼저 한번 보기: [nanomuse.cn/web](https://nanomuse.cn/web/)을 열면 브라우저 안에 시뮬레이션된 휴대폰이 나타나고, 그 안에 당신만의 nanoMuse가 있습니다. 전화번호나 이메일과 인증 코드로 로그인하면 써 볼 수 있습니다 — 데모이며, 앱과는 차이가 큽니다. 제대로 쓰려면 아래의 휴대폰 앱과 데스크톱 앱을 같은 계정으로 쓰세요. 자신의 기기에는 [다운로드](https://nanomuse.cn/#download): Android APK, Windows / macOS / Linux용 데스크톱 앱(`nanoMuse-Desktop-<version>-…`), 터미널 바이너리(`nanomuse-desktop-terminal-<version>-…`), 또는 Python 3.11+에서 `pipx install "git+https://github.com/nano-muse/nanoMuse"`. GitHub 다운로드가 안 되는 곳이라면 같은 파일이 프로젝트 미러 [nanomuse.cn/dl](https://nanomuse.cn/dl/)에 있습니다(릴리스 후 15분 안에 동기화, SHA-256 검증). 기기들이 어떻게 만나는지는 [docs/desktop.md](../desktop.md)와 [docs/every-device.md](../every-device.md)에 있습니다. 휴대폰에서는:

1. [최신 릴리스](https://github.com/nano-muse/nanoMuse/releases/latest)에서 `nanoMuse-<version>-arm64.apk`를 내려받습니다 — Android 8.0 이상, 64비트 휴대폰. 원한다면 `sha256sum -c nanoMuse-<version>-arm64.apk.sha256`로 검증하세요.
2. 파일을 엽니다. Android가 설치 허용을 한 번 묻습니다. 모든 버전이 같은 키로 서명되어 있어 업데이트는 이전 버전 위에 설치되고 데이터는 유지됩니다.
3. 모델을 연결합니다. *로그인 — 무료*: 전화번호(코드는 SMS로 옵니다)나 이메일 주소로, 에이전트는 [nanoMuse Cloud](../cloud.md)의 무료 사용량을 갖게 됩니다 — 키도, 결제도 필요 없고, 계정 페이지에 남은 양과 늘어나는 방식이 표시됩니다. 다 쓰면 자신의 것을 가져오세요. [Alibaba Cloud Bailian](../own-key.md)은 2분 정도, OpenAI 호환 엔드포인트라면 당신의 키로, 또는 앱에 포함된 OAuth 로그인 중 하나로. 그다음 원하면 에이전트가 휴대폰 앱을 쓸 수 있게 하는 두 가지 권한(건너뛸 수 있음), 그리고 첫 대화 — 당신을 어떻게 부를지 묻고 에이전트가 자기 이름을 고릅니다.
4. 선택 사항 — *설정 → 이미지·영상 모델*: 이미지 모델(Alibaba Cloud Model Studio의 qwen-image-3.0, gpt-image-1, 또는 OpenAI images 엔드포인트가 있는 어떤 제공자든)이 있으면 에이전트가 모습을 바꾸고 그림을 그릴 수 있고, 영상 모델(Model Studio의 wan2.2-i2v-flash)이 있으면 그 모습이 움직입니다. Muse에는 이것들이 내장되어 있지만 nanoMuse는 당신의 것을 쓰며, 없으면 에이전트가 알려 줍니다.

앱은 이 저장소의 릴리스를 확인해 업데이트합니다. 각 버전의 릴리스 노트는 [docs/releases/](../releases)와 [CHANGELOG](../../CHANGELOG.md)에 있습니다.

## 무엇을 하는가

| | |
|---|---|
| **일을 해낸다** | Linux 셸, 브라우저, MCP 서버, [Agent Skills](https://agentskills.io) 형식의 스킬, 그리고 *핸즈*를 켜면 휴대폰의 앱을 화면을 통해 다룹니다. 스크린샷, 동작 하나, 또 스크린샷 — API를 먼저 시도하는 사다리, 로그인 때의 넘겨받기, 같은 승인과 함께. 에이전트는 일에 필요한 손을 고르고, 각 단계를 열어 볼 수 있는 카드로 보여 줍니다. |
| **먼저 묻는다** | 삭제, 전송, 결제 전에 멈춥니다 — 셸에서도 브라우저에서도. 승인 범위는 이번 한 번, 이 대화, 또는 이 수신자·도메인·폴더에 대해 항상 중에서 정할 수 있고, '권한'에서 취소할 수 있습니다. 비밀번호와 인증 코드는 언제나 당신이 직접 입력합니다. |
| **계속 나아간다** | 목표는 대화 속에서 만들어지고, 자체 대화에서 일정에 따라 점검됩니다. 루틴은 앱이 닫혀 있어도 실행되고, 휴대폰을 조작하는 동안 화면은 켜져 있으며, 200단계에 이르면 일찍 마무리하는 대신 "계속할까요?"라고 묻습니다. |
| **당신을 위한 피드를 쓴다** | 매일 아침, 당신에 대해 아는 것과 지켜보라고 한 것들로 서너 편에서 여섯 편의 짧은 글을 카드로 씁니다. 좋아요를 누르거나, 옆 대화에서 이야기하거나, 지울 수 있습니다. 한 문장이면 방향을 바꿀 수 있습니다. |
| **당신을 기억한다** | 자신이 누구인지(`SOUL.md`), 당신에 대해 아는 것(`USER.md`), 기억하는 것(`GLOBAL.md`와 일기), 언제 깨어나는지(`HEARTBEAT.md`)는 앱에서 읽고 고칠 수 있는 파일입니다. 다른 어시스턴트가 알던 것은 *기억 가져오기*로 옮겨 올 수 있습니다. |
| **자기만의 모습** | 한 문장으로 설명하면 이미지 모델이 그리고, 마음에 드는 것을 고릅니다. 앱은 모든 상태 — 작업 중, 대기, 기쁨, 미안함 — 의 자세를 만들고, 에이전트가 하는 일에 맞춰 숨 쉬고, 흔들리고, 고개를 갸웃하고, 튀어 오르고, 떱니다. 영상 모델이 있으면 각 상태는 짧은 반복 클립이 됩니다. 기본은 정지 이미지와 클립이 모두 들어 있는 연한 노란색 작은 용입니다. |
| **아이디어와 라이브러리** | 목표와 기억에서 나온, 다음에 물어볼 것들. 그리고 에이전트가 만든 모든 것을 미리보기와 함께. |

이 모든 것이 휴대폰에서 실행됩니다. OpenMinis의 나머지 — 터미널, 앱 내 브라우저, MCP와 스킬 관리, 모델 그룹, 토큰 사용량, 접근성 실행기, 공유 폴더 — 도 그대로 남아 같은 메뉴에서 쓸 수 있습니다.

## 버전

단계마다 작은 버전 하나, 각각 APK가 포함된 GitHub 릴리스입니다. 소식과 전체 버전 표는 [영어 README](../../README.md#versions)에, 계획과 그 이유는 [docs/roadmap.md](../roadmap.md)에, 각 버전의 노트는 [docs/releases/](../releases)와 [CHANGELOG](../../CHANGELOG.md)에 있습니다. 그다음은 순서대로: iOS, 자신의 머신(VM, 홈 서버)에서 돌리는 웹 버전, 글래스.

## 지금 어디까지 왔나

nanoMuse 0.1은 프리뷰입니다. 에이전트, 휴대폰, 데스크톱, 웹, 릴레이 모두 만드는 사람들이 매일 쓸 수 있을 만큼 돌아갑니다 — 그리고 모두에 우리가 아는 거친 부분과 아직 모르는 더 많은 거친 부분이 있습니다. 그래서 여러분에게서 무엇이 깨졌는지, 무엇을 해 주길 바라는지가 우리에게 보내 줄 수 있는 가장 쓸모 있는 것입니다. 앱은 누구나 집어 들어 쓸 수 있게 만들었습니다. 개발자 쪽 — 자신의 모델과 공급자, 셸, MCP, 스킬, 하네스, 런타임 API — 은 설정과 문서 안에 있고, 켜면 쓸 수 있습니다. 제품의 모습, 런타임의 각 면, 스킬과 플러그인 인터페이스는 한동안 빠르게 바뀌다가 차츰 안정될 것입니다. 무엇이 바뀌었는지는 [CHANGELOG](../../CHANGELOG.md)에, 다음에 무엇을 할지는 [로드맵](../roadmap.md)에 있습니다.

우리가 하려는 일은 앱 하나보다 큽니다. 쓰는 사람 자신의 것인 개인 에이전트를, 누구나 다시 쓰고 다시 조합할 수 있는 열린 기반 — 런타임, 릴레이, 휴대폰의 손, 기기 사이의 허브 — 위에서 공개된 채로 만들고, 그런 에이전트가 어디까지 갈 수 있는지에 함께 답하는 것입니다. 세계 곳곳의 사용자와 개발자와 함께 그 답을 찾아가길 기대합니다. 아이디어를 가져와 스킬, 커넥터, 모델, 기기, 번역으로 여기서 현실로 만들고, nanoMuse 주변의 생태계가 자라도록 함께해 주세요.

## 기여하기

버그를 알리고, 기능을 요청하고, 풀 리퀘스트를 보내 주세요 — 하나하나가 개인 에이전트를 모두의 손에 더 가까이 가져옵니다: **[이슈 열기](https://github.com/nano-muse/nanoMuse/issues/new/choose) · [Discussions에서 묻거나 보여 주기](https://github.com/nano-muse/nanoMuse/discussions) · [저장소에 스타 주기](https://github.com/nano-muse/nanoMuse)**. 무료 사용량, 자신의 키, 데이터가 어떻게 다뤄지는지: [docs/cloud.md](../cloud.md) · [docs/own-key.md](../own-key.md) · [docs/privacy.md](../privacy.md). 빌드 환경, 규약(`com.openminis.app` 유지, 새 코드는 `io.github.nanomuse.*`에, 업스트림 수정에는 `// nanoMuse:`, 커밋에는 `Signed-off-by`), 릴리스 방법은 [CONTRIBUTING.md](../../CONTRIBUTING.md)에 있습니다.

## 감사의 말

nanoMuse는 다른 이들의 작업 위에 서 있습니다. [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md)에 각 조건이 있습니다. 앱은 [OpenMinis](https://github.com/OpenMinis/OpenMinis) 1.13 위에 만들어졌습니다 — proot 위의 Linux, 셸, 브라우저, MCP, 스킬, 예약 작업, 접근성 실행기. 샌드박스는 [proot](https://github.com/proot-me/proot)와 [Alpine Linux](https://alpinelinux.org/)에서 왔습니다.

## 면책 조항

nanoMuse는 독립적인 커뮤니티 프로젝트입니다. Meta Platforms, Inc. 또는 그 제품 Muse와 제휴하거나 승인을 받거나 그로부터 파생된 것이 아닙니다. Muse는 Meta Platforms, Inc.의 상표입니다. 용은 이 프로젝트 고유의 것입니다.

## 라이선스

[GPL-3.0-or-later](../../LICENSE). Android 앱은 OpenMinis 1.13(GPL-3.0)을 기반으로 2026-09-24부터 수정한 것입니다. [NOTICE](../../NOTICE)와 [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md)를 참고하세요. Python 계열의 초기 버전은 MIT로 공개되었습니다(태그 `pre-openminis`).
