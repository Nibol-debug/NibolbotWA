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
    origin: ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000"],
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

  // --- Web Player (PRD B5: /p/:id) ---
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
  .get("/api/stream/:id", async ({ params, set }) => {
    try {
      const res = await fetch(`${botUrl}/stream/${params.id}`, {
        headers: { "x-internal-token": internalToken }
      });
      if (!res.ok) {
        set.status = 404;
        return "Token expired";
      }
      set.headers["content-type"] = res.headers.get("content-type") || "audio/webm";
      set.headers["transfer-encoding"] = "chunked";
      set.headers["cache-control"] = "no-cache";
      set.headers["access-control-allow-origin"] = "*";
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
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nibolbot Web Player</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --green: #10b981;
      --green-dark: #064e3b;
      --green-light: #d1fae5;
      --border: #0d1f14;
      --bg: #f4fbf7;
      --shadow: 5px 5px 0px #0d1f14;
      --shadow-sm: 3px 3px 0px #0d1f14;
    }
    * { margin:0; padding:0; box-sizing:border-box; }
    body {
      font-family: 'Space Grotesk', system-ui, sans-serif;
      background: var(--bg);
      color: var(--border);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
    }
    .player {
      background: #fff;
      border: 3px solid var(--border);
      border-radius: 12px;
      box-shadow: var(--shadow);
      max-width: 420px;
      width: 100%;
      overflow: hidden;
    }
    .cover-wrap {
      position: relative;
      width: 100%;
      aspect-ratio: 16/9;
      background: #000;
      overflow: hidden;
    }
    .cover-wrap img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      opacity: 0.85;
    }
    .cover-badge {
      position: absolute;
      top: 12px;
      left: 12px;
      font-size: 0.7rem;
      font-weight: 700;
      background: var(--green);
      color: #fff;
      border: 2px solid var(--border);
      padding: 4px 10px;
      border-radius: 4px;
      box-shadow: var(--shadow-sm);
      letter-spacing: 0.05em;
    }
    .info {
      padding: 1.25rem 1.5rem 1rem;
    }
    .song-title {
      font-size: 1.15rem;
      font-weight: 700;
      line-height: 1.3;
      margin-bottom: 0.25rem;
    }
    .song-meta {
      font-size: 0.85rem;
      color: #4b6354;
      margin-bottom: 1rem;
    }
    .controls {
      padding: 0 1.5rem 1.5rem;
    }
    /* Progress bar */
    .progress-wrap {
      width: 100%;
      margin-bottom: 0.75rem;
    }
    .progress-bar {
      width: 100%;
      height: 10px;
      background: #e2e8f0;
      border: 2px solid var(--border);
      border-radius: 5px;
      overflow: hidden;
      cursor: pointer;
    }
    .progress-fill {
      height: 100%;
      background: var(--green);
      width: 0%;
      transition: width 0.3s linear;
    }
    .time-row {
      display: flex;
      justify-content: space-between;
      font-size: 0.75rem;
      font-weight: 600;
      color: #4b6354;
      margin-top: 4px;
      font-family: 'Space Grotesk', monospace;
    }
    /* Buttons */
    .btn-row {
      display: flex;
      gap: 0.75rem;
      align-items: center;
      justify-content: center;
    }
    .play-btn {
      width: 56px; height: 56px;
      border-radius: 50%;
      background: var(--green);
      color: #fff;
      border: 3px solid var(--border);
      box-shadow: var(--shadow-sm);
      font-size: 1.5rem;
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: all 0.1s;
    }
    .play-btn:hover { transform: translate(-2px,-2px); box-shadow: var(--shadow); }
    .play-btn:active { transform: translate(2px,2px); box-shadow: 1px 1px 0 var(--border); }
    .side-btn {
      width: 40px; height: 40px;
      border-radius: 50%;
      background: #fff;
      border: 2.5px solid var(--border);
      box-shadow: 2px 2px 0 var(--border);
      font-size: 1rem;
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
    }
    /* Volume */
    .volume-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-top: 1rem;
      padding: 0 1.5rem 1.25rem;
    }
    .vol-icon { font-size: 0.9rem; }
    .vol-slider {
      flex: 1;
      accent-color: var(--green);
      height: 6px;
    }
    /* Footer */
    .footer {
      text-align: center;
      padding: 0.75rem;
      border-top: 2.5px solid var(--border);
      background: var(--green-light);
    }
    .footer a {
      display: inline-block;
      font-weight: 700;
      font-size: 0.85rem;
      text-decoration: none;
      color: var(--green-dark);
      background: #fff;
      border: 2px solid var(--border);
      border-radius: 6px;
      box-shadow: 2px 2px 0 var(--border);
      padding: 0.4rem 1rem;
      transition: all 0.1s;
    }
    .footer a:hover { transform: translate(-1px,-1px); box-shadow: var(--shadow-sm); }
    /* Loading */
    .loading {
      text-align: center;
      padding: 3rem 1.5rem;
      font-weight: 700;
      color: #4b6354;
    }
    .spinner {
      display: inline-block;
      width: 32px; height: 32px;
      border: 4px solid var(--green-light);
      border-top-color: var(--green);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin-bottom: 0.75rem;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .error-card {
      text-align: center;
      padding: 2rem 1.5rem;
    }
    .error-card .emoji { font-size: 3rem; margin-bottom: 0.75rem; }
  </style>
</head>
<body>
  <div class="player" id="app">
    <div class="loading" id="loading-state">
      <div class="spinner"></div>
      <div>Memuat lagu...</div>
    </div>
  </div>

  <script>
    const TOKEN = "${id}";
    const API = location.origin;
    const app = document.getElementById("app");

    function fmt(sec) {
      const m = Math.floor(sec / 60);
      const s = Math.floor(sec % 60);
      return m + ":" + String(s).padStart(2, "0");
    }

    async function init() {
      let info;
      try {
        const res = await fetch(API + "/api/player/" + TOKEN);
        info = await res.json();
      } catch(e) {
        app.innerHTML = '<div class="error-card"><div class="emoji">😵</div><div><strong>Gagal memuat</strong></div><p style="margin-top:0.5rem;font-size:0.85rem;color:#4b6354">Server tidak merespon. Coba lagi nanti.</p></div>';
        return;
      }

      if (info.error) {
        app.innerHTML = '<div class="error-card"><div class="emoji">⏰</div><div><strong>Link Kedaluwarsa</strong></div><p style="margin-top:0.5rem;font-size:0.85rem;color:#4b6354">Token web player ini sudah expired. Minta link baru di WhatsApp.</p></div>';
        return;
      }

      document.title = info.title + " - Nibolbot Player";

      app.innerHTML = \`
        <div class="cover-wrap">
          <img src="\${info.thumbnail}" alt="Cover" onerror="this.style.display='none'">
          <div class="cover-badge">🤖 NIBOLBOT PLAYER</div>
        </div>
        <div class="info">
          <div class="song-title">\${esc(info.title)}</div>
          <div class="song-meta">👤 \${esc(info.channel)} · ⏱️ \${fmt(info.duration)}</div>
        </div>
        <div class="controls">
          <div class="progress-wrap">
            <div class="progress-bar" id="pbar">
              <div class="progress-fill" id="pfill"></div>
            </div>
            <div class="time-row">
              <span id="tcur">0:00</span>
              <span id="tdur">\${fmt(info.duration)}</span>
            </div>
          </div>
          <div class="btn-row">
            <button class="side-btn" id="rew" title="Mundur 10 detik">⏪</button>
            <button class="play-btn" id="pbtn" title="Play/Pause">▶</button>
            <button class="side-btn" id="fwd" title="Maju 10 detik">⏩</button>
          </div>
        </div>
        <div class="volume-row">
          <span class="vol-icon">🔊</span>
          <input type="range" min="0" max="100" value="80" class="vol-slider" id="vol">
        </div>
        <div class="footer">
          <a href="https://wa.me" target="_blank">💬 Kembali ke WhatsApp</a>
        </div>
      \`;

      const audio = new Audio(API + "/api/stream/" + TOKEN);
      audio.volume = 0.8;
      audio.preload = "auto";

      const pbtn = document.getElementById("pbtn");
      const pfill = document.getElementById("pfill");
      const tcur = document.getElementById("tcur");
      const pbar = document.getElementById("pbar");
      const vol = document.getElementById("vol");

      let playing = false;

      pbtn.onclick = () => {
        if (playing) { audio.pause(); pbtn.textContent = "▶"; }
        else { audio.play(); pbtn.textContent = "⏸"; }
        playing = !playing;
      };

      document.getElementById("rew").onclick = () => { audio.currentTime = Math.max(0, audio.currentTime - 10); };
      document.getElementById("fwd").onclick = () => { audio.currentTime += 10; };
      vol.oninput = () => { audio.volume = vol.value / 100; };

      audio.ontimeupdate = () => {
        if (!audio.duration) return;
        const pct = (audio.currentTime / audio.duration) * 100;
        pfill.style.width = pct + "%";
        tcur.textContent = fmt(audio.currentTime);
      };

      pbar.onclick = (e) => {
        if (!audio.duration) return;
        const rect = pbar.getBoundingClientRect();
        const pct = (e.clientX - rect.left) / rect.width;
        audio.currentTime = pct * audio.duration;
      };

      audio.onended = () => { playing = false; pbtn.textContent = "▶"; pfill.style.width = "0%"; };
      audio.onerror = () => {
        app.innerHTML = '<div class="error-card"><div class="emoji">😵</div><div><strong>Stream Error</strong></div><p style="margin-top:0.5rem;font-size:0.85rem;color:#4b6354">Gagal memutar audio. yt-dlp mungkin belum terinstall di server.</p></div>';
      };

      // Auto-play
      audio.play().then(() => { playing = true; pbtn.textContent = "⏸"; }).catch(() => {});
    }

    function esc(s) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }
    init();
  </script>
</body>
</html>`;
  })
  .listen(port);

console.log(`🦊 Elysia API server running at http://localhost:${port}`);
