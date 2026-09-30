import type { WASocket, proto } from "@whiskeysockets/baileys";
import { db, getBotSettings, isUserBlacklisted, isGroupBanned, logCommand, logError } from "./db";
import { getPluginForCommand, isFeatureEnabled, getFeatureConfig } from "./plugin-loader";
import type { PluginContext } from "@nibolbot/shared";

// In-memory cooldown tracker: key -> timestamp expiry in ms
const cooldowns = new Map<string, number>();

export async function handleIncomingMessage(sock: WASocket, msg: proto.IWebMessageInfo): Promise<void> {
  if (!msg.message || msg.key.fromMe) return;

  const from = msg.key.remoteJid;
  if (!from || from === "status@broadcast") return;

  const isGroup = from.endsWith("@g.us");
  const sender = isGroup ? (msg.key.participant || from) : from;

  // Auto-register group in database if new
  if (isGroup) {
    const existing = db.query("SELECT jid FROM groups WHERE jid = ?").get(from);
    if (!existing) {
      db.run(
        "INSERT OR IGNORE INTO groups (jid, name, banned, config) VALUES (?, ?, 0, ?)",
        [from, from, JSON.stringify({ cooldown: 15, welcome: false, welcomeMsg: "Halo @user, selamat datang!" })]
      );
    }
  }

  // Extract text from conversation, extended text, or media captions
  const messageContent = msg.message;
  const rawText =
    messageContent.conversation ||
    messageContent.extendedTextMessage?.text ||
    messageContent.imageMessage?.caption ||
    messageContent.videoMessage?.caption ||
    messageContent.documentMessage?.caption ||
    "";

  const cleanText = rawText.trim();
  if (!cleanText) return;

  const settings = getBotSettings();
  const prefix = settings.prefix || ".";

  if (!cleanText.startsWith(prefix)) return;

  // Extract command name and args
  const bodyWithoutPrefix = cleanText.slice(prefix.length).trim();
  const [cmdRaw, ...args] = bodyWithoutPrefix.split(/\s+/);
  if (!cmdRaw) return;

  const command = cmdRaw.toLowerCase();
  const plugin = getPluginForCommand(command);
  if (!plugin) return;

  // 1. Group Ban Check (PRD P5)
  if (isGroup && isGroupBanned(from)) {
    logCommand(sender, command, "BLOCKED");
    return;
  }

  // 2. User Blacklist Check (PRD P6)
  if (isUserBlacklisted(sender)) {
    logCommand(sender, command, "BLOCKED");
    return;
  }

  // 3. Bot Mode Check (PRD P3: 'public' vs 'owner')
  const isOwner = settings.owners.some(owner => sender.includes(owner.replace(/[^0-9]/g, "")));
  if (settings.mode === "owner" && !isOwner) {
    logCommand(sender, command, "BLOCKED");
    await sock.sendMessage(from, { text: "🔒 Bot sedang dalam mode khusus Owner." }, { quoted: msg });
    return;
  }

  // 4. Feature Toggle Check (PRD P4)
  if (!isFeatureEnabled(plugin.name)) {
    logCommand(sender, command, "BLOCKED");
    await sock.sendMessage(from, { text: `⚠️ Fitur *${plugin.name}* sedang dinonaktifkan oleh admin.` }, { quoted: msg });
    return;
  }

  // 5. Cooldown Check (Bypass for owner)
  const config = getFeatureConfig(plugin.name) || plugin.defaults;
  const cooldownDuration = (config.cooldown ?? plugin.defaults.cooldown) * 1000;

  if (cooldownDuration > 0 && !isOwner) {
    const cooldownKey = `${sender}:${plugin.name}`;
    const now = Date.now();
    const expiry = cooldowns.get(cooldownKey) || 0;

    if (now < expiry) {
      const remainingSec = Math.ceil((expiry - now) / 1000);
      logCommand(sender, command, "COOLDOWN");
      await sock.sendMessage(
        from,
        { text: `⏳ *Cooldown!* Mohon tunggu *${remainingSec} detik* sebelum menggunakan perintah ini lagi.` },
        { quoted: msg }
      );
      return;
    }

    cooldowns.set(cooldownKey, now + cooldownDuration);
  }

  // 6. Context Preparation & Reply Helper (with optional Newsletter Header B9)
  const reply = async (content: string | proto.AnyMessageContent) => {
    let payload: any;
    if (typeof content === "string") {
      payload = { text: content };
    } else {
      payload = content;
    }

    // Header channel B9: if newsletterJid is configured in settings
    if (settings.newsletterJid && !payload.contextInfo?.forwardingScore) {
      payload.contextInfo = {
        ...(payload.contextInfo || {}),
        forwardedNewsletterMessageInfo: {
          newsletterJid: settings.newsletterJid,
          newsletterName: settings.channelName || settings.botName,
          serverMessageId: -1
        },
        isForwarded: true
      };
    }

    return sock.sendMessage(from, payload, { quoted: msg });
  };

  const ctx: PluginContext = {
    sock,
    msg,
    from,
    sender,
    isGroup,
    command,
    args,
    fullText: bodyWithoutPrefix.slice(command.length).trim(),
    reply,
    db,
    settings
  };

  // 7. Execute Plugin Run
  try {
    await plugin.run(ctx);
    logCommand(sender, command, "SUCCESS");
  } catch (err: any) {
    console.error(`❌ Error executing command [${command}]:`, err);
    logCommand(sender, command, "FAILED");
    logError(plugin.name, err?.message || String(err));
    await reply(`❌ Terjadi kesalahan saat memproses perintah *${prefix}${command}*.\n_Pesan error telah dicatat ke panel admin._`);
  }
}
