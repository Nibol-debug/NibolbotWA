import { definePlugin } from "@nibolbot/shared";
import { searchYouTube, getVideoInfo, extractVideoId, formatDuration, type YouTubeResult } from "../lib/youtube";
import { isSpotifyUrl, resolveSpotifyTrack } from "../lib/spotify";
import { sendInteractiveMessage, buildPlayCard, fetchThumbnailBuffer } from "../lib/interactive";
import { createPlayerToken } from "../lib/player";
import { getPlayerUrl } from "../lib/config";

export default definePlugin({
  name: "play",
  category: "music",
  description: "Cari video/lagu dan tonton via In-App WebView WhatsApp / HTML5 Player",
  commands: ["play", "p"],
  defaults: {
    enabled: true,
    cooldown: 5,
    limitPerDay: 50,
    maxDuration: 60
  },
  async run({ sock, msg, from, args, reply, fullText, db, settings }) {
    let query = (fullText || args.join(" ")).trim();
    if (!query) {
      await reply("❌ Masukkan judul atau link YouTube.\nContoh: `.play https://youtu.be/dQw4w9WgXcQ` atau `.play Sheila On 7 Dan`");
      return;
    }

    if (isSpotifyUrl(query)) {
      await reply("🟢 Mendeteksi link Spotify, mencari padanan di YouTube...");
      const spotifyInfo = await resolveSpotifyTrack(query);
      if (spotifyInfo) {
        query = spotifyInfo.searchQuery;
      }
    }

    let song: YouTubeResult | null = null;
    const directVideoId = extractVideoId(query);

    if (directVideoId) {
      await reply("🔍 Mengambil info video...");
      song = await getVideoInfo(directVideoId);
    } else {
      await reply("🔍 Mencari video...");
      const results = await searchYouTube(query, 5);
      if (results.length > 0) {
        song = results[0];
      }
    }

    if (!song) {
      await reply("❌ Video tidak ditemukan: " + query);
      return;
    }

    const config = db.query("SELECT config FROM feature_settings WHERE feature = 'play'").get() as { config: string } | null;
    const maxDur = config ? (JSON.parse(config.config).maxDuration || 60) : 60;
    if (song.duration > maxDur * 60) {
      await reply(`❌ Durasi ${formatDuration(song.duration)} melebihi batas maksimal ${maxDur} menit.`);
      return;
    }

    // Buat token player (berlaku 15 menit)
    const token = createPlayerToken(song.id, song.title, song.channel, song.duration, song.thumbnail);
    const playerUrl = getPlayerUrl(token);

    const contextInfo = settings.newsletterJid ? {
      forwardedNewsletterMessageInfo: {
        newsletterJid: settings.newsletterJid,
        newsletterName: settings.channelName || settings.botName,
        serverMessageId: -1
      },
      isForwarded: true
    } : {};

    // Kirim pesan interaktif WhatsApp dengan tombol "▶️ Play Video"
    // WhatsApp Android & iOS membuka URL ini langsung di In-App WebView modal tanpa keluar aplikasi
    const thumb = await fetchThumbnailBuffer(song.thumbnail);
    try {
      await sendInteractiveMessage(sock, {
        to: from,
        title: `🎬 ${song.title}`,
        body: `🏢 ${song.channel}\n⏱️ ${formatDuration(song.duration)}`,
        footer: `${settings.botName} • In-App Video Player`,
        thumbnail: thumb || undefined,
        buttons: buildPlayCard(song, settings.botName, playerUrl),
        contextInfo
      });
    } catch (err) {
      console.error("Gagal mengirim kartu interaktif:", err);
      // Fallback HANYA jika relay pesan interaktif gagal
      await reply(`🎬 *${song.title}*\n🏢 ${song.channel}\n⏱️ ${formatDuration(song.duration)}\n\n[▶️ Play Video: ${playerUrl}]`);
    }
  }
});
