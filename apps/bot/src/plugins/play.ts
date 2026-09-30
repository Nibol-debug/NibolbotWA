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

    console.log(`[PLAY] query received: "${query}"`);

    // Handle Spotify link if applicable
    if (isSpotifyUrl(query)) {
      try {
        await reply("🟢 Mendeteksi link Spotify, mencari padanan di YouTube...");
        const spotifyInfo = await resolveSpotifyTrack(query);
        if (spotifyInfo) {
          query = spotifyInfo.searchQuery;
          console.log(`[PLAY] resolved Spotify query: "${query}"`);
        }
      } catch (err: any) {
        console.error("[PLAY] Spotify resolve error:", err);
      }
    }

    let song: YouTubeResult | null = null;
    const directVideoId = extractVideoId(query);

    if (directVideoId) {
      console.log(`[PLAY] direct video ID: ${directVideoId}`);
      try {
        await reply("🔍 Mengambil info video...");
      } catch (err) {
        console.warn("[PLAY] failed to send info status reply:", err);
      }

      console.log(`[PLAY] fetching video metadata for ${directVideoId}...`);
      try {
        song = await getVideoInfo(directVideoId);
        if (!song) {
          await reply(`❌ Metadata video tidak ditemukan untuk ID: ${directVideoId}`);
          return;
        }
      } catch (err: any) {
        console.error("[PLAY] getVideoInfo failed:", err);
        await reply(`❌ Gagal mengambil metadata video.\nError: ${err?.message || "Unknown error"}`);
        return;
      }
    } else {
      try {
        await reply("🔍 Mencari video...");
      } catch (err) {
        console.warn("[PLAY] failed to send search status reply:", err);
      }

      console.log("[PLAY] searching YouTube...");
      let results: YouTubeResult[] = [];
      try {
        results = await searchYouTube(query, 5);
      } catch (err: any) {
        console.error("[PLAY] searchYouTube failed:", err);
        await reply(`❌ Gagal mencari video.\nError: ${err?.message || "Unknown error"}`);
        return;
      }

      console.log(`[PLAY] search result received (${results.length} found)`);

      if (results.length > 0) {
        song = results[0];
      }
    }

    if (!song) {
      console.log("[PLAY] no video found for query:", query);
      await reply("❌ Video tidak ditemukan: " + query);
      return;
    }

    console.log(`[PLAY] video ID: ${song.id}`);
    console.log(`[PLAY] title: ${song.title}`);
    console.log(`[PLAY] channel: ${song.channel}`);
    console.log(`[PLAY] duration: ${formatDuration(song.duration)} (${song.duration}s)`);

    // Check max duration
    try {
      const config = db.query("SELECT config FROM feature_settings WHERE feature = 'play'").get() as { config: string } | null;
      const maxDur = config ? (JSON.parse(config.config).maxDuration || 60) : 60;
      if (song.duration > maxDur * 60) {
        await reply(`❌ Durasi ${formatDuration(song.duration)} melebihi batas maksimal ${maxDur} menit.`);
        return;
      }
    } catch (err: any) {
      console.warn("[PLAY] duration check skipped due to config error:", err?.message);
    }

    // Buat token player (berlaku 15 menit)
    let playerUrl = "";
    try {
      const token = createPlayerToken(song.id, song.title, song.channel, song.duration, song.thumbnail);
      playerUrl = getPlayerUrl(token);
      console.log(`[PLAY] player URL: ${playerUrl}`);
    } catch (err: any) {
      console.error("[PLAY] createPlayerToken / getPlayerUrl failed:", err);
      await reply(`❌ Gagal membuat token player.\nError: ${err?.message || "Unknown error"}`);
      return;
    }

    console.log("[PLAY] building interactive card...");
    let buttons: any[] = [];
    try {
      buttons = buildPlayCard(song, settings.botName, playerUrl);
    } catch (err: any) {
      console.error("[PLAY] buildPlayCard failed:", err);
      await reply(`❌ Gagal membuat kartu player.\nError: ${err?.message || "Unknown error"}`);
      return;
    }

    const contextInfo = settings.newsletterJid ? {
      forwardedNewsletterMessageInfo: {
        newsletterJid: settings.newsletterJid,
        newsletterName: settings.channelName || settings.botName,
        serverMessageId: -1
      },
      isForwarded: true
    } : {};

    // Fetch thumbnail buffer non-blocking (opsional untuk kartu interaktif)
    let thumb: Buffer | null = null;
    try {
      thumb = await fetchThumbnailBuffer(song.thumbnail);
    } catch (err) {
      console.warn("[PLAY] fetchThumbnailBuffer failed (non-critical):", err);
    }

    console.log("[PLAY] sending interactive message...");
    try {
      await sendInteractiveMessage(sock, {
        to: from,
        title: `🎬 ${song.title}`,
        body: `🏢 ${song.channel}\n⏱️ ${formatDuration(song.duration)}`,
        footer: `${settings.botName} • In-App Video Player`,
        thumbnail: thumb || undefined,
        buttons,
        contextInfo,
        useViewOnce: false
      });
      console.log("[PLAY] interactive message sent");
    } catch (err: any) {
      console.error("[PLAY] sendInteractiveMessage failed:", err);
      try {
        await reply(`❌ Gagal mengirim pesan interaktif.\nError: ${err?.message || "Unknown error"}\n\n🎬 *${song.title}*\n🏢 ${song.channel}\n⏱️ ${formatDuration(song.duration)}\n\n[▶️ Play Video: ${playerUrl}]`);
      } catch (fallbackErr) {
        console.error("[PLAY] fallback reply failed:", fallbackErr);
      }
    }
  }
});
