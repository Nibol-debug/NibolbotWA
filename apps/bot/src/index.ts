import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  type WASocket,
  type ConnectionState
} from "@whiskeysockets/baileys";
import pino from "pino";
import { Boom } from "@hapi/boom";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { loadPlugins } from "./plugin-loader";
import { handleIncomingMessage } from "./command-handler";
import { scheduleCacheCleanup } from "./lib/cache";
import { createPlayerToken, getPlayerToken } from "./lib/player";
import { db } from "./db";
import { spawn } from "node:child_process";

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
    auth: state,
    browser: ["Ubuntu", "Chrome", "20.0.04"],
    generateHighQualityLinkPreview: true
  });

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
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      connectionStatus = "disconnected";
      activeQR = null;
      activePairingCode = null;
      logger.warn(`Connection closed (code: ${statusCode}), reconnecting: ${shouldReconnect}`);

      if (shouldReconnect) {
        setTimeout(connectToWhatsApp, 3000);
      } else {
        logger.error("Logged out from WhatsApp. Session cleared.");
        rmSync(sessionDir, { recursive: true, force: true });
        mkdirSync(sessionDir, { recursive: true });
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
      const tokenId = url.pathname.split("/player-info/")[1];
      const info = getPlayerToken(tokenId);
      if (!info) return Response.json({ error: "Token expired or not found" }, { status: 404 });
      return Response.json(info);
    }

    if (url.pathname.startsWith("/stream/")) {
      const tokenId = url.pathname.split("/stream/")[1];
      const info = getPlayerToken(tokenId);
      if (!info) return new Response("Token expired", { status: 404 });

      // Stream audio from yt-dlp directly to response (no file on disk)
      const ytUrl = `https://www.youtube.com/watch?v=${info.videoId}`;
      const proc = spawn("yt-dlp", [
        "-f", "bestaudio",
        "-o", "-",
        "--no-playlist",
        "--no-warnings",
        "--quiet",
        ytUrl
      ], { stdio: ["ignore", "pipe", "ignore"] });

      const stream = new ReadableStream({
        start(controller) {
          proc.stdout.on("data", (chunk: Buffer) => {
            controller.enqueue(new Uint8Array(chunk));
          });
          proc.stdout.on("end", () => controller.close());
          proc.stdout.on("error", () => controller.close());
          proc.on("error", () => controller.close());
        },
        cancel() {
          proc.kill();
        }
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "audio/webm",
          "Transfer-Encoding": "chunked",
          "Cache-Control": "no-cache",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    return new Response("Not Found", { status: 404 });
  }
});

logger.info(`🤖 Bot IPC service listening at http://localhost:${port}`);
