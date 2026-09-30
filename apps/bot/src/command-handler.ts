import type { WASocket, proto } from "@whiskeysockets/baileys";
import { db, getBotSettings, isUserBlacklisted, isGroupBanned, logCommand, logError } from "./db";
import { getPluginForCommand, isFeatureEnabled, getFeatureConfig } from "./plugin-loader";
import type { PluginContext } from "@nibolbot/shared";

// In-memory cooldown tracker: key -> timestamp expiry in ms
const cooldowns = new Map<string, number>();

export function normalizePhoneNumber(phone: string): string {
  let clean = phone.replace(/[^0-9]/g, "");
  if (clean.startsWith("08")) {
    clean = "628" + clean.slice(2);
  } else if (clean.startsWith("0")) {
    clean = "62" + clean.slice(1);
  }
  return clean;
}

export function extractMessageContent(msg: proto.IMessage | null | undefined): any {
  if (!msg) return null;
  let content: any = msg;
  while (
    content?.ephemeralMessage?.message ||
    content?.viewOnceMessage?.message ||
    content?.viewOnceMessageV2?.message ||
    content?.documentWithCaptionMessage?.message ||
    content?.editedMessage?.message?.protocolMessage?.editedMessage
  ) {
    content =
      content.ephemeralMessage?.message ||
      content.viewOnceMessage?.message ||
      content.viewOnceMessageV2?.message ||
      content.documentWithCaptionMessage?.message ||
      content.editedMessage?.message?.protocolMessage?.editedMessage;
  }
  return content;
}

export function extractMessageText(messageContent: any): string {
  if (!messageContent) return "";
  const unwrapped = extractMessageContent(messageContent);
  if (!unwrapped) return "";

  if (unwrapped.conversation) return unwrapped.conversation;
  if (unwrapped.extendedTextMessage?.text) return unwrapped.extendedTextMessage.text;
  if (unwrapped.imageMessage?.caption) return unwrapped.imageMessage.caption;
  if (unwrapped.videoMessage?.caption) return unwrapped.videoMessage.caption;
  if (unwrapped.documentMessage?.caption) return unwrapped.documentMessage.caption;

  if (unwrapped.buttonsResponseMessage?.selectedButtonId) {
    return unwrapped.buttonsResponseMessage.selectedButtonId;
  }
  if (unwrapped.templateButtonReplyMessage?.selectedId) {
    return unwrapped.templateButtonReplyMessage.selectedId;
  }
  if (unwrapped.listResponseMessage?.singleSelectReply?.selectedRowId) {
    return unwrapped.listResponseMessage.singleSelectReply.selectedRowId;
  }
  if (unwrapped.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson) {
    try {
      const parsed = JSON.parse(unwrapped.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson);
      if (parsed?.id) return parsed.id;
    } catch {}
  }

  return "";
}

export function checkIsOwner(
  sender: string,
  msg: proto.IWebMessageInfo,
  sock: WASocket,
  owners: string[]
): boolean {
  if (msg.key.fromMe) return true;

  const botId = sock.user?.id?.split(":")[0]?.replace(/[^0-9]/g, "");
  const botLid = sock.user?.lid?.split(":")[0]?.replace(/[^0-9]/g, "");
  const cleanSenderRaw = sender.split("@")[0].split(":")[0].replace(/[^0-9]/g, "");
  const cleanSenderNormalized = normalizePhoneNumber(cleanSenderRaw);

  if (botId && (cleanSenderNormalized === normalizePhoneNumber(botId) || cleanSenderRaw === botId)) return true;
  if (botLid && cleanSenderRaw === botLid) return true;

  return owners.some(owner => {
    const rawOwner = owner.split("@")[0].split(":")[0].replace(/[^0-9]/g, "");
    if (!rawOwner) return false;
    const normOwner = normalizePhoneNumber(rawOwner);
    return cleanSenderNormalized === normOwner || cleanSenderRaw === rawOwner;
  });
}

export async function handleIncomingMessage(sock: WASocket, msg: proto.IWebMessageInfo): Promise<void> {
  if (!msg.message) return;

  const from = msg.key.remoteJid;
  if (!from || from === "status@broadcast") return;

  const isGroup = from.endsWith("@g.us");
  const sender = isGroup ? (msg.key.participant || msg.participant || from) : from;

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

  // Extract text from unwrapped message
  const rawText = extractMessageText(msg.message);
  let cleanText = rawText.trim();
  if (!cleanText) return;

  const settings = getBotSettings();
  const prefix = settings.prefix || ".";

  // Prevent bot responding to its own non-command messages
  if (msg.key.fromMe && !cleanText.startsWith(prefix)) {
    return;
  }

  // Support bot mention prefix in groups (e.g. "@bot .ping")
  const botNumber = sock.user?.id ? sock.user.id.split(":")[0].replace(/[^0-9]/g, "") : "";
  if (isGroup && botNumber && cleanText.startsWith(`@${botNumber}`)) {
    cleanText = cleanText.slice(`@${botNumber}`.length).trim();
  }

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
  const isOwner = checkIsOwner(sender, msg, sock, settings.owners);
  if (settings.mode === "owner" && !isOwner) {
    logCommand(sender, command, "BLOCKED");
    await sock.sendMessage(from, { text: "🔒 Bot sedang dalam mode khusus Owner." }, { quoted: msg });
    return;
  }

  // 3b. Private Message (PM) Check
  if (!isGroup && settings.allowPm === false && !isOwner) {
    logCommand(sender, command, "BLOCKED");
    await sock.sendMessage(
      from,
      { text: "⚠️ *Akses Ditolak*\n\nBot ini disetel khusus untuk digunakan di dalam **Grup WhatsApp**.\nSilakan masukkan bot ke grup kamu untuk menggunakan perintah." },
      { quoted: msg }
    );
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

    // Header channel B9: only if newsletterJid is valid and not dummy placeholder
    const isValidNewsletter =
      settings.newsletterJid &&
      settings.newsletterJid.endsWith("@newsletter") &&
      settings.newsletterJid !== "120363023456789@newsletter";

    if (isValidNewsletter && !payload.contextInfo?.forwardingScore) {
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

    try {
      return await sock.sendMessage(from, payload, { quoted: msg });
    } catch {
      // Fallback: send without quoted message if quote context fails in group
      return await sock.sendMessage(from, payload);
    }
  };

  const ctx: PluginContext = {
    sock,
    msg,
    from,
    sender,
    isGroup,
    isOwner,
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
