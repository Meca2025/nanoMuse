<p align="center">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/assets/brand/nanomuse-cover.png" alt="nanoMuse — agen pribadi sumber terbuka untuk setiap perangkat yang kamu miliki">
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
  <a href="https://github.com/nano-muse/nanoMuse/stargazers"><img src="https://img.shields.io/github/stars/nano-muse/nanoMuse?style=flat&label=stars" alt="Bintang GitHub"></a>
  <a href="https://github.com/nano-muse/nanoMuse/releases"><img src="https://img.shields.io/github/downloads/nano-muse/nanoMuse/total?label=downloads" alt="Unduhan"></a>
  <a href="https://github.com/nano-muse/nanoMuse/actions/workflows/ci.yml"><img src="https://github.com/nano-muse/nanoMuse/actions/workflows/ci.yml/badge.svg?branch=main" alt="Test Suite"></a>
  <a href="https://nanomuse.cn/docs/"><img src="https://img.shields.io/badge/Docs-nanomuse.cn%2Fdocs-0a66e4" alt="Dokumentasi"></a>
  <a href="https://github.com/nano-muse/nanoMuse/blob/main/LICENSE"><img src="https://img.shields.io/github/license/nano-muse/nanoMuse?label=license" alt="GPL-3.0-or-later"></a>
  <a href="https://discord.gg/bkTySmm28X"><img src="https://img.shields.io/badge/Discord-join-5865F2?logo=discord&logoColor=white" alt="Discord"></a>
</p>

**nanoMuse adalah agen pribadi sumber terbuka untuk setiap perangkat yang kamu miliki.** Satu agen dengan nama dan rupa sendiri, seperti [Muse](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/) dari Meta: ia mengerjakan sesuatu alih-alih sekadar menjawab pertanyaan, terus bekerja saat aplikasinya ditutup, mengingatmu, dan berhenti untuk bertanya sebelum melakukan apa pun yang tidak bisa kamu batalkan.

