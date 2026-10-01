<p align="center">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/docs/app-icon.png" width="128" alt="Biểu tượng ứng dụng nanoMuse">
</p>

<h1 align="center">nanoMuse</h1>

<p align="center">Trợ lý cá nhân theo phong cách Muse, mã nguồn mở hoàn toàn, cho mọi thiết bị bạn có.</p>

<p align="center">
  <a href="https://github.com/nano-muse/nanoMuse/blob/main/README.md">English</a> |
  <a href="https://github.com/nano-muse/nanoMuse/blob/main/README_zh.md">简体中文</a> |
  <a href="https://github.com/nano-muse/nanoMuse/blob/main/README_zh-TW.md">繁體中文</a> |
  <a href="https://github.com/nano-muse/nanoMuse/blob/main/README_es.md">Español</a> |
  <a href="https://github.com/nano-muse/nanoMuse/blob/main/README_fr.md">Français</a> |
  <a href="https://github.com/nano-muse/nanoMuse/blob/main/README_id.md">Bahasa Indonesia</a> |
  <a href="https://github.com/nano-muse/nanoMuse/blob/main/README_ja.md">日本語</a> |
  <a href="https://github.com/nano-muse/nanoMuse/blob/main/README_ko.md">한국어</a> |
  <a href="https://github.com/nano-muse/nanoMuse/blob/main/README_ru.md">Русский</a> |
  <a href="https://github.com/nano-muse/nanoMuse/blob/main/README_vi.md">Tiếng Việt</a>
</p>

<p align="center">
  <a href="https://github.com/nano-muse/nanoMuse/stargazers"><img src="https://img.shields.io/github/stars/nano-muse/nanoMuse?style=flat&label=stars" alt="Sao trên GitHub"></a>
  <a href="https://github.com/nano-muse/nanoMuse/releases"><img src="https://img.shields.io/github/downloads/nano-muse/nanoMuse/total?label=downloads" alt="Lượt tải"></a>
  <a href="https://github.com/nano-muse/nanoMuse/actions/workflows/ci.yml"><img src="https://github.com/nano-muse/nanoMuse/actions/workflows/ci.yml/badge.svg?branch=main" alt="Test Suite"></a>
  <a href="https://nanomuse.cn/web/"><img src="https://img.shields.io/badge/D%C3%B9ng%20th%E1%BB%AD%20tr%C3%AAn%20tr%C3%ACnh%20duy%E1%BB%87t-nanomuse.cn%2Fweb-5B4EE6" alt="Dùng thử trên trình duyệt"></a>
  <a href="https://nanomuse.cn/"><img src="https://img.shields.io/badge/Trang%20web-nanomuse.cn-0a66e4" alt="Trang web"></a>
  <a href="https://github.com/nano-muse/nanoMuse/blob/main/LICENSE"><img src="https://img.shields.io/github/license/nano-muse/nanoMuse?label=license" alt="GPL-3.0-or-later"></a>
</p>

