<p align="center">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/assets/brand/nanomuse-cover.png" alt="nanoMuse — trợ lý cá nhân mã nguồn mở cho mọi thiết bị của bạn">
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
  <a href="https://github.com/nano-muse/nanoMuse/stargazers"><img src="https://img.shields.io/github/stars/nano-muse/nanoMuse?style=flat&label=stars" alt="Sao GitHub"></a>
  <a href="https://github.com/nano-muse/nanoMuse/releases"><img src="https://img.shields.io/github/downloads/nano-muse/nanoMuse/total?label=downloads" alt="Lượt tải"></a>
  <a href="https://github.com/nano-muse/nanoMuse/actions/workflows/ci.yml"><img src="https://github.com/nano-muse/nanoMuse/actions/workflows/ci.yml/badge.svg?branch=main" alt="Test Suite"></a>
  <a href="https://nanomuse.cn/docs/"><img src="https://img.shields.io/badge/Docs-nanomuse.cn%2Fdocs-0a66e4" alt="Tài liệu"></a>
  <a href="https://github.com/nano-muse/nanoMuse/blob/main/LICENSE"><img src="https://img.shields.io/github/license/nano-muse/nanoMuse?label=license" alt="GPL-3.0-or-later"></a>
</p>

**nanoMuse là một trợ lý cá nhân mã nguồn mở cho mọi thiết bị của bạn.** Một trợ lý duy nhất có tên và hình dáng riêng, cùng loại với [Muse](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/) của Meta: nó làm việc thay vì chỉ trả lời câu hỏi, tiếp tục làm khi ứng dụng đã đóng, nhớ bạn, và dừng lại hỏi trước bất cứ việc gì bạn không thể hoàn tác.

