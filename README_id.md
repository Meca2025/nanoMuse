<p align="center">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/docs/app-icon.png" width="128" alt="Ikon aplikasi nanoMuse">
</p>

<h1 align="center">nanoMuse</h1>

<p align="center">Agen pribadi bergaya Muse yang sepenuhnya open source, untuk setiap perangkat yang kamu miliki.</p>

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
  <a href="https://github.com/nano-muse/nanoMuse/stargazers"><img src="https://img.shields.io/github/stars/nano-muse/nanoMuse?style=flat&label=stars" alt="Bintang GitHub"></a>
  <a href="https://github.com/nano-muse/nanoMuse/releases"><img src="https://img.shields.io/github/downloads/nano-muse/nanoMuse/total?label=downloads" alt="Unduhan"></a>
  <a href="https://github.com/nano-muse/nanoMuse/actions/workflows/ci.yml"><img src="https://github.com/nano-muse/nanoMuse/actions/workflows/ci.yml/badge.svg?branch=main" alt="Test Suite"></a>
  <a href="https://nanomuse.cn/web/"><img src="https://img.shields.io/badge/Coba%20di%20browser-nanomuse.cn%2Fweb-5B4EE6" alt="Coba di browser"></a>
  <a href="https://nanomuse.cn/"><img src="https://img.shields.io/badge/Situs%20web-nanomuse.cn-0a66e4" alt="Situs web"></a>
  <a href="https://github.com/nano-muse/nanoMuse/blob/main/LICENSE"><img src="https://img.shields.io/github/license/nano-muse/nanoMuse?label=license" alt="GPL-3.0-or-later"></a>
</p>

