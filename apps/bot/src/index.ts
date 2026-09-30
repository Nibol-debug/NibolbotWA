import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  type WASocket,
  type ConnectionState
} from "@whiskeysockets/baileys";
import initButtons from "buttons-warpper";
import pino from "pino";
import { Boom } from "@hapi/boom";
import { existsSync, mkdirSync, rmSync, readFileSync, statSync, unlinkSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { execSync } from "node:child_process";
import { loadPlugins } from "./plugin-loader";
import { handleIncomingMessage } from "./command-handler";
import { scheduleCacheCleanup } from "./lib/cache";
import { createPlayerToken, getPlayerToken } from "./lib/player";
import { getVideoInfo } from "./lib/youtube";
import { getVideoStreamUrl, invalidateStreamCache } from "./lib/stream";
import { db } from "./db";

// Process hardening
process.on("uncaughtException", (err) => {
  console.error("💥 Uncaught Exception in Bot:", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("💥 Unhandled Rejection in Bot:", reason);
});

const port = Number(process.env.PORT) || 3001;
const internalToken = process.env.INTERNAL_TOKEN || "secret";

const sessionDir = process.env.SESSION_DIR || resolve(import.meta.dir, "../../..", "data/session");
const cacheDir = process.env.CACHE_DIR || resolve(import.meta.dir, "../../..", "data/cache");

if (!existsSync(sessionDir)) mkdirSync(sessionDir, { recursive: true });
if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

let sock: WASocket | null = null;
let connectionStatus: "online" | "pairing" | "disconnected" = "disconnected";
let activePairingCode: string | null = null;
let activeQR: string | null = null;
const startTime = Date.now();

async function connectToWhatsApp(phoneNumberToPair?: string) {
  await loadPlugins();

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version, isLatest } = await fetchLatestBaileysVersion();
  logger.info(`Baileys version: ${version.join(".")} (isLatest: ${isLatest})`);

  sock = makeWASocket({
    version,
    logger: pino({ level: "silent" }),
    printQRInTerminal: true,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger)
    },
    browser: ["Ubuntu", "Chrome", "20.0.04"],
    generateHighQualityLinkPreview: true,
    defaultQueryTimeoutMs: 60_000
  });

  try {
    await initButtons(sock);
  } catch (err: any) {
    logger.warn({ err }, "buttons-warpper initialization error");
  }

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update: Partial<ConnectionState>) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      connectionStatus = "pairing";
      activeQR = qr;
      activePairingCode = null;
      logger.info("QR Code received — available at /qr endpoint");
    }

    if (connection === "close") {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const isSessionDead = statusCode === DisconnectReason.loggedOut || statusCode === 440;
      const shouldReconnect = !isSessionDead;
      connectionStatus = "disconnected";
      activeQR = null;
      activePairingCode = null;
      logger.warn(`Connection closed (code: ${statusCode}), reconnecting: ${shouldReconnect}`);

      if (shouldReconnect) {
        setTimeout(connectToWhatsApp, 3000);
      } else {
        logger.error(`Session invalidated (code: ${statusCode}). Session cleared, ready for new pairing.`);
        rmSync(sessionDir, { recursive: true, force: true });
        mkdirSync(sessionDir, { recursive: true });
        setTimeout(() => connectToWhatsApp(), 2000);
      }
    } else if (connection === "open") {
      connectionStatus = "online";
      activePairingCode = null;
      activeQR = null;
      logger.info("✅ WhatsApp Bot connected successfully via Baileys!");
    }
  });

  // Pairing code mode
  if (phoneNumberToPair && !sock.authState.creds.registered) {
    connectionStatus = "pairing";
    const cleanedNumber = phoneNumberToPair.replace(/[^0-9]/g, "");
    logger.info(`Requesting pairing code for: ${cleanedNumber}`);
    setTimeout(async () => {
      try {
        if (sock) {
          const code = await sock.requestPairingCode(cleanedNumber);
          activePairingCode = code;
          activeQR = null;
          logger.info(`🔑 Pairing Code: ${code}`);
        }
      } catch (err) {
        logger.error({ err }, "Failed to generate pairing code");
      }
    }, 2000);
  }

  // Message handler
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify" || !sock) return;
    for (const msg of messages) {
      await handleIncomingMessage(sock, msg);
    }
  });

  // Welcome / goodbye handler (PRD B10)
  sock.ev.on("group-participants.update", async (update) => {
    if (update.action !== "add" || !sock) return;
    try {
      const group = db.query("SELECT config, banned FROM groups WHERE jid = ?").get(update.id) as any;
      if (!group || group.banned === 1) return;
      const config = typeof group.config === "string" ? JSON.parse(group.config || "{}") : (group.config || {});
      if (config.welcome && config.welcomeMsg) {
        for (const participant of update.participants) {
          const userTag = `@${participant.split("@")[0]}`;
          const text = config.welcomeMsg.replace("@user", userTag);
          await sock.sendMessage(update.id, {
            text,
            mentions: [participant]
          });
        }
      }
    } catch (err) {
      logger.error({ err }, "Failed to send welcome message");
    }
  });
}

// Start
connectToWhatsApp();
scheduleCacheCleanup();

