import type { WASocket, proto } from "@whiskeysockets/baileys";
import { db, getBotSettings, isUserBlacklisted, isGroupBanned, logCommand, logError } from "./db";
import { getPluginForCommand, isFeatureEnabled, getFeatureConfig } from "./plugin-loader";
import { storeMessage } from "./lib/message-store";
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

  // Unwrap nested wrappers (ephemeral, viewOnce, etc.)
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

  const authMe = (sock as any).authState?.creds?.me;
  const botId = (authMe?.id || sock.user?.id || "").split(":")[0].replace(/[^0-9]/g, "");
  const botLid = (authMe?.lid || (sock.user as any)?.lid || "").split(":")[0].replace(/[^0-9]/g, "");
  const cleanSenderRaw = sender.split("@")[0].split(":")[0].replace(/[^0-9]/g, "");
  const cleanSenderNormalized = normalizePhoneNumber(cleanSenderRaw);

  // Cek sender = nomor bot (via phone number)
  if (botId && (cleanSenderNormalized === normalizePhoneNumber(botId) || cleanSenderRaw === botId)) return true;
  // Cek sender = LID bot (multi-device: HP mengirim, Web session menerima dgn fromMe=false)
  if (botLid && cleanSenderRaw === botLid) return true;

  // Jika sender berformat LID, coba resolve ke nomor telepon dari participant field
  const isLidSender = sender.includes("@lid");
  let phoneFromSender = "";

  if (isLidSender) {
    // participant kadang masih berisi nomor telepon asli meski sender = LID
    const participant = msg.key.participant || (msg as any).participant;
    if (participant && !participant.includes("@lid")) {
      phoneFromSender = participant.split("@")[0].split(":")[0].replace(/[^0-9]/g, "");
    }
  }

  // Kumpulkan semua candidate number untuk dicocokkan dengan daftar owner
  const candidates = [cleanSenderNormalized, cleanSenderRaw];
  if (phoneFromSender) {
    candidates.push(phoneFromSender, normalizePhoneNumber(phoneFromSender));
  }

  return owners.some(owner => {
    const rawOwner = owner.split("@")[0].split(":")[0].replace(/[^0-9]/g, "");
    if (!rawOwner) return false;
    const normOwner = normalizePhoneNumber(rawOwner);
    return candidates.some(c => c === normOwner || c === rawOwner);
  });
}

function getBotJids(sock: WASocket) {
  const authMe = (sock as any).authState?.creds?.me;
  const botNumber = (authMe?.id || sock.user?.id || "").split(":")[0].replace(/[^0-9]/g, "");
  const botLid = (authMe?.lid || (sock.user as any)?.lid || "").split(":")[0].replace(/[^0-9]/g, "");
  return { botNumber, botLid };
}

