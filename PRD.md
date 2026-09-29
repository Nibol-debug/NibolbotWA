# PRD & Tech Stack: nibolbot.my.id

**Versi:** 0.1 (Draft) **Tanggal:** 29 September 2026 **Status:** Untuk direview

---

## 1. Ringkasan

**nibolbot** adalah bot WhatsApp dengan panel admin berbasis web (`nibolbot.my.id`). Bot menyediakan fitur pemutar musik dan downloader (YouTube, Spotify via pencarian YouTube) dengan tampilan interaktif (card, tombol, web player). Semua pengaturan bot dikelola lewat panel, tanpa edit kode atau file konfigurasi.

**Prinsip desain:**

- **Ringan:** storage kecil, tidak menyimpan media dan chat.
- **Modular:** tiap fitur adalah plugin, panel dibuat otomatis dari daftar plugin.
- **Tahan rusak:** ada fallback teks jika tombol interaktif gagal, dan downloader mudah diperbarui.

## 2. Tujuan & Non-Tujuan

### Tujuan (MVP)

1.  Bot terhubung ke WhatsApp lewat pairing code / QR dari panel.
2.  Fitur `play` (cari dan kirim musik), downloader video/audio, dan Sticker Maker.
3.  Web player HTML5 yang dibuka dari tombol di chat.
4.  Panel untuk mengatur bot, fitur, dan grup.
5.  Total storage aplikasi (di luar `node_modules`) di bawah ±100 MB.

### Non-Tujuan (ditunda)

- Multi-user / multi-nomor (layanan publik)
- Penyimpanan riwayat chat dan media permanen
- Billing / langganan
- Statistik dan grafik jangka panjang

## 3. Pengguna

| Peran             | Deskripsi                                                 | Kebutuhan                          |
|-------------------|-----------------------------------------------------------|------------------------------------|
| **Owner / Admin** | Pemilik bot, login ke panel                               | Atur bot, fitur, grup, lihat log   |
| **Pengguna WA**   | Anggota grup WhatsApp (penggunaan utama) dan chat pribadi | Kirim perintah, terima musik/video |

**Konteks penggunaan:** bot terutama dipakai di grup WhatsApp. Karena itu koneksi memakai Baileys (nomor WhatsApp biasa), sebab WhatsApp Business Cloud API resmi sangat terbatas untuk grup. Pengaturan per grup dinaikkan menjadi prioritas P0.

## 4. Fitur

### 4.1 Bot (WhatsApp)

| ID  | Fitur                           | Deskripsi                                                                                                                                                         | Prioritas |
|-----|---------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------|-----------|
| B1  | Koneksi                         | Login via pairing code / QR, auto-reconnect, sesi persisten                                                                                                       | P0        |
| B2  | Command handler                 | Prefix konfigurasi, alias, cooldown, limit per user                                                                                                               | P0        |
| B3  | `play <judul/link>`             | Cari lagu, kirim audio + card info                                                                                                                                | P0        |
| B4  | `ytmp3` / `ytmp4`               | Download audio/video dari link YouTube                                                                                                                            | P0        |
| B5  | Web player                      | Tombol `cta_url` membuka player `/p/:id`                                                                                                                          | P1        |
| B6  | Spotify link                    | Ambil metadata, cari padanan di YouTube, kirim audio                                                                                                              | P1        |
| B7  | Interactive card                | Native flow button, dengan fallback teks                                                                                                                          | P1        |
| B8  | Carousel hasil pencarian        | Swipe beberapa hasil                                                                                                                                              | P2        |
| B9  | Header channel                  | Tampilan "Diteruskan" memakai saluran milik sendiri. Aktif hanya jika `newsletter_jid` diisi di panel; jika kosong, bot mengirim pesan biasa (kosmetik, opsional) | P2        |
| B10 | Welcome / goodbye               | Pesan sambutan per grup                                                                                                                                           | P2        |
| B11 | Sticker Maker (`sticker` / `s`) | Balas atau kirim gambar dengan perintah untuk dijadikan stiker (statis). Nama pack dan author bisa diatur dari panel                                              | P1        |
| B12 | Stiker animasi                  | Video/GIF pendek (maks 6-8 detik) jadi stiker animasi WebP                                                                                                        | P2        |
| B13 | Stiker ke gambar (`toimg`)      | Ubah stiker balasan menjadi gambar biasa                                                                                                                          | P2        |

