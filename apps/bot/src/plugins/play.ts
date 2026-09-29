import { definePlugin } from "@nibolbot/shared";
import { searchYouTube, formatDuration } from "../lib/youtube";
import { isSpotifyUrl, resolveSpotifyTrack } from "../lib/spotify";
import { sendInteractiveMessage, buildPlayCard, fetchThumbnailBuffer } from "../lib/interactive";
import { createPlayerToken } from "../lib/player";

export default definePlugin({
  name: "play",
  category: "music",
  description: "Cari dan putar musik dari YouTube via Web Player",
  commands: ["play", "p"],
  defaults: {
    enabled: true,
    cooldown: 10,
    limitPerDay: 20,
    maxDuration: 10
  },
  async run({ sock, msg, from, args, reply, fullText, db, settings }) {
    let query = fullText || args.join(" ");
    if (!query) {
      await reply("❌ Tulis judul lagu atau link Spotify. Contoh: `.play Sheila On 7 Dan`");
      return;
    }

    // Resolve Spotify link if given
    if (isSpotifyUrl(query)) {
      await reply("🟢 Mendeteksi link Spotify, mencari padanan di YouTube...");
      const spotifyInfo = await resolveSpotifyTrack(query);
      if (spotifyInfo) {
        query = spotifyInfo.searchQuery;
      } else {
        await reply("⚠️ Gagal mengekstrak metadata Spotify, mencoba pencarian langsung...");
      }
    }

    await reply("🔍 Mencari...");

    const results = await searchYouTube(query, 5);
    if (!results.length) {
      await reply("❌ Tidak ditemukan hasil untuk: " + query);
      return;
    }

    const song = results[0];

    const config = db.query("SELECT config FROM feature_settings WHERE feature = 'play'").get() as { config: string } | null;
    const maxDur = config ? (JSON.parse(config.config).maxDuration || 10) : 10;
    if (song.duration > maxDur * 60) {
      await reply(`❌ Durasi ${formatDuration(song.duration)} melebihi batas ${maxDur} menit.`);
      return;
    }

    // Create web player token (15 min expiry)
    const token = createPlayerToken(song.id, song.title, song.channel, song.duration, song.thumbnail);
    const apiBase = process.env.API_URL || "http://localhost:3000";
    const webPlayerUrl = `${apiBase}/p/${token}`;

    // newsletter header
    const contextInfo = settings.newsletterJid ? {
      forwardedNewsletterMessageInfo: {
        newsletterJid: settings.newsletterJid,
        newsletterName: settings.channelName || settings.botName,
        serverMessageId: -1
      },
      isForwarded: true
    } : {};

    // send interactive card with web player button (renders on Mobile)
    const thumb = await fetchThumbnailBuffer(song.thumbnail);
    try {
      await sendInteractiveMessage(sock, {
        to: from,
        title: song.title,
        body: `👤 ${song.channel}\n⏱️ ${formatDuration(song.duration)}`,
        footer: `${settings.botName} • Klik tombol untuk putar`,
        thumbnail: thumb || undefined,
        buttons: buildPlayCard(song, settings.botName, webPlayerUrl),
        contextInfo
      });
    } catch {}

    // Companion text (accessible on WhatsApp Web / Desktop)
    await reply(
      `🎵 *${song.title}*\n` +
      `👤 ${song.channel}\n` +
      `⏱️ ${formatDuration(song.duration)}\n\n` +
      `🎧 *Putar di Web:*\n${webPlayerUrl}\n\n` +
      `_Download:_ \`.ytmp3 ${song.id}\` | \`.ytmp4 ${song.id}\``
    );
  }
});