*nano* nghĩa là trọn bộ nhưng đủ nhỏ để bạn tự chạy và tự triển khai: ứng dụng điện thoại, ứng dụng máy tính, bảng điều khiển web và relay nối chúng lại đều nằm trong kho này, theo giấy phép GPL-3.0-or-later. nanoMuse phi lợi nhuận. Đăng nhập là bạn có một khoản miễn phí để dùng mô hình qua relay của cộng đồng — do người phát triển trả; dùng hết thì [chuyển sang khóa của riêng bạn](../own-key.md). Cùng relay đó chạy được trên máy chủ của bạn, nên không có gì buộc phải rời khỏi nhà. Phiên bản mới nhất: **0.1.37 Weave** — [ghi chú phát hành](https://github.com/nano-muse/nanoMuse/releases/tag/v0.1.37) · [dùng thử trên trình duyệt](https://nanomuse.cn/web/).

<p align="center">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/docs/screenshots/chat-approval.png" width="23%" alt="Trò chuyện: trước khi xóa trong không gian làm việc, trợ lý dừng lại hỏi — một lần, cuộc trò chuyện này, luôn cho phép trong không gian làm việc, hoặc từ chối">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/docs/screenshots/feed.png" width="23%" alt="Bảng tin: những bài viết dành cho bạn sáng nay">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/docs/screenshots/goals.png" width="23%" alt="Mục tiêu: được kiểm tra theo lịch, kèm các thói quen">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/docs/screenshots/avatar.png" width="23%" alt="Hình đại diện: mô tả một dáng vẻ, mô hình ảnh của bạn vẽ ra, bạn chọn cái mình thích">
</p>

## Cài đặt

| | |
|---|---|
| **Android** 8.0 trở lên, arm64 | [nanoMuse-0.1.37-arm64.apk](https://github.com/nano-muse/nanoMuse/releases/download/v0.1.37/nanoMuse-0.1.37-arm64.apk) — mọi phiên bản ký cùng một khóa, cài đè lên bản cũ là được |
| **iPhone / iPad** | TestFlight, hiện chỉ cho người thử nghiệm nội bộ <!-- coordinator: đặt liên kết TestFlight công khai ở đây khi có --> |
| **macOS** 12 trở lên | [Apple Silicon](https://github.com/nano-muse/nanoMuse/releases/download/v0.1.37/nanoMuse-Desktop-0.1.37-mac-arm64.dmg) · [Intel](https://github.com/nano-muse/nanoMuse/releases/download/v0.1.37/nanoMuse-Desktop-0.1.37-mac-x64.dmg) — chưa được công chứng: lần đầu nhấp chuột phải → *Mở* |
| **Windows** 10 trở lên | [nanoMuse-Desktop-0.1.37-win-x64.exe](https://github.com/nano-muse/nanoMuse/releases/download/v0.1.37/nanoMuse-Desktop-0.1.37-win-x64.exe) — bấm *Vẫn chạy* một lần |
| **Linux** x64 | [AppImage](https://github.com/nano-muse/nanoMuse/releases/download/v0.1.37/nanoMuse-Desktop-0.1.37-linux-x64.AppImage) · [.deb](https://github.com/nano-muse/nanoMuse/releases/download/v0.1.37/nanoMuse-Desktop-0.1.37-linux-x64.deb) · [tar.gz](https://github.com/nano-muse/nanoMuse/releases/download/v0.1.37/nanoMuse-Desktop-0.1.37-linux-x64.tar.gz) |
| **Terminal** | `pipx install "git+https://github.com/nano-muse/nanoMuse"` với Python 3.11 trở lên, hoặc tệp thực thi `nanomuse-desktop-terminal` từ [bản phát hành mới nhất](https://github.com/nano-muse/nanoMuse/releases/latest) |
| **Docker** | `bash scripts/self-host.sh --local` để có relay của riêng bạn; `docker compose up -d app` để chạy ứng dụng web trên máy chủ của bạn — [tự lưu trữ](../self-hosting.md) |

Mọi bản tải đều từ [bản phát hành mới nhất trên GitHub](https://github.com/nano-muse/nanoMuse/releases/latest); cùng các tệp đó có tại [nanomuse.cn/dl](https://nanomuse.cn/dl/) nếu GitHub chậm ở chỗ bạn. Mở ứng dụng, đăng nhập bằng e-mail hoặc số điện thoại Trung Quốc đại lục, và trợ lý đã có một mô hình để suy nghĩ. Điện thoại, máy tính và web dùng chung một tài khoản và hiển thị cùng những cuộc trò chuyện.

## Nó làm được gì

- **Làm việc.** Shell Linux, trình duyệt, máy chủ MCP và kỹ năng — và khi bật *Hands*, cả ứng dụng trên điện thoại lẫn cửa sổ trên máy tính qua màn hình của chúng, cho những thứ chưa bao giờ có API.
- **Hỏi trước.** Dừng lại trước khi xóa, gửi hay thanh toán, và nhớ lựa chọn cho một lần, cuộc trò chuyện này hoặc mãi mãi; mật khẩu và mã xác minh do bạn tự gõ. Gặp đăng nhập hay CAPTCHA, nó trao lại cho bạn; bấm *Xong* là tiếp tục.
- **Với tới các thiết bị khác của bạn.** Nói trên điện thoại, chạy trên PC; `@Mac …` ở đầu tin nhắn gửi việc sang máy đó. Các phê duyệt quay về thiết bị bạn đang cầm.
- **Không ngừng lại.** Mục tiêu được kiểm tra theo lịch, thói quen chạy khi ứng dụng đã đóng, mỗi sáng có một bảng tin viết cho bạn.
- **Nhớ bạn.** Nó là ai, biết gì về bạn và khi nào thức dậy là những tệp Markdown bạn đọc và sửa được.
- **Sống trong ứng dụng chat của bạn.** Trả lời trong 飞书, 钉钉, 企业微信 và Telegram.
- **Có dáng vẻ riêng.** Mô tả một dáng vẻ, mô hình ảnh của bạn vẽ ra, mô hình video làm nó chuyển động. Mặc định là một chú rồng nhỏ.
- **Mô hình nào cũng được.** Mô hình của relay, một khóa Bailian hay OpenRouter, hoặc bất kỳ endpoint tương thích OpenAI nào.

## Cách hoạt động

Mỗi thiết bị chạy trợ lý của riêng mình — điện thoại trong APK (Alpine Linux dưới proot, shell, trình duyệt, MCP), máy tính trong nanoMuse Desktop (DeepSeek Harness cùng runtime Python cho đôi tay). Đăng nhập xong, chúng gặp nhau trên relay và có thể nhờ vả nhau; văn bản trò chuyện đi qua relay, còn tệp và ảnh chụp màn hình ở lại nơi chúng được tạo ra.

```
điện thoại ──┐                         ┌── máy tính (nanoMuse Desktop)
             ├──▶  nanoMuse Cloud  ◀───┤        relay: đăng nhập, mô hình,
web  ────────┘        /v1/hub          └── điện thoại / máy tính khác    hub, đồng bộ trò chuyện
```

[docs/every-device.md](../every-device.md) nói về các thiết bị, [docs/hub.md](../hub.md) về khung tin, [docs/cloud.md](../cloud.md) về relay, [docs/privacy.md](../privacy.md) về những gì nó lưu.

## So với Muse và OpenMinis

| | Meta Muse | OpenMinis | nanoMuse |
|---|---|---|---|
| Trợ lý chạy ở đâu | Một VM đám mây cho mỗi người dùng | Chiếc điện thoại cài nó | Điện thoại, máy tính của bạn hoặc máy chủ của bạn — một tài khoản cho tất cả |
| Ứng dụng không có API | Ngoài tầm với; VM không bao giờ chạm vào thiết bị của bạn | Một CLI trợ năng trên Android | Màn hình làm đôi tay trên cả điện thoại lẫn máy tính: ảnh chụp màn hình, thử API trước, đăng nhập thì bạn tiếp quản. Không có trên iOS — hệ thống không cho phép |
| Thiết bị khác | Các máy khách của một VM | Chỉ chiếc đã cài | Các thiết bị nhờ nhau qua hub, phê duyệt ở nơi bạn đang có mặt |
| Mô hình | Của Meta | Tự mang | Khoản miễn phí của relay, hoặc của riêng bạn |
| Giấy phép | Đóng | GPL-3.0 | GPL-3.0-or-later, xây trên OpenMinis |

## Tài liệu

[nanomuse.cn/docs](https://nanomuse.cn/docs/) — cài đặt theo từng nền tảng, mọi thiết bị, Hands, trình kết nối, bộ nhớ, tự lưu trữ, các giao thức. Nguồn ở [docs/](../); mỗi phiên bản thay đổi gì ở [CHANGELOG](../../CHANGELOG.md) và [docs/releases/](../releases/).

## Tự lưu trữ

Một VPS, một giờ: [docs/self-hosting.md](../self-hosting.md). Ba con đường — không cần máy chủ, chỉ dùng khóa của bạn; relay của riêng bạn với `scripts/self-host.sh`; hoặc runtime của riêng bạn cho ứng dụng web.

## Đóng góp

Dùng nó cho một việc thật, kể lại chỗ nào hỏng, rồi chọn một việc nhỏ và cụ thể: [CONTRIBUTING.md](../../CONTRIBUTING.md) có phần thiết lập và quy ước, [AGENTS.md](../../AGENTS.md) là các quy tắc một trợ lý lập trình tuân theo trong cây mã này, và [lộ trình](../roadmap.md) chỉ chỗ bắt đầu. [Issues](https://github.com/nano-muse/nanoMuse/issues) · [Discussions](https://github.com/nano-muse/nanoMuse/discussions).

## Ghi nhận

nanoMuse đứng trên công sức của người khác; điều khoản ở [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md).

- [OpenMinis](https://github.com/OpenMinis/OpenMinis) — trợ lý chạy trên thiết bị mà ứng dụng điện thoại được xây dựng từ đó, với [proot](https://github.com/nano-muse/proot) và [Alpine Linux](https://alpinelinux.org/) làm hộp cát.
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) — harness trợ lý mà ứng dụng máy tính là một plugin của nó.
- [UI-TARS-desktop](https://github.com/bytedance/UI-TARS-desktop) (ByteDance) — bộ điều khiển đôi tay trên máy tính được chuyển từ mã của họ, và các điểm đánh dấu trên sân khấu theo ScreenMarker của họ.
- [MobileGym](https://github.com/Purewhiter/mobilegym), [MemGUI-Bench](https://github.com/lgy0404/MemGUI-Bench), [PhoneHarness](https://github.com/lsdefine/PhoneHarness), [CopilotKit/OpenMuse](https://github.com/CopilotKit/OpenMuse), [Open-AutoGLM](https://github.com/zai-org/Open-AutoGLM), [ClawGUI](https://github.com/ClawGUI/ClawGUI-APP) — bộ điều khiển điện thoại, dấu vết và ý tưởng sản phẩm.

## Tuyên bố

nanoMuse là dự án cộng đồng độc lập, không liên kết với và không được Meta Platforms, Inc. bảo trợ; Muse là nhãn hiệu của họ. Chú rồng là của dự án này.

## Giấy phép

[GPL-3.0-or-later](../../LICENSE). Ứng dụng điện thoại dựa trên OpenMinis 1.13 (GPL-3.0), được sửa đổi từ ngày 2026-09-24 — xem [NOTICE](../../NOTICE). Các phiên bản trước đó của nhánh Python theo giấy phép MIT (tag `pre-openminis`).