// IPC HTTP Server
Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);
    const token = req.headers.get("x-internal-token");

    if (token !== internalToken) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (url.pathname === "/status") {
      return Response.json({
        status: connectionStatus,
        uptime: Math.floor((Date.now() - startTime) / 1000),
        pairingCode: activePairingCode,
        qr: activeQR,
        phone: sock?.user?.id?.split(":")[0] || null
      });
    }

    if (url.pathname === "/pair" && req.method === "POST") {
      const body = await req.json() as { phone?: string };
      // Reset session for fresh pairing
      if (sock) sock.end(new Error("Re-pair requested"));
      rmSync(sessionDir, { recursive: true, force: true });
      mkdirSync(sessionDir, { recursive: true });
      activeQR = null;
      activePairingCode = null;
      connectToWhatsApp(body.phone);
      return Response.json({ success: true, message: body.phone ? "Pairing code requested" : "QR pairing started" });
    }

    if (url.pathname === "/restart" && req.method === "POST") {
      sock?.end(new Error("Manual restart from panel"));
      connectToWhatsApp();
      return Response.json({ success: true, message: "Restarting socket" });
    }

    if (url.pathname === "/logout" && req.method === "POST") {
      await sock?.logout();
      rmSync(sessionDir, { recursive: true, force: true });
      mkdirSync(sessionDir, { recursive: true });
      connectionStatus = "disconnected";
      activeQR = null;
      activePairingCode = null;
      return Response.json({ success: true, message: "Logged out & session cleared" });
    }

    if (url.pathname === "/cache/clear" && req.method === "POST") {
      rmSync(cacheDir, { recursive: true, force: true });
      mkdirSync(cacheDir, { recursive: true });
      return Response.json({ success: true, message: "Cache directory cleared" });
    }

    if (url.pathname === "/player-token" && req.method === "POST") {
      const body = await req.json() as { videoId: string; title: string; channel: string; duration: number; thumbnail: string };
      const id = createPlayerToken(body.videoId, body.title, body.channel, body.duration, body.thumbnail);
      return Response.json({ success: true, id });
    }

    if (url.pathname.startsWith("/player-info/")) {
      const id = url.pathname.split("/player-info/")[1];
      let info = getPlayerToken(id);
      if (!info && /^[a-zA-Z0-9_-]{11}$/.test(id)) {
        const yt = await getVideoInfo(id);
        if (yt) {
          info = {
            videoId: yt.id,
            title: yt.title,
            channel: yt.channel,
            duration: yt.duration,
            thumbnail: yt.thumbnail
          };
        }
      }
      if (!info) return Response.json({ error: "Video not found or token expired" }, { status: 404 });
      return Response.json(info);
    }

    if (url.pathname.startsWith("/stream/")) {
      const id = url.pathname.split("/stream/")[1];
      let videoId = id;
      const info = getPlayerToken(id);
      if (info) videoId = info.videoId;

      if (!videoId) return new Response("Token expired or missing video ID", { status: 404 });

      // 1. Attempt direct proxy streaming (zero disk, low RAM, fast seek)
      let streamUrl = await getVideoStreamUrl(videoId);
      if (streamUrl) {
        const rangeHeader = req.headers.get("range");
        const fetchHeaders: Record<string, string> = {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        };
        if (rangeHeader) fetchHeaders["Range"] = rangeHeader;

        try {
          let upstream = await fetch(streamUrl, { headers: fetchHeaders });
          if (upstream.status === 403) {
            invalidateStreamCache(videoId);
            streamUrl = await getVideoStreamUrl(videoId);
            if (streamUrl) {
              upstream = await fetch(streamUrl, { headers: fetchHeaders });
            }
          }

          if (upstream.ok || upstream.status === 206) {
            const respHeaders = new Headers();
            respHeaders.set("Content-Type", upstream.headers.get("content-type") || "video/mp4");
            respHeaders.set("Accept-Ranges", "bytes");
            respHeaders.set("Access-Control-Allow-Origin", "*");
            respHeaders.set("Cache-Control", "public, max-age=3600");

            const cl = upstream.headers.get("content-length");
            if (cl) respHeaders.set("Content-Length", cl);

            const cr = upstream.headers.get("content-range");
            if (cr) respHeaders.set("Content-Range", cr);

            return new Response(upstream.body, {
              status: upstream.status,
              headers: respHeaders
            });
          }
        } catch (err) {
          console.error(`Direct stream proxy failed for ${videoId}:`, err);
        }
      }

      // 2. Fallback: pipe streaming via yt-dlp spawn
      const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const proc = Bun.spawn([
        "yt-dlp",
        "--js-runtimes", "node:/usr/bin/node",
        "-f", "18/best[ext=mp4]/bestaudio/best",
        "-o", "-",
        "--no-playlist",
        "--no-warnings",
        "--quiet",
        ytUrl
      ], { stdout: "pipe", stderr: "ignore" });

      return new Response(proc.stdout, {
        headers: {
          "Content-Type": "video/mp4",
          "Accept-Ranges": "none",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-cache"
        }
      });
    }

    return new Response("Not Found", { status: 404 });
  }
});

logger.info(`🤖 Bot IPC service listening at http://localhost:${port}`);
