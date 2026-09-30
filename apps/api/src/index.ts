import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { jwt } from "@elysiajs/jwt";
import { db } from "./db";

const port = Number(process.env.PORT) || 3000;
const botUrl = process.env.BOT_SERVICE_URL || "http://localhost:3001";
const internalToken = process.env.INTERNAL_TOKEN || "secret";

// In-memory rate limiter for login (max 5 failed attempts per 60s per IP)
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function checkLoginRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 60000 });
    return true;
  }
  if (entry.count >= 5) return false;
  entry.count++;
  return true;
}

// Process hardening
process.on("uncaughtException", (err) => {
  console.error("💥 Uncaught Exception in API:", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("💥 Unhandled Rejection in API:", reason);
});

export const app = new Elysia()
  .use(cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000", "https://nibol.my.id", "https://nibolbot.my.id"],
    credentials: true
  }))
  .use(
    jwt({
      name: "jwt",
      secret: process.env.JWT_SECRET || "nibolbot_jwt_secret_change_in_prod"
    })
  )
  .get("/health", () => ({ status: "ok", timestamp: new Date().toISOString() }))

  // --- Auth (PRD P1) ---
  .post("/api/auth/login", async ({ body, jwt, set, request }) => {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "127.0.0.1";
    if (!checkLoginRateLimit(ip)) {
      set.status = 429;
      return { success: false, message: "Terlalu banyak percobaan login. Tunggu 1 menit." };
    }

    const { username, password } = body;
    const admin = db.query("SELECT * FROM admin WHERE username = ?").get(username) as any;

    if (!admin) {
      set.status = 401;
      return { success: false, message: "Username atau password salah" };
    }

    const valid = await Bun.password.verify(password, admin.password_hash);
    if (!valid) {
      set.status = 401;
      return { success: false, message: "Username atau password salah" };
    }

    // Reset rate limit counter on successful login
    loginAttempts.delete(ip);

    const token = await jwt.sign({ sub: username, role: "admin" });
    return { success: true, token, username };
  }, {
    body: t.Object({
      username: t.String(),
      password: t.String()
    })
  })
  .get("/api/auth/me", async ({ headers, jwt, set }) => {
    const auth = headers["authorization"];
    if (!auth || !auth.startsWith("Bearer ")) {
      set.status = 401;
      return { authenticated: false };
    }
    const token = auth.slice(7);
    const payload = await jwt.verify(token);
    if (!payload) {
      set.status = 401;
      return { authenticated: false };
    }
    return { authenticated: true, user: payload };
  })

  // --- Bot Management (PRD P2) ---
  .get("/api/bot/status", async () => {
    try {
      const res = await fetch(`${botUrl}/status`, {
        headers: { "x-internal-token": internalToken }
      });
      return await res.json();
    } catch {
      return { status: "disconnected", uptime: 0, reason: "Bot service unreachable" };
    }
  })
  .post("/api/bot/pair", async ({ body }) => {
    try {
      const res = await fetch(`${botUrl}/pair`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-token": internalToken
        },
        body: JSON.stringify(body)
      });
      return await res.json();
    } catch {
      return { success: false, message: "Failed to communicate with bot service" };
    }
  }, {
    body: t.Object({ phone: t.Optional(t.String()) })
  })
  .post("/api/bot/logout", async () => {
    try {
      const res = await fetch(`${botUrl}/logout`, {
        method: "POST",
        headers: { "x-internal-token": internalToken }
      });
      return await res.json();
    } catch {
      return { success: false, message: "Bot service unreachable" };
    }
  })
  .post("/api/bot/restart", async () => {
    try {
      const res = await fetch(`${botUrl}/restart`, {
        method: "POST",
        headers: { "x-internal-token": internalToken }
      });
      return await res.json();
    } catch {
      return { success: false, message: "Failed to restart bot service" };
    }
  })

  // --- Settings (PRD P3) ---
  .get("/api/settings", () => {
    const rows = db.query("SELECT key, value FROM settings").all() as { key: string; value: string }[];
    const result: Record<string, any> = {};
    for (const r of rows) {
      try {
        result[r.key] = JSON.parse(r.value);
      } catch {
        result[r.key] = r.value;
      }
    }
    return result;
  })
  .put("/api/settings", ({ body }) => {
    const entries = Object.entries(body);
    for (const [k, v] of entries) {
      db.run(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [k, JSON.stringify(v)]
      );
    }
    return { success: true };
  }, {
    body: t.Record(t.String(), t.Any())
  })

  // --- Features & Plugins (PRD P4) ---
  .get("/api/features", () => {
    return db.query("SELECT * FROM feature_settings").all();
  })
  .put("/api/features/:name", ({ params, body }) => {
    const { name } = params;
    const { enabled, config } = body;
    db.run(
      "INSERT INTO feature_settings (feature, enabled, config) VALUES (?, ?, ?) ON CONFLICT(feature) DO UPDATE SET enabled = excluded.enabled, config = excluded.config",
      [name, enabled ? 1 : 0, JSON.stringify(config)]
    );
    return { success: true };
  }, {
    body: t.Object({
      enabled: t.Boolean(),
      config: t.Any()
    })
  })

  // --- Groups (PRD P5) ---
  .get("/api/groups", () => {
    return db.query("SELECT * FROM groups").all();
  })
  .put("/api/groups/:jid", ({ params, body }) => {
    const { jid } = params;
    const { name, banned, config } = body;
    db.run(
      "INSERT INTO groups (jid, name, banned, config) VALUES (?, ?, ?, ?) ON CONFLICT(jid) DO UPDATE SET banned = excluded.banned, config = excluded.config, name = coalesce(excluded.name, groups.name)",
      [
        jid,
        name || jid,
        banned === false ? 0 : banned === true ? 1 : 0,
        typeof config === "string" ? config : JSON.stringify(config || {})
      ]
    );
    return { success: true };
  }, {
    body: t.Object({
      name: t.Optional(t.String()),
      banned: t.Optional(t.Boolean()),
      config: t.Optional(t.Any())
    })
  })

  // --- Blacklist (PRD P6) ---
  .get("/api/users/blacklist", () => {
    return db.query("SELECT * FROM users WHERE blacklisted = 1").all();
  })
  .post("/api/users/blacklist", ({ body }) => {
    const { jid } = body;
    db.run(
      "INSERT INTO users (jid, blacklisted) VALUES (?, 1) ON CONFLICT(jid) DO UPDATE SET blacklisted = 1",
      [jid]
    );
    return { success: true };
  }, {
    body: t.Object({ jid: t.String() })
  })
  .delete("/api/users/blacklist/:jid", ({ params }) => {
    db.run("UPDATE users SET blacklisted = 0 WHERE jid = ?", [params.jid]);
    return { success: true };
  })

  // --- Logs (PRD P7) ---
  .get("/api/logs", () => {
    const commands = db.query("SELECT * FROM command_logs ORDER BY id DESC LIMIT 200").all();
    const errors = db.query("SELECT * FROM error_logs ORDER BY id DESC LIMIT 100").all();
    return { commands, errors };
  })

  // --- Stats (PRD P8) ---
  .get("/api/stats", () => {
    const todayCmdCount = db.query("SELECT COUNT(*) as count FROM command_logs WHERE DATE(ts) = DATE('now')").get() as any;
    const topFeatures = db.query("SELECT command, COUNT(*) as count FROM command_logs GROUP BY command ORDER BY count DESC LIMIT 5").all();
    const memoryUsage = Math.round(process.memoryUsage().rss / (1024 * 1024));
    return {
      todayCommands: todayCmdCount?.count || 0,
      topFeatures,
      memoryUsage
    };
  })

  // --- Cache (PRD P9) ---
  .post("/api/cache/clear", async () => {
    try {
      await fetch(`${botUrl}/cache/clear`, {
        method: "POST",
        headers: { "x-internal-token": internalToken }
      });
      return { success: true, message: "Cache cleared" };
    } catch {
      return { success: true, message: "Bot offline, cache reset noted" };
    }
  })

  // --- Web Player & Stream (PRD B5: /p/:id & /stream/:id) ---
  .get("/api/player/:id", async ({ params }) => {
    try {
      const res = await fetch(`${botUrl}/player-info/${params.id}`, {
        headers: { "x-internal-token": internalToken }
      });
      if (!res.ok) return { error: "Token expired or not found" };
      return await res.json();
    } catch {
      return { error: "Bot service unreachable" };
    }
  })
  .get("/stream/:id", async ({ params, set, request }) => {
    try {
      const headers: Record<string, string> = { "x-internal-token": internalToken };
      const range = request.headers.get("range");
      if (range) headers["range"] = range;

      const res = await fetch(`${botUrl}/stream/${params.id}`, { headers });
      if (!res.ok && res.status !== 206) {
        set.status = res.status;
        return res.status === 404 ? "Token expired or not found" : "Stream failed";
      }

      set.status = res.status; // 200 or 206
      set.headers["content-type"] = res.headers.get("content-type") || "video/mp4";
      set.headers["accept-ranges"] = "bytes";
      set.headers["access-control-allow-origin"] = "*";
      set.headers["cache-control"] = "public, max-age=3600";

      const cl = res.headers.get("content-length");
      if (cl) set.headers["content-length"] = cl;
      const cr = res.headers.get("content-range");
      if (cr) set.headers["content-range"] = cr;

      return res.body;
    } catch {
      set.status = 502;
      return "Stream unavailable";
    }
  })
  .get("/api/stream/:id", async ({ params, set, request }) => {
    try {
      const headers: Record<string, string> = { "x-internal-token": internalToken };
      const range = request.headers.get("range");
      if (range) headers["range"] = range;

      const res = await fetch(`${botUrl}/stream/${params.id}`, { headers });
      if (!res.ok && res.status !== 206) {
        set.status = res.status;
        return res.status === 404 ? "Token expired or not found" : "Stream failed";
      }

      set.status = res.status; // 200 or 206
      set.headers["content-type"] = res.headers.get("content-type") || "video/mp4";
      set.headers["accept-ranges"] = "bytes";
      set.headers["access-control-allow-origin"] = "*";
      set.headers["cache-control"] = "public, max-age=3600";

      const cl = res.headers.get("content-length");
      if (cl) set.headers["content-length"] = cl;
      const cr = res.headers.get("content-range");
      if (cr) set.headers["content-range"] = cr;

      return res.body;
    } catch {
      set.status = 502;
      return "Stream unavailable";
    }
  })
  .get("/p/:id", ({ params, set }) => {
    const { id } = params;
    set.headers["content-type"] = "text/html; charset=utf-8";

    return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <title>Nibolbot Video Player</title>
  <meta property="og:title" content="Nibolbot Video Player">
  <meta property="og:description" content="Putar video langsung di WhatsApp WebView / Browser">
  <meta property="og:type" content="video.other">
  <meta property="og:site_name" content="Nibolbot">
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #10b981;
      --primary-dark: #059669;
      --bg: #090d0b;
      --card: #131b16;
      --border: #1f2e25;
      --text: #f0fdf4;
      --muted: #86a393;
    }
    * { margin:0; padding:0; box-sizing:border-box; -webkit-tap-highlight-color: transparent; }
    body {
      font-family: 'Space Grotesk', system-ui, -apple-system, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      overflow-x: hidden;
    }
    .wrapper {
      width: 100%;
      max-width: 600px;
      display: flex;
      flex-direction: column;
      height: 100vh;
      height: 100dvh;
    }
    /* Video viewport */
    .video-box {
      position: relative;
      width: 100%;
      background: #000;
      aspect-ratio: 16/9;
      max-height: 55vh;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    video {
      width: 100%;
      height: 100%;
      object-fit: contain;
      background: #000;
    }
    /* Overlays */
    .badge {
      position: absolute;
      top: 12px;
      left: 12px;
      background: rgba(16, 185, 129, 0.9);
      color: #000;
      font-weight: 700;
      font-size: 0.7rem;
      padding: 4px 8px;
      border-radius: 4px;
      letter-spacing: 0.05em;
      z-index: 10;
      pointer-events: none;
    }
    .big-play {
      position: absolute;
      width: 68px;
      height: 68px;
      border-radius: 50%;
      background: var(--primary);
      color: #000;
      border: 3px solid #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.8rem;
      cursor: pointer;
      box-shadow: 0 4px 20px rgba(0,0,0,0.6);
      transition: transform 0.15s, opacity 0.2s;
      z-index: 15;
    }
    .big-play:active { transform: scale(0.9); }
    .big-play.hidden { opacity: 0; pointer-events: none; }
    /* Loading spinner */
    .spinner {
      position: absolute;
      width: 44px;
      height: 44px;
      border: 4px solid rgba(16,185,129,0.3);
      border-top-color: var(--primary);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      z-index: 12;
      display: none;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    /* Controls bar */
    .controls {
      background: rgba(19, 27, 22, 0.95);
      border-bottom: 2px solid var(--border);
      padding: 0.6rem 0.8rem;
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }
    .progress-wrap {
      width: 100%;
      height: 6px;
      background: #23342a;
      border-radius: 3px;
      position: relative;
      cursor: pointer;
      padding: 4px 0;
      background-clip: content-box;
    }
    .progress-fill {
      height: 6px;
      background: var(--primary);
      width: 0%;
      border-radius: 3px;
      pointer-events: none;
      transition: width 0.1s linear;
    }
    .control-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
    }
    .ctrl-group {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .cbtn {
      background: none;
      border: none;
      color: var(--text);
      font-size: 1.15rem;
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      border-radius: 6px;
      transition: background 0.15s;
    }
    .cbtn:active { background: var(--border); }
    .time-text {
      font-size: 0.75rem;
      color: var(--muted);
      font-weight: 600;
      white-space: nowrap;
    }
    .vol-slider {
      width: 60px;
      height: 4px;
      accent-color: var(--primary);
      cursor: pointer;
    }
    /* Details section */
    .meta-box {
      flex: 1;
      padding: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      overflow-y: auto;
    }
    .vtitle {
      font-size: 1.05rem;
      font-weight: 700;
      line-height: 1.35;
      color: var(--text);
    }
    .vinfo {
      font-size: 0.8rem;
      color: var(--muted);
      display: flex;
      gap: 0.6rem;
      align-items: center;
    }
    .actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.5rem;
      margin-top: 0.5rem;
    }
    .btn-act {
      background: var(--card);
      border: 1.5px solid var(--border);
      color: var(--text);
      padding: 0.6rem;
      border-radius: 8px;
      text-align: center;
      font-size: 0.8rem;
      font-weight: 600;
      text-decoration: none;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.4rem;
    }
    .btn-act:active { border-color: var(--primary); }
    .btn-back {
      grid-column: 1 / -1;
      background: var(--primary);
      color: #000;
      font-weight: 700;
      border: none;
    }
    /* Status banner */
    .status-msg {
      font-size: 0.8rem;
      color: var(--muted);
      text-align: center;
      min-height: 1.2em;
    }
    /* Error / Initial Loading State */
    .center-state {
      text-align: center;
      padding: 3rem 1.5rem;
    }
    .center-state .ico { font-size: 2.5rem; margin-bottom: 0.5rem; }
  </style>
</head>
<body>
  <div class="wrapper" id="app">
    <div class="center-state">
      <div class="spinner" style="display:inline-block;position:static;margin-bottom:0.75rem;"></div>
      <div style="font-weight:600;color:var(--muted)">Menyiapkan video...</div>
    </div>
  </div>

  <script>
    const T = "${id}";
    const API = location.origin;
    const app = document.getElementById("app");

    function fmt(s) {
      if (!s || isNaN(s)) return "0:00";
      const m = Math.floor(s / 60);
      const sec = Math.floor(s % 60);
      return m + ":" + String(sec).padStart(2, "0");
    }
    function esc(s) {
      const d = document.createElement("div");
      d.textContent = s || "";
      return d.innerHTML;
    }

    async function init() {
      let info;
      try {
        const r = await fetch(API + "/api/player/" + T);
        info = await r.json();
      } catch (err) {
        app.innerHTML = '<div class="center-state"><div class="ico">😵</div><b>Gagal terhubung ke server</b></div>';
        return;
      }

      if (info.error) {
        app.innerHTML = '<div class="center-state"><div class="ico">⏰</div><b>Video Tidak Ditemukan atau Link Kedaluwarsa</b><p style="margin-top:.5rem;font-size:.8rem;color:var(--muted)">Kirim ulang perintah .play di WhatsApp.</p></div>';
        return;
      }

      document.title = info.title + " - Nibolbot";

      app.innerHTML = \`
        <div class="video-box" id="vbox">
          <div class="badge">🤖 NIBOLBOT</div>
          <video
            id="vid"
            playsinline
            webkit-playsinline
            x5-playsinline
            poster="\${info.thumbnail || ''}"
            preload="metadata"
          ></video>
          <button class="big-play" id="bp">▶</button>
          <div class="spinner" id="sp"></div>
        </div>

        <div class="controls">
          <div class="progress-wrap" id="pbar">
            <div class="progress-fill" id="pfill"></div>
          </div>
          <div class="control-row">
            <div class="ctrl-group">
              <button class="cbtn" id="pbtn" title="Play/Pause">▶</button>
              <button class="cbtn" id="rew" title="-10s">⏪</button>
              <button class="cbtn" id="fwd" title="+10s">⏩</button>
              <span class="time-text"><span id="tcur">0:00</span> / <span id="tdur">\${fmt(info.duration)}</span></span>
            </div>
            <div class="ctrl-group">
              <button class="cbtn" id="mbtn" title="Mute">🔊</button>
              <input type="range" min="0" max="100" value="100" class="vol-slider" id="vol">
              <button class="cbtn" id="fsbtn" title="Fullscreen">⛶</button>
            </div>
          </div>
        </div>

        <div class="meta-box">
          <div>
            <div class="vtitle">\${esc(info.title)}</div>
            <div class="vinfo" style="margin-top:4px;">
              <span>👤 \${esc(info.channel)}</span>
              <span>•</span>
              <span>⏱️ \${fmt(info.duration)}</span>
            </div>
          </div>

          <div class="status-msg" id="st"></div>

          <div class="actions">
            <a href="https://wa.me" class="btn-act btn-back">💬 Buka WhatsApp</a>
            <div class="btn-act" style="cursor:default">🎧 .ytmp3 \${esc(info.videoId)}</div>
            <div class="btn-act" style="cursor:default">🎬 .ytmp4 \${esc(info.videoId)}</div>
          </div>
        </div>
      \`;

      const vid = document.getElementById("vid"),
            bp = document.getElementById("bp"),
            sp = document.getElementById("sp"),
            pbtn = document.getElementById("pbtn"),
            pbar = document.getElementById("pbar"),
            pfill = document.getElementById("pfill"),
            tcur = document.getElementById("tcur"),
            tdur = document.getElementById("tdur"),
            rew = document.getElementById("rew"),
            fwd = document.getElementById("fwd"),
            vol = document.getElementById("vol"),
            mbtn = document.getElementById("mbtn"),
            fsbtn = document.getElementById("fsbtn"),
            st = document.getElementById("st"),
            vbox = document.getElementById("vbox");

      let loaded = false;

      function setStatus(t) { st.textContent = t; }

      function loadVideo() {
        if (!loaded) {
          setStatus("⏳ Mengambil stream video...");
          sp.style.display = "block";
          bp.classList.add("hidden");
          vid.src = API + "/stream/" + T;
          vid.load();
          loaded = true;
        }
      }

      function togglePlay() {
        loadVideo();
        if (vid.paused) {
          vid.play().then(() => {
            pbtn.textContent = "⏸";
            bp.classList.add("hidden");
            setStatus("");
          }).catch(err => {
            console.warn("Play error:", err);
            bp.classList.remove("hidden");
            pbtn.textContent = "▶";
          });
        } else {
          vid.pause();
          pbtn.textContent = "▶";
          bp.classList.remove("hidden");
        }
      }

      bp.onclick = togglePlay;
      pbtn.onclick = togglePlay;
      vid.onclick = togglePlay;

      rew.onclick = () => { vid.currentTime = Math.max(0, vid.currentTime - 10); };
      fwd.onclick = () => { vid.currentTime = Math.min(vid.duration || 99999, vid.currentTime + 10); };

      vid.onwaiting = () => { sp.style.display = "block"; };
      vid.onplaying = () => {
        sp.style.display = "none";
        bp.classList.add("hidden");
        pbtn.textContent = "⏸";
        setStatus("");
      };
      vid.onpause = () => {
        pbtn.textContent = "▶";
        bp.classList.remove("hidden");
      };
      vid.oncanplay = () => {
        sp.style.display = "none";
        if (vid.duration) tdur.textContent = fmt(vid.duration);
      };
      vid.ontimeupdate = () => {
        if (!vid.duration) return;
        const pct = (vid.currentTime / vid.duration) * 100;
        pfill.style.width = pct + "%";
        tcur.textContent = fmt(vid.currentTime);
      };
      vid.onended = () => {
        pbtn.textContent = "▶";
        bp.classList.remove("hidden");
        pfill.style.width = "0%";
      };
      vid.onerror = () => {
        sp.style.display = "none";
        bp.classList.remove("hidden");
        setStatus("❌ Gagal memutar video. Coba refresh.");
      };

      // Progress bar seek (mouse + touch)
      function seek(clientX) {
        if (!vid.duration) return;
        const rect = pbar.getBoundingClientRect();
        const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        vid.currentTime = pos * vid.duration;
      }
      pbar.onclick = (e) => seek(e.clientX);
      pbar.ontouchstart = (e) => { if (e.touches && e.touches[0]) seek(e.touches[0].clientX); };
      pbar.ontouchmove = (e) => { if (e.touches && e.touches[0]) seek(e.touches[0].clientX); };

      // Volume & mute
      vol.oninput = () => {
        vid.volume = vol.value / 100;
        vid.muted = vid.volume === 0;
        mbtn.textContent = vid.muted ? "🔇" : (vid.volume < 0.5 ? "🔉" : "🔊");
      };
      mbtn.onclick = () => {
        vid.muted = !vid.muted;
        mbtn.textContent = vid.muted ? "🔇" : "🔊";
        if (!vid.muted && vid.volume === 0) {
          vid.volume = 0.5;
          vol.value = 50;
        }
      };

      // Fullscreen
      fsbtn.onclick = () => {
        if (!document.fullscreenElement) {
          if (vbox.requestFullscreen) vbox.requestFullscreen();
          else if (vid.webkitEnterFullscreen) vid.webkitEnterFullscreen(); // iOS / WebKit
          else if (vbox.webkitRequestFullscreen) vbox.webkitRequestFullscreen();
        } else {
          if (document.exitFullscreen) document.exitFullscreen();
        }
      };

      // Auto-trigger video load & play on user gesture
      loadVideo();
      vid.play().then(() => {
        pbtn.textContent = "⏸";
        bp.classList.add("hidden");
      }).catch(() => {
        // Autoplay blocked by browser policy, wait for tap on bp
        sp.style.display = "none";
        bp.classList.remove("hidden");
        setStatus("Ketuk tombol ▶ untuk memutar video");
      });
    }

    init();
  </script>
</body>
</html>`;
  })
  .listen(port);

console.log(`🦊 Elysia API server running at http://localhost:${port}`);