### 4.2 Panel Admin

| ID  | Fitur                 | Deskripsi                                                                                                                             | Prioritas |
|-----|-----------------------|---------------------------------------------------------------------------------------------------------------------------------------|-----------|
| P1  | Login                 | Satu akun admin (khusus owner), password di-hash. Tidak ada registrasi atau manajemen user; akun dibuat sekali lewat setup awal/env   | P0        |
| P2  | Koneksi bot           | Status, pairing code / QR, logout, restart                                                                                            | P0        |
| P3  | Pengaturan umum       | Prefix, nama bot, mode (publik / owner-only), daftar owner, nama pack dan author stiker, `newsletter_jid` dan nama saluran (opsional) | P0        |
| P4  | Toggle fitur          | On/off fitur, cooldown, limit, batas durasi                                                                                           | P0        |
| P5  | Pengaturan grup       | Fitur aktif per grup, cooldown/limit per grup, welcome, ban/unban                                                                     | P0        |
| P6  | Blacklist / whitelist | Kelola user                                                                                                                           | P1        |
| P7  | Log ringan            | 200 perintah terakhir dan error terakhir                                                                                              | P1        |
| P8  | Statistik sederhana   | Jumlah perintah hari ini, fitur terpopuler                                                                                            | P2        |
| P9  | Pengaturan cache      | Batas ukuran cache, TTL, tombol bersihkan                                                                                             | P2        |

## 5. Alur Utama

**Perintah `play`:**

1.  User kirim `.play <judul>` di WhatsApp.
2.  Bot cek: fitur aktif? user tidak diblokir? cooldown aman?
3.  Bot cari via `youtubei.js`, lalu tampilkan card (thumbnail, judul, durasi) dengan tombol *Putar di Web*, *MP3*, *MP4*.
4.  User pilih tombol. Job download masuk antrean.
5.  `yt-dlp` + `ffmpeg` menghasilkan file di cache `/tmp`.
6.  Bot kirim file, atau tautan web player `/p/:id`.
7.  Cache dihapus otomatis setelah TTL.

**Setup bot dari panel:**

1.  Admin login, buka halaman Koneksi.
2.  Masukkan nomor, panel menampilkan pairing code (atau QR).
3.  Admin memasukkan kode di WhatsApp, status berubah jadi *Online*.

## 6. Arsitektur

```
                 ┌────────────────────────────┐
                 │  Nginx Proxy Manager (SSL) │
                 └──────────────┬─────────────┘
                                │ nibolbot.my.id
                 ┌──────────────▼─────────────┐
                 │   API Server (ElysiaJS)    │
                 │  - Auth & settings         │
                 │  - Serve panel (static)    │
                 │  - Web player /p/:id       │
                 └───────┬───────────┬────────┘
                         │           │
              HTTP / IPC │           │ bun:sqlite
                         │           │
        ┌────────────────▼───┐   ┌───▼──────────┐
        │  Bot Service       │   │   SQLite     │
        │  Baileys + plugins │   │  (settings,  │
        │  Job queue         │   │   logs)      │
        └───┬────────────┬───┘   └──────────────┘
            │            │
   ┌────────▼───┐  ┌─────▼──────────┐
   │  WhatsApp  │  │ yt-dlp/ffmpeg  │
   │  (WebSock) │  │ cache /tmp     │
   └────────────┘  └────────────────┘
```

**Keputusan arsitektur:**

- **Bot service dipisah dari API.** Jika Baileys bermasalah di Bun, bot service bisa dijalankan di Node tanpa mengubah API dan panel.
- **Panel di-build statis** oleh Svelte, lalu di-serve langsung oleh Elysia (tanpa server frontend terpisah).
- **Komunikasi API ↔ bot:** HTTP lokal + token internal (opsi lanjut: Unix socket).

## 7. Tech Stack

