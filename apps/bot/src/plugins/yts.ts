import { definePlugin } from "@nibolbot/shared";
import { searchYouTube, formatDuration } from "../lib/youtube";
import { buildSearchCarousel, sendCarouselMessage } from "../lib/interactive";
import { createPlayerToken } from "../lib/player";

export default definePlugin({
  name: "search",
  category: "music",
  description: "Cari video/lagu YouTube dengan tampilan carousel",
  commands: ["search", "yts"],
  defaults: {
    enabled: true,
    cooldown: 10,
    limitPerDay: 25
  },
  async run({ sock, msg, from, args, reply, fullText, settings }) {
    const query = fullText || args.join(" ");
    if (!query) {
      await reply("❌ Masukkan kata kunci pencarian. Contoh: `.yts Denny Caknan`");
      return;
    }

    await reply("🔍 Mencari daftar lagu...");

    const results = await searchYouTube(query, 5);
    if (!results.length) {
      await reply(`❌ Tidak ditemukan hasil untuk: ${query}`);
      return;
    }

    const apiBase = process.env.API_URL || "http://localhost:3000";

    // Build cards with web player links
    const cards = results.map((song) => {
      const token = createPlayerToken(song.id, song.title, song.channel, song.duration, song.thumbnail);
      const webUrl = `${apiBase}/p/${token}`;

      return {
        header: { title: song.title },
        body: { text: `👤 ${song.channel}\n⏱️ ${formatDuration(song.duration)}` },
        footer: { text: settings.botName },
        nativeFlowMessage: {
          buttons: [
            {
              name: "cta_url",
              buttonParamsJson: JSON.stringify({
                display_text: "🎧 Putar di Web",
                url: webUrl,
                merchant_url: webUrl
              })
            },
            {
              name: "quick_reply",
              buttonParamsJson: JSON.stringify({
                display_text: "🎵 Download MP3",
                id: `.ytmp3 https://youtu.be/${song.id}`
              })
            },
            {
              name: "cta_copy",
              buttonParamsJson: JSON.stringify({
                display_text: "📋 Salin Link",
                copy_code: `https://youtu.be/${song.id}`
              })
            }
          ]
        }
      };
    });

    const contextInfo = settings.newsletterJid ? {
      forwardedNewsletterMessageInfo: {
        newsletterJid: settings.newsletterJid,
        newsletterName: settings.channelName || settings.botName,
        serverMessageId: -1
      },
      isForwarded: true
    } : {};

    // Send carousel (renders on Mobile)
    try {
      await sendCarouselMessage(
        sock,
        from,
        cards,
        `🔎 Hasil pencarian: *${query}*`,
        `${settings.botName} • Geser kartu di HP untuk melihat hasil`,
        contextInfo
      );
    } catch {}

    // Companion text list (accessible on WhatsApp Web / Desktop)
    let text = `🔎 *Hasil Pencarian:* "${query}"\n\n`;
    results.forEach((s, idx) => {
      text += `*${idx + 1}. ${s.title}*\n`;
      text += `   👤 ${s.channel} | ⏱️ ${formatDuration(s.duration)}\n`;
      text += `   ▶️ .play https://youtu.be/${s.id}\n\n`;
    });
    text += `_Buka di HP untuk tampilan Carousel interaktif._`;
    await reply(text);
  }
});