*nano* berarti satu paket lengkap yang cukup kecil untuk kamu jalankan dan pasang sendiri: aplikasi ponsel, aplikasi desktop, konsol web, dan relay yang menghubungkan semuanya ada di repositori ini, di bawah GPL-3.0-or-later. nanoMuse nirlaba. Masuk dan kamu mendapat jatah gratis pemakaian model di relay komunitas — pengembang yang membayarnya; kalau habis, [pakai kunci sendiri](../own-key.md). Relay yang sama bisa berjalan di servermu, jadi tidak ada yang harus keluar rumah. Versi terbaru: **0.1.40 Clear** — [catatan rilis](https://github.com/nano-muse/nanoMuse/releases/tag/v0.1.40) · [coba di browser](https://nanomuse.cn/web/).

<p align="center">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/docs/screenshots/chat-approval.png" width="23%" alt="Obrolan: sebelum menghapus di ruang kerja, agen berhenti dan bertanya — sekali, obrolan ini, selalu untuk ruang kerja, atau tolak">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/docs/screenshots/feed.png" width="23%" alt="Feed: tulisan yang dibuat untukmu pagi ini">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/docs/screenshots/goals.png" width="23%" alt="Tujuan: dipantau sesuai jadwal, dengan rutinitas">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/docs/screenshots/avatar.png" width="23%" alt="Avatar: gambarkan rupanya, model gambarmu melukisnya, pilih yang kamu suka">
</p>

## Pemasangan

| | |
|---|---|
| **Android** 8.0+, arm64 | [nanoMuse-0.1.40-arm64.apk](https://github.com/nano-muse/nanoMuse/releases/download/v0.1.40/nanoMuse-0.1.40-arm64.apk) — setiap versi ditandatangani dengan kunci yang sama dan dipasang menimpa versi sebelumnya |
| **iPhone / iPad** | TestFlight, untuk saat ini penguji internal saja <!-- coordinator: taruh tautan TestFlight publik di sini bila sudah ada --> |
| **macOS** 12+ | [Apple Silicon](https://github.com/nano-muse/nanoMuse/releases/download/v0.1.40/nanoMuse-Desktop-0.1.40-mac-arm64.dmg) · [Intel](https://github.com/nano-muse/nanoMuse/releases/download/v0.1.40/nanoMuse-Desktop-0.1.40-mac-x64.dmg) — belum dinotarisasi: klik kanan → *Open* saat pertama kali |
| **Windows** 10+ | [nanoMuse-Desktop-0.1.40-win-x64.exe](https://github.com/nano-muse/nanoMuse/releases/download/v0.1.40/nanoMuse-Desktop-0.1.40-win-x64.exe) — klik *Run anyway* sekali |
| **Linux** x64 | [AppImage](https://github.com/nano-muse/nanoMuse/releases/download/v0.1.40/nanoMuse-Desktop-0.1.40-linux-x64.AppImage) · [.deb](https://github.com/nano-muse/nanoMuse/releases/download/v0.1.40/nanoMuse-Desktop-0.1.40-linux-x64.deb) · [tar.gz](https://github.com/nano-muse/nanoMuse/releases/download/v0.1.40/nanoMuse-Desktop-0.1.40-linux-x64.tar.gz) |
| **Docker** | `bash scripts/self-host.sh --local` untuk relay sendiri; `docker compose up -d app` untuk aplikasi web di servermu — [self-hosting](../self-hosting.md) |

Semua unduhan berasal dari [rilis terbaru](https://github.com/nano-muse/nanoMuse/releases/latest); berkas yang sama ada di [nanomuse.cn/dl](https://nanomuse.cn/dl/) kalau GitHub lambat di tempatmu. Buka aplikasinya, masuk dengan e-mail atau nomor ponsel Tiongkok daratan, dan agen langsung punya model untuk berpikir. Ponsel, desktop, dan web memakai satu akun dan menampilkan percakapan yang sama.

## Apa yang dilakukannya

<table>
  <tr>
    <td width="50%" valign="top"><b>Mengerjakan sesuatu.</b><br>Shell Linux, browser, server MCP, dan skill — dan, dengan <i>Hands</i> menyala, aplikasi di ponselmu dan jendela di komputermu lewat layarnya, untuk segala hal yang tidak pernah punya API.</td>
    <td width="50%" valign="top"><b>Bertanya dulu.</b><br>Berhenti sebelum menghapus, mengirim, atau membayar, diingat untuk sekali, obrolan ini, atau selalu; kata sandi dan kode tetap kamu yang mengetik. Login atau CAPTCHA diserahkan kepadamu; <i>Done</i> melanjutkan.</td>
  </tr>
  <tr>
    <td width="50%" valign="top"><b>Menjangkau perangkatmu yang lain.</b><br>Ucapkan di ponsel, dijalankan di PC-mu; <code>@Mac …</code> di awal pesan mengirim tugas ke sana. Persetujuan kembali ke perangkat di tanganmu.</td>
    <td width="50%" valign="top"><b>Terus berjalan.</b><br>Tujuan diperiksa sesuai jadwal, rutinitas berjalan saat aplikasi ditutup, feed ditulis untukmu setiap pagi.</td>
  </tr>
  <tr>
    <td width="50%" valign="top"><b>Mengingatmu.</b><br>Siapa dirinya, apa yang ia tahu tentangmu, dan kapan ia bangun adalah berkas Markdown yang bisa kamu baca dan ubah.</td>
    <td width="50%" valign="top"><b>Hidup di aplikasi chat-mu.</b><br>Ia menjawab di 飞书, 钉钉, 企业微信, dan Telegram.</td>
  </tr>
  <tr>
    <td width="50%" valign="top"><b>Rupa sendiri.</b><br>Gambarkan satu, model gambarmu melukisnya, model video membuatnya bergerak. Seekor naga kecil sebagai bawaan.</td>
    <td width="50%" valign="top"><b>Model apa saja.</b><br>Kuota relay, kunci Anda sendiri di salah satu dari delapan belas penyedia (Bailian, OpenRouter, OpenAI, Gemini, DeepSeek, dan lainnya), atau paket yang sudah Anda bayar: ChatGPT, Claude, Kimi. Penyedia tanpa model gambar atau video membuat dua fitur itu mati, dan aplikasi mengatakannya.</td>
  </tr>
</table>

## Cara kerjanya

Setiap perangkat menjalankan agennya sendiri — ponsel di dalam APK (Alpine Linux di bawah proot, shell, browser, MCP), komputer di dalam nanoMuse Desktop (DeepSeek Harness dengan runtime Python untuk tangannya). Setelah masuk, mereka bertemu di relay dan bisa saling meminta sesuatu; teks percakapan lewat relay, berkas dan tangkapan layar tetap di tempat dibuatnya.

<p align="center">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/assets/brand/devices-loop.png" alt="Android, desktop (Mac, Windows, Linux), iPhone dan iPad, serta aplikasi web di sekitar satu akun: relay memasukkan perangkat dan membawa percakapan di antara mereka" width="92%">
</p>

[docs/every-device.md](../every-device.md) menjelaskan perangkat-perangkatnya, [docs/hub.md](../hub.md) frame-nya, [docs/cloud.md](../cloud.md) relay-nya, [docs/privacy.md](../privacy.md) apa yang disimpannya.

## Dibandingkan dengan Muse dan OpenMinis

| | Meta Muse | OpenMinis | nanoMuse |
|---|---|---|---|
| Di mana agen berjalan | Satu VM cloud per pengguna | Ponsel tempat ia dipasang | Ponselmu, komputermu, atau servermu — satu akun untuk semuanya |
| Aplikasi tanpa API | Di luar jangkauan; VM tidak pernah menyentuh perangkatmu | CLI aksesibilitas di Android | Layar sebagai tangan di ponsel dan komputer: tangkapan layar, API dicoba dulu, kamu mengambil alih saat login. Tidak di iOS — sistemnya tidak mengizinkan |
| Perangkat lain | Klien dari satu VM | Hanya yang terpasang | Perangkat saling meminta lewat hub, persetujuan di tempatmu berada |
| Model | Milik Meta | Bawa sendiri | Jatah gratis dari relay, atau milikmu |
| Lisensi | Tertutup | GPL-3.0 | GPL-3.0-or-later, dibangun di atas OpenMinis |

## Dokumentasi

[nanomuse.cn/docs](https://nanomuse.cn/docs/) — pemasangan per platform, setiap perangkat, tangan, konektor, memori, self-hosting, protokol. Sumbernya ada di [docs/](../); apa yang berubah di tiap versi ada di [CHANGELOG](../../CHANGELOG.md) dan [docs/releases/](../releases/).

## Self-hosting

Satu VPS, satu jam: [docs/self-hosting.md](../self-hosting.md). Tiga jalan — tanpa server sama sekali dengan kunci sendiri; relay sendiri dengan `scripts/self-host.sh`; atau runtime sendiri untuk aplikasi web.

## Berkontribusi

Pakai untuk tugas nyata, laporkan apa yang rusak, lalu pilih sesuatu yang terfokus: [CONTRIBUTING.md](../../CONTRIBUTING.md) berisi penyiapan dan konvensinya, [AGENTS.md](../../AGENTS.md) aturan yang diikuti agen pemrograman di pohon ini, dan [peta jalan](../roadmap.md) menunjukkan dari mana memulai. [Issues](https://github.com/nano-muse/nanoMuse/issues) · [Discussions](https://github.com/nano-muse/nanoMuse/discussions) · [Discord](https://discord.gg/bkTySmm28X).

## Ucapan terima kasih

nanoMuse berdiri di atas karya orang lain; [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md) memuat ketentuannya.

- [OpenMinis](https://github.com/OpenMinis/OpenMinis) — agen di perangkat yang menjadi dasar aplikasi ponsel, dengan [proot](https://github.com/nano-muse/proot) dan [Alpine Linux](https://alpinelinux.org/) untuk sandbox-nya.
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) — harness agen yang aplikasi desktopnya menjadi plugin.
- [UI-TARS-desktop](https://github.com/bytedance/UI-TARS-desktop) (ByteDance) — operator tangan di desktop adalah porting dari milik mereka, dan penanda di panggung mengikuti ScreenMarker mereka.
- [MobileGym](https://github.com/Purewhiter/mobilegym), [MemGUI-Bench](https://github.com/lgy0404/MemGUI-Bench), [PhoneHarness](https://github.com/PhoneHarness/PhoneHarness), [CopilotKit/OpenMuse](https://github.com/CopilotKit/OpenMuse), [Open-AutoGLM](https://github.com/zai-org/Open-AutoGLM), [ClawGUI](https://github.com/ZJU-REAL/ClawGUI) — operator ponsel, jejak, dan gagasan produknya.

## Penafian

nanoMuse adalah proyek komunitas independen, tidak berafiliasi dengan atau didukung oleh Meta Platforms, Inc.; Muse adalah merek dagang mereka. Naganya milik proyek ini.

## Lisensi

[GPL-3.0-or-later](../../LICENSE). Aplikasi ponsel berbasis OpenMinis 1.13 (GPL-3.0), dimodifikasi sejak 2026-09-24 — lihat [NOTICE](../../NOTICE). Versi lebih awal dari jalur Python berlisensi MIT (tag `pre-openminis`).
