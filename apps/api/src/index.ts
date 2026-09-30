import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { jwt } from "@elysiajs/jwt";
import { db } from "./db";
import { renderGamePage } from "./games";
import { renderPlayerPage } from "./player";
import { renderRecordPlayerPage } from "./player-record";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const port = Number(process.env.PORT) || 3000;
const botUrl = process.env.BOT_SERVICE_URL || "http://localhost:3001";
const internalToken = process.env.INTERNAL_TOKEN || "secret";

interface PVSession {
  id: string;
  filePath: string;
  title: string;
  channel: string;
  duration: number;
  createdAt: number;
  expiresAt: number;
  used: boolean;
}
const pvSessions = new Map<string, PVSession>();

const panelDist = [
  join(import.meta.dir, "../../panel/dist"),
  "/app/apps/panel/dist",
  join(process.cwd(), "apps/panel/dist")
].find(p => existsSync(p));

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
    .ws("/ws/stream/:id", {
    async open(ws) {
      const id = ws.data.params.id;
      console.log(`[WS] Client connected for stream: ${id}`);
      try {
        const streamRes = await fetch(`${botUrl}/stream/${id}`, {
          headers: { "x-internal-token": internalToken }
        });

        if (!streamRes.ok || !streamRes.body) {
          ws.send("ERROR: Stream unavailable");
          ws.close();
          return;
        }

        const cl = streamRes.headers.get("content-length");
        if (cl) {
          ws.send(`TOTAL:${cl}`);
        }

        const reader = streamRes.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value && value.byteLength > 0) {
            const CHUNK_SIZE = 16384;
            for (let offset = 0; offset < value.byteLength; offset += CHUNK_SIZE) {
              const slice = value.subarray(offset, Math.min(offset + CHUNK_SIZE, value.byteLength));
              ws.send(slice);
            }
          }
        }

        ws.send("END");
        ws.close();
      } catch (err: any) {
        console.error(`[WS] Stream proxy error for ${id}:`, err?.message || err);
        try {
          ws.send("ERROR: Stream failed");
          ws.close();
        } catch {}
      }
    }
  })
  .get("/p/:id", ({ params, set }) => {
    set.headers["content-type"] = "text/html; charset=utf-8";
    return renderPlayerPage(params.id);
  })
  // --- Recording Player Routes (/pv/:id & /ws/pv/:id) ---
  .post("/api/pv/register", ({ body, headers, set }) => {
    if (headers["x-internal-token"] !== internalToken) {
      set.status = 401;
      return { error: "Unauthorized" };
    }
    const raw = body as any;
    const now = Date.now();
    const session: PVSession = {
      id: raw.id,
      filePath: raw.filePath,
      title: raw.title,
      channel: raw.channel,
      duration: raw.duration,
      createdAt: now,
      expiresAt: now + 5 * 60 * 1000, // TTL 5 menit
      used: false
    };
    pvSessions.set(session.id, session);
    // Hapus otomatis setelah TTL 5 menit
    setTimeout(() => pvSessions.delete(session.id), 5 * 60 * 1000);
    return { success: true, id: session.id };
  })
  .get("/api/pv/info/:id", ({ params, set }) => {
    const s = pvSessions.get(params.id);
    if (!s || Date.now() > s.expiresAt) {
      set.status = 404;
      return { error: "Session not found or expired" };
    }
    return { id: s.id, title: s.title, channel: s.channel, duration: s.duration };
  })
  .get("/pv/:id", ({ params, request, set }) => {
    const s = pvSessions.get(params.id);
    if (!s || Date.now() > s.expiresAt || s.used) {
      set.status = 404;
      return "Sesi rekaman player tidak valid, telah kedaluwarsa, atau sudah pernah digunakan.";
    }
    // Verifikasi akses: boleh diakses jika memiliki ID valid & belum expired
    // Tandai sekali pakai
    s.used = true;
    set.headers["content-type"] = "text/html; charset=utf-8";
    return renderRecordPlayerPage(params.id);
  })
  .ws("/ws/pv/:id", {
    async open(ws) {
      const id = ws.data.params.id;
      const s = pvSessions.get(id);
      if (!s || Date.now() > s.expiresAt || !existsSync(s.filePath)) {
        ws.send("ERROR: Session expired or file not found");
        ws.close();
        return;
      }
      try {
        const file = Bun.file(s.filePath);
        const buf = Buffer.from(await file.arrayBuffer());
        ws.send(`TOTAL:${buf.length}`);

        const CHUNK_SIZE = 16384;
        for (let offset = 0; offset < buf.length; offset += CHUNK_SIZE) {
          const slice = buf.subarray(offset, Math.min(offset + CHUNK_SIZE, buf.length));
          ws.send(slice);
          await Bun.sleep(5);
        }
        ws.send("END");
        ws.close();
      } catch (err: any) {
        console.error(`[WS-PV] Stream error for ${id}:`, err);
        try { ws.close(); } catch {}
      }
    }
  })
  // --- Mini Games (Dino Runner / Arcade) ---
  .get("/games", ({ set }) => {
    set.headers["content-type"] = "text/html; charset=utf-8";
    return renderGamePage("index");
  })
  .get("/games/:game", ({ params, set }) => {
    set.headers["content-type"] = "text/html; charset=utf-8";
    return renderGamePage(params.game);
  })

  // --- Svelte Panel SPA Static & Fallback Routing ---
  .get("/", ({ set }) => {
    if (panelDist && existsSync(join(panelDist, "index.html"))) {
      set.headers["content-type"] = "text/html; charset=utf-8";
      return readFileSync(join(panelDist, "index.html"), "utf-8");
    }
    return { name: "Nibolbot API", status: "running" };
  })
  .get("*", ({ request, set }) => {
    const url = new URL(request.url);
    const pathname = url.pathname;
    if (
      pathname.startsWith("/api/") ||
      pathname.startsWith("/stream/") ||
      pathname.startsWith("/p/") ||
      pathname.startsWith("/games") ||
      pathname.startsWith("/health")
    ) {
      set.status = 404;
      return "Not Found";
    }

    if (panelDist) {
      const filePath = join(panelDist, pathname);
      if (existsSync(filePath) && !pathname.endsWith("/")) {
        return Bun.file(filePath);
      }
      const indexPath = join(panelDist, "index.html");
      if (existsSync(indexPath)) {
        set.headers["content-type"] = "text/html; charset=utf-8";
        return readFileSync(indexPath, "utf-8");
      }
    }

    set.status = 404;
    return "Not Found";
  })
  .listen(port);

console.log(`🦊 Elysia API server running at http://localhost:${port}`);