export async function handleIncomingMessage(sock: WASocket, msg: proto.IWebMessageInfo): Promise<void> {
  if (!msg.message) return;

  const from = msg.key.remoteJid;
  if (!from || from === "status@broadcast") return;

  const isGroup = from.endsWith("@g.us");
  const sender = isGroup ? (msg.key.participant || (msg as any).participant || from) : from;

  // === DIAGNOSA GRUP ===
  if (isGroup) {
    const msgKeys = msg.message ? Object.keys(msg.message) : [];
    console.log(`[GROUP] ← pesan masuk | from=${from} sender=${sender} keys=${msgKeys.join(",")}`);
  }

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

  if (isGroup) {
    console.log(`[GROUP]   rawText="${rawText.slice(0, 80)}" cleanText="${cleanText.slice(0, 80)}"`);
  }

  if (!cleanText) {
    if (isGroup) console.log(`[GROUP]   ✗ SKIP: teks kosong (bukan pesan teks)`);
    return;
  }

  const settings = getBotSettings();
  const prefix = settings.prefix || ".";

  // Prevent bot responding to its own non-command messages
  if (msg.key.fromMe && !cleanText.startsWith(prefix)) {
    if (isGroup) console.log(`[GROUP]   ✗ SKIP: fromMe tanpa prefix`);
    return;
  }

  // === GRUP: strip mention bot dari awal pesan ===
  const { botNumber, botLid } = getBotJids(sock);

  if (isGroup) {
    // Ambil mentionedJid dari contextInfo untuk deteksi tag bot
    const unwrapped = extractMessageContent(msg.message);
    const mentionedJid: string[] = unwrapped?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    const botJidFull = (sock as any).authState?.creds?.me?.id || sock.user?.id || "";
    const isBotMentioned =
      mentionedJid.some(j => j === botJidFull) ||
      (botNumber && mentionedJid.some(j => j.includes(botNumber))) ||
      (botLid && mentionedJid.some(j => j.includes(botLid)));

    // Strip @botNumber atau @botLid dari awal teks
    if (botNumber && cleanText.startsWith(`@${botNumber}`)) {
      cleanText = cleanText.slice(`@${botNumber}`.length).trim();
    } else if (botLid && cleanText.startsWith(`@${botLid}`)) {
      cleanText = cleanText.slice(`@${botLid}`.length).trim();
    } else if (isBotMentioned && cleanText.startsWith("@")) {
      // WhatsApp sering kirim @DisplayName bukan @nomor di teks, tapi mentionedJid berisi JID asli
      cleanText = cleanText.replace(/^@\S+\s*/, "").trim();
    }

    if (cleanText !== rawText.trim()) {
      console.log(`[GROUP]   mention stripped → cleanText="${cleanText.slice(0, 80)}"`);
    }
  }

  // If text does not start with prefix:
  // Match against registered plugin commands (e.g. "ping", "help", "owner")
  if (!cleanText.startsWith(prefix)) {
    const firstWord = cleanText.split(/\s+/)[0]?.toLowerCase();
    if (firstWord && getPluginForCommand(firstWord)) {
      cleanText = prefix + cleanText;
    } else {
      if (isGroup) console.log(`[GROUP]   ✗ SKIP: tidak ada prefix "${prefix}" dan "${cleanText.split(/\s+/)[0]}" bukan command`);
      return;
    }
  }

  // Extract command name and args
  const bodyWithoutPrefix = cleanText.slice(prefix.length).trim();
  const [cmdRaw, ...args] = bodyWithoutPrefix.split(/\s+/);
  if (!cmdRaw) return;

  const command = cmdRaw.toLowerCase();
  const plugin = getPluginForCommand(command);
  if (!plugin) {
    if (isGroup) console.log(`[GROUP]   ✗ SKIP: command "${command}" tidak ditemukan di plugin registry`);
    return;
  }

  if (isGroup) console.log(`[GROUP]   ✓ command="${command}" plugin="${plugin.name}" sender="${sender}"`);

  // 1. Group Ban Check (PRD P5)
  if (isGroup && isGroupBanned(from)) {
    console.log(`[GROUP]   ✗ BLOCKED: grup ${from} di-ban di database`);
    logCommand(sender, command, "BLOCKED");
    return;
  }

  // 2. User Blacklist Check (PRD P6)
  if (isUserBlacklisted(sender)) {
    if (isGroup) console.log(`[GROUP]   ✗ BLOCKED: sender ${sender} di-blacklist`);
    logCommand(sender, command, "BLOCKED");
    return;
  }

  // 3. Bot Mode Check (PRD P3: 'public' vs 'owner')
  const isOwner = checkIsOwner(sender, msg, sock, settings.owners);
  if (settings.mode === "owner" && !isOwner) {
    if (isGroup) console.log(`[GROUP]   ✗ BLOCKED: mode=owner, sender bukan owner`);
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
    if (isGroup) console.log(`[GROUP]   ✗ BLOCKED: fitur "${plugin.name}" dinonaktifkan`);
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

  if (isGroup) console.log(`[GROUP]   → EXECUTING plugin "${plugin.name}"...`);

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

    if (isGroup) {
      try {
        await (sock as any).authState?.keys?.set?.({ "sender-key-memory": { [from]: null } });
      } catch {}
    }

    try {
      const res = await sock.sendMessage(from, payload, { quoted: msg });
      if (res?.key?.id && res.message) {
        storeMessage(res.key.id, res.message);
      }
      return res;
    } catch (sendErr) {
      // Fallback: send without quoted message if quote context fails in group
      if (isGroup) console.log(`[GROUP]   ⚠ reply quoted gagal, fallback tanpa quote:`, (sendErr as any)?.message);
      try {
        const res = await sock.sendMessage(from, payload);
        if (res?.key?.id && res.message) {
          storeMessage(res.key.id, res.message);
        }
        return res;
      } catch (fallbackErr) {
        if (isGroup) console.error(`[GROUP]   ✗ reply fallback juga gagal:`, (fallbackErr as any)?.message);
        throw fallbackErr;
      }
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
    if (isGroup) console.log(`[GROUP]   ✓ SUCCESS command="${command}"`);
  } catch (err: any) {
    console.error(`❌ Error executing command [${command}]:`, err);
    logCommand(sender, command, "FAILED");
    logError(plugin.name, err?.message || String(err));
    await reply(`❌ Terjadi kesalahan saat memproses perintah *${prefix}${command}*.\n_Pesan error telah dicatat ke panel admin._`);
  }
}