| Lapisan           | Teknologi                                                          | Alasan                                                                                  |
|-------------------|--------------------------------------------------------------------|-----------------------------------------------------------------------------------------|
| Runtime           | **Bun**                                                            | Cepat, TypeScript native, `bun:sqlite` bawaan                                           |
| Backend           | **ElysiaJS**                                                       | Type-safe, ringan; Eden Treaty untuk client di panel                                    |
| Frontend          | **Svelte 5** (Vite, static build)                                  | Ringan dan reaktif, cocok untuk panel                                                   |
| Styling           | Tailwind CSS                                                       | Cepat untuk UI panel                                                                    |
| Database          | **SQLite** (`bun:sqlite`)                                          | Tanpa server DB, storage minimal                                                        |
| ORM (opsional)    | Drizzle ORM                                                        | Type-safe, migrasi mudah                                                                |
| WhatsApp          | **@whiskeysockets/baileys**                                        | Standar komunitas untuk bot WA                                                          |
| Pencarian YouTube | **youtubei.js**                                                    | Aktif dirawat, pengganti `ytdl-core`                                                    |
| Download          | **yt-dlp** (binary) + **ffmpeg**                                   | Paling tahan terhadap perubahan YouTube                                                 |
| Sticker Maker     | `sharp` (gambar) + **ffmpeg** (video/GIF) + `wa-sticker-formatter` | Konversi ke WebP 512x512 dan menyematkan metadata pack/author; `sharp` ringan dan cepat |
| Spotify metadata  | `spotify-url-info`                                                 | Tanpa API key                                                                           |
| Validasi          | Elysia `t` (TypeBox)                                               | Validasi bawaan Elysia                                                                  |
| Auth              | `Bun.password` (argon2) + JWT (`@elysiajs/jwt`) di cookie httpOnly | Sederhana dan aman                                                                      |
| Logging           | `pino`                                                             | Cepat, format JSON                                                                      |
| Process manager   | **PM2** atau systemd                                               | Jalan 24/7, auto-restart                                                                |
| Reverse proxy     | Nginx Proxy Manager                                                | Domain dan SSL Let's Encrypt                                                            |
| Monorepo          | Bun workspaces                                                     | Berbagi tipe antar app                                                                  |

**Catatan kompatibilitas:** tes Baileys di Bun pada minggu pertama. Jika tidak stabil, jalankan `apps/bot` dengan Node dan pertahankan sisanya di Bun.

## 8. Struktur Repositori

```
nibolbot/
├─ apps/
│  ├─ api/          # Elysia: routes, auth, settings, web player
│  ├─ bot/          # Baileys engine, plugin loader, job queue
│  └─ panel/        # Svelte (build statis ke apps/panel/dist)
├─ packages/
│  └─ shared/       # tipe, skema setting, registry fitur
├─ data/            # nibolbot.db, sesi Baileys (gitignored)
├─ package.json     # Bun workspaces
└─ ecosystem.config.cjs   # PM2
```

## 9. Sistem Plugin

Tiap fitur adalah modul dengan metadata sehingga panel bisa membuat form pengaturannya otomatis.

```ts
export default definePlugin({
  name: 'play',
  category: 'music',
  commands: ['play', 'p'],
  defaults: { enabled: true, cooldown: 10, limitPerDay: 20, maxDuration: 600 },
  settingsSchema: /* TypeBox schema */,
  async run(ctx) { /* ... */ },
})
```

Menambah fitur = menambah satu file plugin. Tidak ada perubahan di panel.

## 10. Model Data (SQLite)

| Tabel              | Kolom utama                               | Retensi                     |
|--------------------|-------------------------------------------|-----------------------------|
| `admin`            | username, password_hash (satu baris saja) | permanen                    |
| `settings`         | key, value (JSON)                         | permanen                    |
| `feature_settings` | feature, enabled, config (JSON)           | permanen                    |
| `groups`           | jid, name, banned, config (JSON)          | permanen                    |
| `users`            | jid, blacklisted, daily_usage             | reset harian                |
| `command_logs`     | id, ts, user, command, status             | maks 200 baris              |
| `error_logs`       | id, ts, feature, message                  | maks 100 baris              |
| `player_tokens`    | id, media_ref, expires_at                 | dihapus setelah kedaluwarsa |