> [!IMPORTANT]
> **Miễn phí, mã nguồn mở, phi lợi nhuận — một trợ lý cá nhân cho tất cả mọi người.** nanoMuse là dự án cộng đồng, miễn phí mãi mãi: đăng nhập bằng số điện thoại hoặc e-mail và mô hình đi kèm một hạn mức miễn phí do nhà phát triển chi trả; khi dùng hết, hãy dùng khóa API của riêng bạn. Tin nhắn không được lưu trừ khi bạn chọn đóng góp chúng; không có gì được đem bán; xóa tài khoản bất cứ lúc nào bạn muốn. **[Dùng thử trên trình duyệt](https://nanomuse.cn/web/)**, hoặc [tải ứng dụng](https://github.com/nano-muse/nanoMuse/releases/latest).

> Trang này là bản dịch của [README tiếng Anh](README.md); bản tiếng Anh là bản tham chiếu, nơi có tin tức và bảng phiên bản đầy đủ.

nanoMuse là một trợ lý cá nhân theo phong cách Muse, mã nguồn mở hoàn toàn, cho mọi thiết bị bạn có: một trợ lý duy nhất với tên và hình dáng riêng, giống [Muse](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/) của Meta, làm việc thay vì chỉ trả lời câu hỏi, tiếp tục làm việc khi ứng dụng đã đóng, nhớ bạn, và dừng lại hỏi trước bất cứ việc gì bạn không thể hoàn tác. Ứng dụng Android chạy toàn bộ trợ lý **ngay trên điện thoại**: một hệ thống tệp gốc Linux, shell, trình duyệt, MCP, các kỹ năng và tác vụ theo lịch nằm trong APK, với mô hình do bạn mang đến. Nó có "đôi tay" cho những ứng dụng chưa bao giờ có API — chính màn hình điện thoại, với sự cho phép của bạn — và vươn tới máy tính của bạn: nói trên điện thoại, việc được làm xong ở đó. Ứng dụng máy tính và phiên bản web cũng đã có; iOS và kính thông minh sẽ đến sau. Khóa của riêng bạn hoặc một hạn mức khởi đầu từ relay mở, GPL-3.0 — và một nền tảng để bạn dựng Muse của riêng mình.

<p align="center">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/docs/avatar-moods.png" width="88%" alt="Cùng một chú rồng nhỏ trong năm trạng thái: nghỉ, đang làm việc, đang chờ, vui, xin lỗi">
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/docs/screenshots/chat-approval.png" width="23%" alt="Trò chuyện: trước khi xóa trong không gian làm việc, trợ lý dừng lại và hỏi — một lần, cuộc trò chuyện này, luôn luôn cho không gian làm việc, hoặc từ chối">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/docs/screenshots/feed.png" width="23%" alt="Bảng tin: những bài viết dành cho bạn sáng nay">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/docs/screenshots/goals.png" width="23%" alt="Mục tiêu: theo dõi theo lịch, có các thói quen">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/docs/screenshots/avatar.png" width="23%" alt="Hình đại diện: mô tả một hình dáng, mô hình ảnh của bạn vẽ nó, chọn cái bạn thích">
</p>

## Vì sao là nanoMuse

Bốn điều định nghĩa dự án này.

| | |
|---|---|
| **Phong cách Muse** | Một trợ lý, không phải một hộp công cụ: tên và hình dáng riêng, cuộc trò chuyện đầu tiên, một bảng tin viết cho bạn, các mục tiêu được theo đuổi trong nền, bộ nhớ bạn có thể đọc và sửa, và một lần xác nhận trước bất cứ việc gì không thể hoàn tác. |
| **Mở hoàn toàn** | GPL-3.0-or-later, toàn bộ kho mã. Không có thành phần đóng, không có tài khoản hay máy chủ bắt buộc, không có mô hình bắt buộc — relay nanoMuse Cloud tùy chọn cũng nằm trong kho mã và ai cũng có thể tự vận hành; mỗi bản phát hành được build từ tag của nó và cài thủ công. Muse, 豆包 và 千问 là những sản phẩm người ta trao cho bạn; nanoMuse là thứ bạn sở hữu — và là nền tảng để dựng Muse của riêng bạn: đổi tên, vẽ lại, viết lại tính cách, nối vào mô hình và công cụ của bạn. |
| **Mọi ứng dụng, có API hay không** | Phần lớn một ngày trôi qua trong những ứng dụng chưa bao giờ có API. Trợ lý leo một chiếc thang — trước hết là kỹ năng, CLI hoặc máy chủ MCP, rồi đến trang web lấy bằng phiên đăng nhập của bạn, rồi trình duyệt trong ứng dụng, và khi bạn cho phép, chính màn hình thiết bị, nhìn và chạm như cách bạn làm — với cùng những lần xác nhận trước khi thanh toán, gửi hay xóa. Mặc định tắt. |
| **Mọi thiết bị** | Một trợ lý, và mỗi thiết bị bạn có là một đôi tay và một cánh cửa: nói trên điện thoại, việc diễn ra trên PC; nói với kính, việc diễn ra ở cả hai. Điện thoại đã có thể điều khiển máy tính của bạn, ứng dụng máy tính và web đã có mặt; iOS và kính sẽ đến sau. |

So sánh với Muse và với OpenMinis — runtime mà ứng dụng được xây trên đó: xem [README tiếng Anh](README.md#compared-with-muse-and-openminis). Kế hoạch và lý do: [docs/roadmap.md](docs/roadmap.md).

## Cài đặt

Không cần cài gì: đăng nhập tại [nanomuse.cn/web](https://nanomuse.cn/web/) bằng số điện thoại hoặc e-mail và một mã xác nhận, bạn sẽ có một nanoMuse của riêng mình trên máy chủ của dự án, được giữ lại giữa các lần truy cập — hợp để thử lần đầu; để dùng hằng ngày, hãy dùng ứng dụng điện thoại và máy tính bên dưới với cùng tài khoản. Cho thiết bị của riêng bạn — [tải về](https://nanomuse.cn/#download): APK Android, ứng dụng máy tính cho Windows, macOS và Linux (`nanoMuse-Desktop-<version>-…`), bản chạy trong terminal (`nanomuse-desktop-terminal-<version>-…`), hoặc `pipx install "git+https://github.com/nano-muse/nanoMuse"` với Python 3.11+. Nếu tải từ GitHub không được ở nơi bạn ở, các tệp giống hệt có trên bản sao của dự án tại [nanomuse.cn/dl](https://nanomuse.cn/dl/) (đồng bộ trong vòng mười lăm phút sau mỗi bản phát hành, kiểm tra SHA-256); [docs/desktop.md](docs/desktop.md) và [docs/every-device.md](docs/every-device.md) nói về cách các thiết bị kết nối với nhau. Trên điện thoại:

1. Tải `nanoMuse-<version>-arm64.apk` từ [bản phát hành mới nhất](https://github.com/nano-muse/nanoMuse/releases/latest) — Android 8.0 trở lên, điện thoại 64-bit. Kiểm tra bằng `sha256sum -c nanoMuse-<version>-arm64.apk.sha256` nếu muốn.
2. Mở tệp. Android hỏi một lần để cho phép cài đặt; mọi phiên bản đều được ký bằng cùng một khóa, nên bản cập nhật cài đè lên bản trước và giữ nguyên dữ liệu của bạn.
3. Kết nối một mô hình. *Đăng nhập — miễn phí*: số điện thoại (mã gửi qua SMS) hoặc e-mail, và trợ lý có một hạn mức miễn phí trên [nanoMuse Cloud](docs/cloud.md) — không cần khóa, không phải trả gì; trang tài khoản cho biết còn bao nhiêu và tăng thế nào. Khi hết, hãy dùng khóa của bạn: [Alibaba Cloud Bailian](docs/own-key.md) trong khoảng hai phút, bất kỳ endpoint tương thích OpenAI nào với khóa của bạn, hoặc một trong các cách đăng nhập OAuth có sẵn trong ứng dụng. Sau đó, nếu muốn, hai quyền cho phép trợ lý dùng các ứng dụng trên điện thoại (có thể bỏ qua), và cuộc trò chuyện đầu tiên — nó hỏi nên gọi bạn là gì và tự chọn tên cho mình.
4. Tùy chọn — *Cài đặt → Mô hình ảnh & video*: một mô hình ảnh (qwen-image-3.0 trên Alibaba Cloud Model Studio, gpt-image-1, hoặc bất kỳ nhà cung cấp nào có endpoint images của OpenAI) cho phép trợ lý đổi hình dáng và vẽ tranh; một mô hình video (wan2.2-i2v-flash trên Model Studio) làm hình dáng đó chuyển động. Muse có sẵn những thứ này; nanoMuse dùng của bạn, và trợ lý sẽ cho bạn biết khi thiếu cái nào.

Ứng dụng kiểm tra các bản phát hành của kho mã này để cập nhật. Ghi chú phát hành của từng phiên bản nằm trong [docs/releases/](docs/releases/) và [CHANGELOG](CHANGELOG.md).

## Nó làm được gì

| | |
|---|---|
| **Làm việc** | Shell Linux, trình duyệt, máy chủ MCP, kỹ năng theo định dạng [Agent Skills](https://agentskills.io), và — khi bạn bật *Đôi tay* — các ứng dụng trên điện thoại qua chính màn hình của chúng: một ảnh chụp màn hình, một thao tác, một ảnh chụp nữa, với chiếc thang thử API trước, chuyển quyền cho bạn khi cần đăng nhập, và cùng những lần xác nhận. Trợ lý chọn "bàn tay" mà công việc cần và hiển thị từng bước như một thẻ bạn có thể mở ra. |
| **Hỏi trước** | Dừng lại trước khi xóa, gửi hay thanh toán — trong shell lẫn trong trình duyệt — với một lần xác nhận bạn giới hạn ở một lần, cuộc trò chuyện này, hoặc luôn luôn cho người nhận, tên miền hay thư mục này, và có thể thu hồi trong mục Quyền. Mật khẩu và mã xác minh luôn do bạn tự nhập. |
| **Tiếp tục làm** | Mục tiêu được định hình trong cuộc trò chuyện và được kiểm tra theo lịch trong cuộc trò chuyện riêng của nó; các thói quen chạy khi ứng dụng đã đóng; màn hình sáng trong lúc nó điều khiển điện thoại; đến bước 200 nó hỏi "tiếp tục không?" thay vì kết thúc sớm. |
| **Viết bảng tin cho bạn** | Mỗi sáng, ba đến sáu bài ngắn từ những gì nó biết về bạn và những gì bạn nhờ nó theo dõi, dưới dạng thẻ bạn có thể thích, bàn luận trong một cuộc trò chuyện phụ, hoặc xóa. Một câu là đủ để điều hướng nó. |
| **Nhớ bạn** | Nó là ai (`SOUL.md`), nó biết gì về bạn (`USER.md`), nó nhớ gì (`GLOBAL.md` và một cuốn nhật ký) và khi nào nó thức dậy (`HEARTBEAT.md`) là những tệp bạn có thể đọc và sửa trong ứng dụng. Mang theo những gì một trợ lý khác từng biết bằng *Nhập bộ nhớ*. |
| **Hình dáng riêng** | Mô tả bằng một câu; mô hình ảnh của bạn vẽ; bạn chọn cái mình thích. Ứng dụng tạo tư thế cho từng trạng thái — đang làm việc, đang chờ, vui, xin lỗi — và nó thở, lắc lư, nghiêng đầu, nhảy lên, rung mình theo việc trợ lý đang làm; với một mô hình video, mỗi trạng thái là một đoạn clip ngắn lặp lại. Mặc định là một chú rồng nhỏ màu vàng nhạt, có sẵn cả ảnh tĩnh lẫn clip. |
| **Ý tưởng và Thư viện** | Những điều nên hỏi tiếp theo, từ mục tiêu và bộ nhớ của bạn; và mọi thứ nó đã tạo ra, kèm bản xem trước. |

Tất cả chạy trên điện thoại; phần còn lại của OpenMinis — terminal, trình duyệt trong ứng dụng, quản lý MCP và kỹ năng, nhóm mô hình, mức dùng token, bộ thực thi trợ năng, thư mục chia sẻ — vẫn được giữ và truy cập được từ cùng các menu.

## Phiên bản

Mỗi giai đoạn một phiên bản nhỏ, mỗi phiên bản là một bản phát hành GitHub kèm APK. Tin tức và bảng phiên bản đầy đủ nằm trong [README tiếng Anh](README.md#versions); kế hoạch và lý do trong [docs/roadmap.md](docs/roadmap.md); ghi chú từng phiên bản trong [docs/releases/](docs/releases/) và [CHANGELOG](CHANGELOG.md). Sau đó, theo thứ tự: iOS; phiên bản web trên máy của riêng bạn (máy ảo, máy chủ tại nhà); kính thông minh.

## Đóng góp

Báo lỗi, đề xuất tính năng, gửi pull request — mỗi việc đều đưa trợ lý cá nhân đến gần hơn với mọi người: **[mở issue](https://github.com/nano-muse/nanoMuse/issues/new/choose) · [hỏi hoặc chia sẻ trong Discussions](https://github.com/nano-muse/nanoMuse/discussions) · [gắn sao cho kho mã](https://github.com/nano-muse/nanoMuse)**. Hạn mức miễn phí, khóa của riêng bạn và dữ liệu của bạn hoạt động ra sao: [docs/cloud.md](docs/cloud.md) · [docs/own-key.md](docs/own-key.md) · [docs/privacy.md](docs/privacy.md). Cách thiết lập build, các quy ước (`com.openminis.app` giữ nguyên, mã mới đặt trong `io.github.nanomuse.*`, `// nanoMuse:` ở các chỉnh sửa upstream, `Signed-off-by` trên mỗi commit) và cách phát hành: [CONTRIBUTING.md](CONTRIBUTING.md).

## Lời cảm ơn

nanoMuse đứng trên công sức của người khác; [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) ghi các điều khoản. Ứng dụng được xây trên [OpenMinis](https://github.com/OpenMinis/OpenMinis) 1.13 — Linux qua proot, shell, trình duyệt, MCP, kỹ năng, tác vụ theo lịch, bộ thực thi trợ năng; sandbox đến từ [proot](https://github.com/proot-me/proot) và [Alpine Linux](https://alpinelinux.org/).

## Miễn trừ trách nhiệm

nanoMuse là một dự án cộng đồng độc lập. Nó không liên kết với, không được chứng thực bởi, và không phái sinh từ Meta Platforms, Inc. hay sản phẩm Muse của họ; Muse là nhãn hiệu của Meta Platforms, Inc. Chú rồng là của riêng dự án.

## Giấy phép

[GPL-3.0-or-later](LICENSE). Ứng dụng Android dựa trên OpenMinis 1.13 (GPL-3.0), được chỉnh sửa từ 2026-09-24; xem [NOTICE](NOTICE) và [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Các phiên bản đầu của nhánh Python được phát hành theo giấy phép MIT (tag `pre-openminis`).
