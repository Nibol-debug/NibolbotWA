# Nibolbot

WhatsApp Bot dengan Admin Web Panel (`nibolbot.my.id`). Dibangun menggunakan Bun monorepo, Baileys, ElysiaJS, dan Svelte 5 dengan desain Neubrutalism.

---

## 🛠️ Stack Teknologi

- **Runtime:** [Bun](https://bun.sh) (Workspaces monorepo)
- **Engine WhatsApp:** [@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys) (Multi-device)
- **API Server:** [ElysiaJS](https://elysiajs.com) (Port 3000)
- **Admin Panel:** [Svelte 5](https://svelte.dev) Runes + Vite (Port 5173)
- **Database:** SQLite via `bun:sqlite` (WAL Mode)
- **Media & Stream:** `yt-dlp` + `ffmpeg` (Audio chunked stream & downloader) + `sharp` (Stiker WebP)

---

## 📁 Struktur Monorepo

```
nibolbot/
├── apps/
│   ├── api/          # Backend ElysiaJS (REST API, Auth, Web Player /p/:id)
│   ├── bot/          # WhatsApp bot service, plugin loader, IPC handler
│   └── panel/        # Admin web panel (Svelte 5 Neubrutalism)
├── packages/
│   └── shared/       # Shared types, plugin interfaces & definitions
├── data/             # SQLite DB (nibolbot.db), sesi Baileys, & cache media
└── anti-slop/        # Laporan audit UI & accessibility
```

---

## 📋 Prasyarat

1. **Bun** v1.1 atau lebih baru (`curl -fsSL https://bun.sh/install | bash` / `powershell -c "irm bun.sh/install.ps1 | iex"`)
2. **yt-dlp** & **ffmpeg** (opsional untuk download & streaming musik):
   - Windows: `winget install yt-dlp` & `winget install ffmpeg`
   - Linux: `sudo apt install ffmpeg && pip install yt-dlp`

---

## 🚀 Panduan Menjalankan

### 1. Install Dependensi
Dari direktori root proyek:
```bash
bun install
```

### 2. Jalankan Layanan

Buka 3 terminal terpisah:

**Terminal 1 — API Server (Port 3000):**
```bash
cd apps/api
bun --watch src/index.ts
```

**Terminal 2 — Bot WhatsApp (Port 3001):**
```bash
cd apps/bot
bun --watch src/index.ts
```

**Terminal 3 — Admin Panel (Port 5173):**
```bash
cd apps/panel
bun run dev
```

Akses panel admin di browser: [http://localhost:5173](http://localhost:5173)

---

## 🔐 Kredensial Default Panel

- **Username:** `nibol`
- **Password:** `nibolganteng`

---

## 🤖 Perintah Bot WhatsApp

| Perintah | Deskripsi |
|---|---|
| `.ping` | Tes respon dan latency bot |
| `.help` / `.menu` | Daftar perintah yang aktif |
| `.status` | Informasi uptime, RAM, dan status koneksi |
| `.play <judul/link>` | Cari lagu, kirim kartu interaktif & link Web Player |
| `.yts <judul>` | Tampilkan hasil pencarian YouTube dalam format Carousel |
| `.ytmp3 <link>` | Download audio MP3 dari YouTube |
| `.ytmp4 <link>` | Download video MP4 (480p) dari YouTube |
| `.sticker` / `.s` | Buat stiker WebP 512x512 dari gambar |

---

## 🌐 Fitur Utama

1. **Pairing WhatsApp Tanpa Scan:** Mendukung Pairing Code 8 digit atau QR Code langsung dari panel admin.
2. **Web Player (`/p/:id`):** Pemutar audio HTML5 responsif dengan streaming langsung via HTTP chunked transfer tanpa menyimpan file ke memori HP.
3. **Spotify Resolver:** Otomatis mendeteksi link Spotify dan mencari padanan lagu di YouTube tanpa API key.
4. **Manajemen Grup & Auto Welcome:** Auto-catat grup aktif, ban per-grup, serta pesan sambutan otomatis untuk anggota baru.
5. **Keamanan & Hardening:** Argon2 password hash, JWT admin token, rate limiter login (5x/menit), blacklist user realtime, dan process crash guards.
6. **Cache TTL:** Otomatis membersihkan file media sementara setiap 5 menit dengan batas kapasitas 300 MB.