Sesi Baileys disimpan di satu folder `data/session/` (dibersihkan berkala).

## 11. API (Ringkas)

| Method          | Endpoint                          | Fungsi                                       |
|-----------------|-----------------------------------|----------------------------------------------|
| POST            | `/api/auth/login`                 | Login admin                                  |
| POST            | `/api/auth/logout`                | Logout                                       |
| GET             | `/api/bot/status`                 | Status koneksi                               |
| POST            | `/api/bot/pair`                   | Minta pairing code / QR                      |
| POST            | `/api/bot/restart`                | Restart koneksi                              |
| GET/PUT         | `/api/settings`                   | Pengaturan umum                              |
| GET             | `/api/features`                   | Daftar fitur dan setting                     |
| PUT             | `/api/features/:name`             | Ubah setting fitur                           |
| GET/PUT         | `/api/groups`, `/api/groups/:jid` | Kelola grup                                  |
| GET/POST/DELETE | `/api/users/blacklist`            | Kelola blacklist                             |
| GET             | `/api/logs`                       | Log terakhir                                 |
| GET             | `/api/stats`                      | Statistik ringan                             |
| POST            | `/api/cache/clear`                | Bersihkan cache                              |
| GET             | `/p/:id`                          | Halaman web player (publik, token sementara) |

## 12. Requirement Non-Fungsional

| Aspek              | Target                                                                                                                                                     |
|--------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Storage**        | Aplikasi + DB < 100 MB (di luar `node_modules`); cache media dibatasi (default 300 MB, batas keras 500 MB); total footprint bot < 1,5 GB dari disk 10 GB |
| **RAM**            | Bot + API < 500 MB saat idle; maks 2 download/konversi bersamaan; sisakan minimal 1 GB RAM untuk OS dan proxy                                             |
| **Ketersediaan**   | Auto-reconnect dan auto-restart via PM2                                                                                                                    |
| **Keamanan**       | Password argon2, cookie httpOnly + SameSite, rate limit login, panel tidak mengekspos sesi WA, token web player kedaluwarsa                                |
| **Privasi**        | Pesan masuk tidak disimpan; log hanya perintah                                                                                                             |
| **Kompatibilitas** | Panel responsif (desktop dan HP)                                                                                                                           |

## 13. Strategi Storage

1.  Tidak menyimpan media permanen; audio/video di `/tmp` dengan TTL (default 30 menit) dan batas ukuran total.
2.  Batas durasi per lagu (default 10 menit) dan ukuran file kirim.
3.  Log dengan retensi otomatis.
4.  Tidak menyimpan pesan masuk.
5.  Panel di-build statis (beberapa ratus KB).
6.  Job pembersih berkala untuk cache dan sesi Baileys.
7.  Jika cache mendekati batas, tolak job baru dengan pesan yang jelas (jangan sampai disk penuh).

### Anggaran untuk server 3 core / 4 GB RAM / 10 GB disk

Disk 10 GB adalah batas paling ketat, jadi anggarannya dihitung sejak awal (angka perkiraan, cek ulang dengan `df -h` dan `du -sh`).

| Komponen                                      | Perkiraan   |
|-----------------------------------------------|-------------|
| OS + paket dasar                              | 3-4 GB      |
| Docker + Nginx Proxy Manager (jika belum ada) | 0,5-1 GB    |
| Bun + `node_modules` (Baileys, sharp, dll.)   | 0,4-0,6 GB  |
| ffmpeg + yt-dlp                               | 0,15-0,3 GB |
| Database, sesi, log                           | < 0,1 GB   |
| Cache media (dibatasi)                        | 0,3-0,5 GB  |
| **Sisa cadangan**                             | **±3 GB**   |

Penyesuaian karena spesifikasi ini:

