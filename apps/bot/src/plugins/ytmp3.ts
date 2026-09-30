import { definePlugin } from "@nibolbot/shared";
import { getVideoInfo, formatDuration, isYouTubeUrl } from "../lib/youtube";
import { downloadAudio, checkYtDlp } from "../lib/downloader";
import { enqueue } from "../lib/queue";
import { getCacheDir, isCacheFull } from "../lib/cache";
import { sendInteractiveMessage, fetchThumbnailBuffer } from "../lib/interactive";
import { createPlayerToken } from "../lib/player";
import { getPlayerUrl } from "../lib/config";
import { readFileSync } from "node:fs";

export default definePlugin({
  name: "ytmp3",
  category: "downloader",
  description: "Download audio dari link YouTube",
  commands: ["ytmp3"],
  defaults: {
    enabled: true,
    cooldown: 15,
    limitPerDay: 15,
    maxDuration: 10
  },
  async run({ sock, msg, from, args, reply, db, settings }) {
    const url = args[0];
    if (!url || !isYouTubeUrl(url)) {
      await reply("❌ Kirim link YouTube. Contoh: `.ytmp3 https://youtu.be/xxx`");
      return;
    }

    const info = await getVideoInfo(url);
    if (!info) {
      await reply("❌ Gagal mengambil info video.");
      return;
    }

    const config = db.query("SELECT config FROM feature_settings WHERE feature = 'ytmp3'").get() as { config: string } | null;
    const maxDur = config ? (JSON.parse(config.config).maxDuration || 10) : 10;
    if (info.duration > maxDur * 60) {
      await reply(`❌ Durasi ${formatDuration(info.duration)} melebihi batas ${maxDur} menit.`);
      return;
    }

    if (isCacheFull(300)) {
      await reply("❌ Cache penuh.");
      return;
    }

    const hasYtDlp = await checkYtDlp();
    if (!hasYtDlp) {
      await reply(`🎵 *${info.title}* (${formatDuration(info.duration)})\n⚠️ yt-dlp belum terinstall.`);
      return;
    }

    // Create web player token
    const token = createPlayerToken(info.id, info.title, info.channel, info.duration, info.thumbnail);
    const webPlayerUrl = getPlayerUrl(token);

    const contextInfo = settings.newsletterJid ? {
      forwardedNewsletterMessageInfo: {
        newsletterJid: settings.newsletterJid,
        newsletterName: settings.channelName || settings.botName,
        serverMessageId: -1
      },
      isForwarded: true
    } : {};

    const thumb = await fetchThumbnailBuffer(info.thumbnail);
    try {
      await sendInteractiveMessage(sock, {
        to: from,
        title: info.title,
        body: `👤 ${info.channel}\n⏱️ ${formatDuration(info.duration)}\n\n⬇️ Mendownload audio...`,
        footer: settings.botName,
        thumbnail: thumb || undefined,
        buttons: [
          {
            name: "cta_url",
            buttonParamsJson: JSON.stringify({
              display_text: "🎧 Putar di Web",
              url: webPlayerUrl,
              merchant_url: webPlayerUrl
            })
          },
          {
            name: "cta_copy",
            buttonParamsJson: JSON.stringify({
              display_text: "📋 Salin Link",
              copy_code: `https://youtu.be/${info.id}`
            })
          }
        ],
        contextInfo
      });
    } catch {
      await reply(`⬇️ Downloading *${info.title}* (${formatDuration(info.duration)})...\n🎧 Web Player: ${webPlayerUrl}`);
    }

    try {
      const result = await enqueue(() => downloadAudio(info.id, getCacheDir()));
      const audioBuffer = readFileSync(result.filePath);

      await sock.sendMessage(from, {
        audio: audioBuffer,
        mimetype: "audio/mpeg",
        ptt: false,
        fileName: `${info.title}.mp3`
      } as any, { quoted: msg });
    } catch (err: any) {
      await reply(`❌ Gagal download: ${err.message?.slice(0, 100) || "Unknown error"}`);
    }
  }
});
