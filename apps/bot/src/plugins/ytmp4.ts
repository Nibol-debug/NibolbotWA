import { definePlugin } from "@nibolbot/shared";
import { getVideoInfo, formatDuration, isYouTubeUrl } from "../lib/youtube";
import { downloadVideo, checkYtDlp } from "../lib/downloader";
import { enqueue } from "../lib/queue";
import { getCacheDir, isCacheFull } from "../lib/cache";
import { sendInteractiveMessage, fetchThumbnailBuffer } from "../lib/interactive";
import { createPlayerToken } from "../lib/player";
import { readFileSync } from "node:fs";

export default definePlugin({
  name: "ytmp4",
  category: "downloader",
  description: "Download video dari link YouTube",
  commands: ["ytmp4"],
  defaults: {
    enabled: true,
    cooldown: 15,
    limitPerDay: 10,
    maxDuration: 10
  },
  async run({ sock, msg, from, args, reply, db, settings }) {
    const url = args[0];
    if (!url || !isYouTubeUrl(url)) {
      await reply("❌ Kirim link YouTube. Contoh: `.ytmp4 https://youtu.be/xxx`");
      return;
    }

    const info = await getVideoInfo(url);
    if (!info) {
      await reply("❌ Gagal mengambil info video.");
      return;
    }

    const config = db.query("SELECT config FROM feature_settings WHERE feature = 'ytmp4'").get() as { config: string } | null;
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
      await reply(`🎬 *${info.title}* (${formatDuration(info.duration)})\n⚠️ yt-dlp belum terinstall.`);
      return;
    }

    // Create web player token for audio preview
    const token = createPlayerToken(info.id, info.title, info.channel, info.duration, info.thumbnail);
    const apiBase = process.env.API_URL || "http://localhost:3000";
    const webPlayerUrl = `${apiBase}/p/${token}`;

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
        body: `👤 ${info.channel}\n⏱️ ${formatDuration(info.duration)}\n\n⬇️ Mendownload video (480p)...`,
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
      await reply(`⬇️ Downloading video *${info.title}* (${formatDuration(info.duration)})...\n🎧 Web Player: ${webPlayerUrl}`);
    }

    try {
      const result = await enqueue(() => downloadVideo(info.id, getCacheDir()));
      const videoBuffer = readFileSync(result.filePath);

      await sock.sendMessage(from, {
        video: videoBuffer,
        mimetype: "video/mp4",
        fileName: `${info.title}.mp4`,
        caption: `🎬 *${info.title}*\n👤 ${info.channel}\n⏱️ ${formatDuration(info.duration)}`
      } as any, { quoted: msg });
    } catch (err: any) {
      await reply(`❌ Gagal download: ${err.message?.slice(0, 100) || "Unknown error"}`);
    }
  }
});