- Batas durasi download diturunkan (default 10 menit), dan video hanya sampai 480p/720p.
- Kompresi ffmpeg dijalankan dengan thread terbatas (`-threads 2`) dan prioritas rendah (`nice`) agar API dan bot tetap responsif di 3 core.
- Rotasi log PM2 (`pm2-logrotate`), batasi journald (`SystemMaxUse=100M`), dan bersihkan cache apt/npm/bun secara berkala.
- Pasang swap 1-2 GB sebagai pengaman jika RAM sempat penuh saat konversi.
- Panel Svelte tetap di-build statis di dev machine atau CI, bukan di server, supaya tidak perlu `devDependencies` di server.

## 14. Risiko & Mitigasi

| Risiko                      | Dampak                     | Mitigasi                                                                                                                                                                                   |
|-----------------------------|----------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Nomor kena banned WhatsApp  | Bot mati                   | Pakai nomor cadangan; batasi frekuensi kirim; hindari broadcast massal; di grup: cooldown per user dan per grup, jangan auto-join grup tak dikenal, matikan fitur di grup ramai bila perlu |
| Library tidak resmi berubah | Fitur tombol/koneksi rusak | Fallback teks; pin versi; pantau rilis Baileys                                                                                                                                             |
| YouTube mengubah sistem     | Download gagal             | Pakai yt-dlp; auto-update mingguan; pesan error yang jelas                                                                                                                                 |
| Baileys tidak stabil di Bun | Bot crash                  | Bot service terpisah, bisa jalan di Node                                                                                                                                                   |
| Pelanggaran ToS / hak cipta | Risiko hukum dan takedown  | Batasi ke penggunaan komunitas kecil; tampilkan disclaimer; tidak menyimpan media                                                                                                          |
| Disk penuh oleh cache       | Server bermasalah          | TTL + batas ukuran + pembersih otomatis                                                                                                                                                    |
| Panel diretas               | Bot diambil alih           | Rate limit, hash password, HTTPS wajib, opsi IP allowlist                                                                                                                                  |

## 15. Roadmap

| Fase              | Isi                                                                                                                  | Estimasi |
|-------------------|----------------------------------------------------------------------------------------------------------------------|----------|
| **0. Setup**      | Monorepo, tes Baileys di Bun, deploy dasar + domain + SSL                                                            | 2-3 hari |
| **1. Core bot**   | Koneksi, pairing, command handler, plugin loader, SQLite                                                             | 1 minggu |
| **2. Musik**      | `play`, `ytmp3`, `ytmp4`, `sticker` (statis), antrean, cache TTL                                                     | 1 minggu |
| **3. Panel MVP**  | Login, koneksi bot, pengaturan umum, toggle fitur                                                                    | 1 minggu |
| **4. Web player** | Route `/p/:id`, halaman player, token sementara                                                                      | 3-4 hari |
| **5. Interaktif** | Card, tombol `cta_url`, carousel, fallback teks; buat saluran WhatsApp sendiri dan uji header lewat `newsletter_jid` | 1 minggu |
| **6. Polish**     | Grup, blacklist, log, statistik, hardening                                                                           | 1 minggu |

## 16. Kriteria Sukses (MVP)

- Bot tetap online 7 hari berturut-turut tanpa intervensi manual.
- `play` mengirim audio dalam < 30 detik untuk lagu normal.
- Semua pengaturan utama bisa diubah dari panel tanpa restart manual.
- Storage aplikasi tetap di bawah target setelah 1 minggu pemakaian.

## 17. Pertanyaan Terbuka

1.  **Terjawab:** bot untuk pemakaian pribadi (satu nomor, satu admin). Multi-user tetap di luar cakupan.
2.  **Terjawab sebagian:** Sticker Maker ditambahkan (B11-B13). Fitur lain (AI, dll.) masih terbuka.
3.  **Terjawab:** VPS 3 core, 4 GB RAM, 10 GB disk. Disk adalah batas paling ketat, lihat anggaran di bagian 13. Lokasi hosting belum ditentukan.
4.  **Terjawab:** belum ada saluran, akan dibuat saat Fase 5. Header hanya kosmetik (B9, P2): field `newsletter_jid` di panel opsional, diisi maka header muncul, kosong maka bot kirim pesan biasa.
5.  **Terjawab:** satu admin saja, khusus owner. Tidak ada registrasi, role, atau manajemen user di panel.