> [!IMPORTANT]
> **Gratis, open source, nirlaba — agen pribadi untuk semua orang.** nanoMuse adalah proyek komunitas, gratis selamanya: masuk dengan nomor telepon atau alamat e-mail dan modelnya datang dengan kuota gratis yang dibayar oleh pengembang; kalau habis, pakai kunci API-mu sendiri. Pesan tidak disimpan kecuali kamu memilih untuk menyumbangkannya; tidak ada yang dijual; hapus akun kapan saja. **[Coba di browser](https://nanomuse.cn/web/)**, atau [unduh aplikasinya](https://github.com/nano-muse/nanoMuse/releases/latest).

> Halaman ini adalah terjemahan dari [README berbahasa Inggris](README.md), yang menjadi acuan dan memuat berita serta tabel versi lengkap.

nanoMuse adalah agen pribadi bergaya Muse yang sepenuhnya open source, untuk setiap perangkat yang kamu miliki: satu agen dengan nama dan wajahnya sendiri, seperti [Muse](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/) dari Meta, yang mengerjakan sesuatu alih-alih sekadar menjawab pertanyaan, terus bekerja saat aplikasi ditutup, mengingatmu, dan berhenti untuk bertanya sebelum melakukan apa pun yang tidak bisa kamu batalkan. Aplikasi Android menjalankan seluruh agen **di ponsel**: sistem berkas Linux, shell, browser, MCP, skill, dan tugas terjadwal ada di dalam APK, dengan model yang kamu bawa sendiri. Ia punya tangan untuk aplikasi yang tidak pernah punya API — layar ponsel itu sendiri, dengan izinmu — dan menjangkau komputermu: katakan di ponsel, selesai dikerjakan di sana. Aplikasi desktop dan versi web juga sudah tersedia; iOS dan kacamata menyusul. Kunci API-mu sendiri atau kuota awal dari relay terbuka, GPL-3.0 — dan fondasi untuk membangun Muse-mu sendiri.

<p align="center">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/docs/avatar-moods.png" width="88%" alt="Naga kecil yang sama dalam lima keadaan: istirahat, bekerja, menunggu, senang, menyesal">
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/docs/screenshots/chat-approval.png" width="23%" alt="Obrolan: sebelum menghapus di ruang kerja, agen berhenti dan bertanya — sekali, obrolan ini, selalu untuk ruang kerja, atau tolak">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/docs/screenshots/feed.png" width="23%" alt="Feed: tulisan yang dibuat untukmu pagi ini">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/docs/screenshots/goals.png" width="23%" alt="Tujuan: dipantau sesuai jadwal, dengan rutinitas">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/docs/screenshots/avatar.png" width="23%" alt="Avatar: gambarkan sebuah wajah, model gambarmu melukisnya, pilih yang kamu suka">
</p>

## Mengapa nanoMuse

Empat hal mendefinisikan proyek ini.

| | |
|---|---|
| **Bergaya Muse** | Satu agen, bukan kotak perkakas: nama dan wajahnya sendiri, percakapan pertama, feed yang ditulis untukmu, tujuan yang dikerjakan di latar belakang, memori yang bisa kamu baca dan ubah, serta persetujuan sebelum apa pun yang tidak bisa kamu batalkan. |
| **Sepenuhnya terbuka** | GPL-3.0-or-later, seluruh repositori. Tidak ada komponen tertutup, tidak ada akun atau server yang wajib dipakai, tidak ada model yang wajib dipakai — relay nanoMuse Cloud yang opsional pun ada di repositori, dan siapa saja bisa menjalankannya; setiap rilis dibangun dari tag-nya dan dipasang secara manual. Muse, 豆包, dan 千问 adalah produk yang diberikan kepadamu; nanoMuse adalah produk yang kamu miliki — dan fondasi untuk membangun Muse-mu sendiri: ganti namanya, gambar ulang wajahnya, tulis ulang kepribadiannya, sambungkan model dan alatmu sendiri. |
| **Aplikasi apa pun, ada API atau tidak** | Sebagian besar hari kita berjalan lewat aplikasi yang tidak pernah punya API. Agen menaiki tangga — skill, CLI, atau server MCP dulu, lalu halaman yang diambil dengan login-mu, lalu browser di dalam aplikasi, dan, kalau kamu izinkan, layar perangkat itu sendiri, melihat dan mengetuk seperti yang kamu lakukan — dengan persetujuan yang sama sebelum membayar, mengirim, atau menghapus. Nonaktif secara bawaan. |
| **Setiap perangkat** | Satu agen, dan setiap perangkat yang kamu miliki adalah sepasang tangan dan pintu masuk: katakan di ponsel, terjadi di PC-mu; katakan ke kacamatamu, terjadi di keduanya. Ponsel sudah bisa mengendalikan komputermu, aplikasi desktop dan web sudah ada; iOS dan kacamata menyusul. |

Perbandingan dengan Muse dan dengan OpenMinis, runtime tempat aplikasi ini dibangun: di [README berbahasa Inggris](README.md#compared-with-muse-and-openminis). Rencana dan alasannya: [docs/roadmap.md](docs/roadmap.md).

## Pemasangan

Tidak perlu memasang apa pun: masuk di [nanomuse.cn/web](https://nanomuse.cn/web/) dengan nomor telepon atau e-mail dan sebuah kode, dan kamu mendapat nanoMuse milikmu sendiri di server proyek, tersimpan antar kunjungan — cocok untuk mencoba pertama kali; untuk sehari-hari, aplikasi ponsel dan desktop di bawah ini, dengan akun yang sama. Untuk perangkatmu sendiri — [unduhan](https://nanomuse.cn/#download): APK Android, aplikasi desktop untuk Windows, macOS, dan Linux (`nanoMuse-Desktop-<version>-…`), biner terminal (`nanomuse-desktop-terminal-<version>-…`), atau `pipx install "git+https://github.com/nano-muse/nanoMuse"` dengan Python 3.11+. Kalau unduhan GitHub gagal di tempatmu, berkas yang sama ada di cermin proyek, [nanomuse.cn/dl](https://nanomuse.cn/dl/) (disinkronkan dalam lima belas menit setelah rilis, diperiksa dengan SHA-256); [docs/desktop.md](docs/desktop.md) dan [docs/every-device.md](docs/every-device.md) menjelaskan bagaimana semuanya saling terhubung. Di ponsel:

1. Unduh `nanoMuse-<version>-arm64.apk` dari [rilis terbaru](https://github.com/nano-muse/nanoMuse/releases/latest) — Android 8.0 atau lebih baru, ponsel 64-bit. Verifikasi dengan `sha256sum -c nanoMuse-<version>-arm64.apk.sha256` kalau mau.
2. Buka berkasnya. Android akan bertanya sekali untuk mengizinkan pemasangan; setiap versi ditandatangani dengan kunci yang sama, jadi pembaruan terpasang di atas versi sebelumnya dan datamu tetap ada.
3. Sambungkan model. *Masuk — gratis*: nomor telepon (kode dikirim lewat SMS) atau alamat e-mail, dan agen mendapat kuota gratis di [nanoMuse Cloud](docs/cloud.md) — tanpa kunci, tanpa bayar; halaman akun menunjukkan sisa kuota dan cara bertambahnya. Kalau habis, bawa milikmu: [Alibaba Cloud Bailian](docs/own-key.md) dalam sekitar dua menit, endpoint apa pun yang kompatibel dengan OpenAI dengan kuncimu, atau salah satu login OAuth bawaan aplikasi. Lalu, kalau mau, dua izin yang membiarkan agen memakai aplikasi di ponselmu (bisa dilewati), dan percakapan pertama, yang menanyakan panggilanmu dan membiarkan agen memilih namanya sendiri.
4. Opsional — *Pengaturan → Model gambar & video*: model gambar (qwen-image-3.0 di Alibaba Cloud Model Studio, gpt-image-1, atau penyedia mana pun dengan endpoint images OpenAI) membuat agen bisa mengganti wajah dan menggambar; model video (wan2.2-i2v-flash di Model Studio) membuat wajahnya bergerak. Muse punya semua itu bawaan; nanoMuse memakai milikmu, dan agen memberi tahu kalau ada yang belum ada.

Aplikasi memeriksa rilis di repositori ini untuk pembaruan. Catatan rilis setiap versi ada di [docs/releases/](docs/releases/) dan [CHANGELOG](CHANGELOG.md).

## Apa yang dilakukannya

| | |
|---|---|
| **Mengerjakan sesuatu** | Shell Linux, browser, server MCP, skill dalam format [Agent Skills](https://agentskills.io), dan — saat *Tangan* dinyalakan — aplikasi di ponselmu lewat layarnya: tangkapan layar, satu aksi, tangkapan layar lagi, dengan tangga yang mencoba API lebih dulu, alih kendali untuk login, dan persetujuan yang sama. Agen memilih tangan yang dibutuhkan pekerjaan itu dan menampilkan setiap langkah sebagai kartu yang bisa kamu buka. |
| **Bertanya dulu** | Berhenti sebelum menghapus, mengirim, atau membayar — di shell maupun di browser — dengan persetujuan yang kamu batasi untuk sekali, obrolan ini, atau selalu untuk penerima, domain, atau folder ini, dan bisa dicabut di Izin. Kata sandi dan kode verifikasi selalu kamu yang mengetiknya. |
| **Terus berjalan** | Tujuan dibentuk di obrolan dan diperiksa sesuai jadwal di percakapannya sendiri; rutinitas berjalan saat aplikasi ditutup; layar tetap menyala saat ia mengendalikan ponsel; pada langkah ke-200 ia bertanya "lanjutkan?" alih-alih berhenti lebih awal. |
| **Menulis feed untukmu** | Setiap pagi, tiga sampai enam tulisan pendek dari apa yang ia tahu tentangmu dan apa yang kamu minta ia ikuti, sebagai kartu yang bisa kamu sukai, bahas di obrolan samping, atau hapus. Satu kalimat cukup untuk mengarahkannya. |
| **Mengingatmu** | Siapa dirinya (`SOUL.md`), apa yang ia tahu tentangmu (`USER.md`), apa yang ia ingat (`GLOBAL.md` dan sebuah catatan harian), dan kapan ia bangun (`HEARTBEAT.md`) adalah berkas yang bisa kamu baca dan ubah di aplikasi. Bawa apa yang diketahui asisten lain dengan *Impor memori*. |
| **Wajahnya sendiri** | Gambarkan dalam satu kalimat; model gambarmu melukisnya; kamu pilih yang kamu suka. Aplikasi memasangkan pose untuk setiap keadaan — bekerja, menunggu, senang, menyesal — dan ia bernapas, bergoyang, memiringkan kepala, melompat, dan menggeleng mengikuti apa yang sedang dikerjakan agen; dengan model video, setiap keadaan menjadi klip pendek yang berulang. Naga kecil kuning pucat, lengkap dengan gambar dan klip, adalah bawaannya. |
| **Ide dan Pustaka** | Hal-hal yang bisa ditanyakan berikutnya, dari tujuan dan memorimu; dan semua yang ia buat, dengan pratinjau. |

Semuanya berjalan di ponsel; bagian lain dari OpenMinis — terminal, browser di dalam aplikasi, pengelolaan MCP dan skill, grup model, pemakaian token, eksekutor aksesibilitas, folder bersama — tetap ada dan bisa dijangkau dari menu yang sama.

## Versi

Satu versi kecil untuk setiap tahap, masing-masing sebuah rilis GitHub dengan APK. Berita dan tabel versi lengkap ada di [README berbahasa Inggris](README.md#versions); rencana dan alasannya di [docs/roadmap.md](docs/roadmap.md); catatan setiap versi di [docs/releases/](docs/releases/) dan [CHANGELOG](CHANGELOG.md). Setelah itu, berurutan: iOS; versi web di mesinmu sendiri (VM, server rumahan); kacamata.

## Berkontribusi

Laporkan bug, minta fitur, kirim pull request — masing-masing membawa agen pribadi lebih dekat ke jangkauan semua orang: **[buka issue](https://github.com/nano-muse/nanoMuse/issues/new/choose) · [bertanya atau berbagi di Discussions](https://github.com/nano-muse/nanoMuse/discussions) · [beri bintang repositori ini](https://github.com/nano-muse/nanoMuse)**. Cara kerja kuota gratis, kunci API-mu sendiri, dan datamu: [docs/cloud.md](docs/cloud.md) · [docs/own-key.md](docs/own-key.md) · [docs/privacy.md](docs/privacy.md). Penyiapan build, konvensi (`com.openminis.app` tetap, kode baru di `io.github.nanomuse.*`, `// nanoMuse:` pada perubahan upstream, `Signed-off-by` pada commit), dan cara rilis dibuat: [CONTRIBUTING.md](CONTRIBUTING.md).

## Ucapan terima kasih

nanoMuse berdiri di atas karya orang lain; [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) memuat ketentuannya. Aplikasi ini dibangun di atas [OpenMinis](https://github.com/OpenMinis/OpenMinis) 1.13 — Linux via proot, shell, browser, MCP, skill, tugas terjadwal, eksekutor aksesibilitas; sandbox-nya berasal dari [proot](https://github.com/proot-me/proot) dan [Alpine Linux](https://alpinelinux.org/).

## Penafian

nanoMuse adalah proyek komunitas independen. Ia tidak berafiliasi dengan, tidak didukung oleh, dan tidak diturunkan dari Meta Platforms, Inc. atau produk Muse-nya; Muse adalah merek dagang Meta Platforms, Inc. Naganya milik proyek ini sendiri.

## Lisensi

[GPL-3.0-or-later](LICENSE). Aplikasi Android berbasis OpenMinis 1.13 (GPL-3.0), dimodifikasi sejak 2026-09-24; lihat [NOTICE](NOTICE) dan [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Versi-versi awal dari jalur Python dirilis di bawah MIT (tag `pre-openminis`).
