import { definePlugin } from "@nibolbot/shared";
import { searchYouTube, getVideoInfo, extractVideoId, formatDuration, type YouTubeResult } from "../lib/youtube";
import { isSpotifyUrl, resolveSpotifyTrack } from "../lib/spotify";
import { sendInteractiveMessage, buildPlayCard, fetchThumbnailBuffer } from "../lib/interactive";
import { createPlayerToken } from "../lib/player";
import { getPlayerUrl } from "../lib/config";

function withTimeout<T>(promise: Promise<T>, ms: number, stageName: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout ${ms}ms pada tahap [${stageName}]`));
      }, ms);
      if (typeof (timer as any).unref === "function") (timer as any).unref();
    })
  ]);
}

function logPlayError(stage: string, err: any) {
  console.error(`[PLAY-ERROR] stage=${stage}`);
  console.error(`[PLAY-ERROR] error=${err?.message || String(err)}`);
  console.error(`[PLAY-ERROR] stack=${err?.stack || "No stack trace"}`);
}

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
    console.log("[PLAY-01] command entered");

    let currentStage = "PLAY-01";
    try {
      let query = (fullText || args.join(" ")).trim();
      if (!query) {
        await reply("❌ Masukkan judul atau link YouTube.\nContoh: `.play https://youtu.be/dQw4w9WgXcQ` atau `.play Sheila On 7 Dan`");
        return;
      }

      console.log(`[PLAY-02] query parsed: ${query}`);
      currentStage = "PLAY-02";

      // Spotify resolution if applicable
      if (isSpotifyUrl(query)) {
        try {
          await withTimeout(reply("🟢 Mendeteksi link Spotify, mencari padanan di YouTube..."), 5000, "spotify-reply");
          const spotifyInfo = await withTimeout(resolveSpotifyTrack(query), 10000, "resolveSpotifyTrack");
          if (spotifyInfo) {
            query = spotifyInfo.searchQuery;
            console.log(`[PLAY-02] spotify resolved query: ${query}`);
          }
        } catch (spotifyErr: any) {
          logPlayError("spotifyResolution", spotifyErr);
        }
      }

      let song: YouTubeResult | null = null;
      const directVideoId = extractVideoId(query);

      if (directVideoId) {
        currentStage = "PLAY-03-direct";
        console.log(`[PLAY-03] before getVideoInfo: ${directVideoId}`);
        try {
          await withTimeout(reply("🔍 Mengambil info video..."), 5000, "status-reply-direct");
        } catch (repErr) {
          console.warn("[PLAY] status reply failed:", repErr);
        }

        try {
          song = await withTimeout(getVideoInfo(directVideoId), 12000, "getVideoInfo");
          console.log("[PLAY-04] after getVideoInfo");
        } catch (infoErr: any) {
          logPlayError("getVideoInfo", infoErr);
          await reply(`❌ Gagal mengambil metadata video.\nError: ${infoErr?.message || "Unknown error"}`);
          return;
        }

        if (!song) {
          await reply(`❌ Video dengan ID ${directVideoId} tidak ditemukan.`);
          return;
        }

        console.log(`[PLAY-05] search result count: 1 (direct ID)`);
      } else {
        currentStage = "PLAY-03";
        try {
          await withTimeout(reply("🔍 Mencari video..."), 5000, "status-reply-search");
        } catch (repErr) {
          console.warn("[PLAY] status reply failed:", repErr);
        }

        console.log("[PLAY-03] before searchYouTube");
        let results: YouTubeResult[] = [];
        try {
          results = await withTimeout(searchYouTube(query, 5), 12000, "searchYouTube");
          console.log("[PLAY-04] after searchYouTube");
        } catch (searchErr: any) {
          logPlayError("searchYouTube", searchErr);
          await reply(`❌ Gagal mencari video.\nError: ${searchErr?.message || "Unknown error"}`);
          return;
        }

        console.log(`[PLAY-05] search result count: ${results.length}`);

        if (results.length > 0) {
          song = results[0];
        }
      }

      if (!song) {
        console.log("[PLAY-06] no video found");
        await reply("❌ Video tidak ditemukan: " + query);
        return;
      }

      console.log(`[PLAY-06] selected video ID: ${song.id}`);
      console.log(`[PLAY-07] selected title: ${song.title}`);

      currentStage = "PLAY-08";
      console.log("[PLAY-08] before metadata processing");

      // Validasi durasi
      try {
        const config = db.query("SELECT config FROM feature_settings WHERE feature = 'play'").get() as { config: string } | null;
        const maxDur = config ? (JSON.parse(config.config).maxDuration || 60) : 60;
        if (song.duration > maxDur * 60) {
          await reply(`❌ Durasi ${formatDuration(song.duration)} melebihi batas maksimal ${maxDur} menit.`);
          return;
        }
      } catch (durErr: any) {
        console.warn("[PLAY] config check skipped:", durErr?.message);
      }

      // Generate player token
      let playerUrl = "";
      try {
        const token = createPlayerToken(song.id, song.title, song.channel, song.duration, song.thumbnail);
        playerUrl = getPlayerUrl(token);
      } catch (tokErr: any) {
        logPlayError("metadata-playerToken", tokErr);
        await reply(`❌ Gagal membuat token player.\nError: ${tokErr?.message || "Unknown error"}`);
        return;
      }

      console.log(`[PLAY-09] after metadata processing (playerUrl: ${playerUrl})`);

      currentStage = "PLAY-10";
      console.log("[PLAY-10] before thumbnail");
      let thumb: Buffer | null = null;
      try {
        thumb = await withTimeout(fetchThumbnailBuffer(song.thumbnail), 8000, "fetchThumbnailBuffer");
      } catch (thumbErr: any) {
        console.warn(`[PLAY-10] thumbnail fetch non-fatal timeout/error: ${thumbErr?.message}`);
      }
      console.log(`[PLAY-11] after thumbnail (${thumb ? thumb.length + " bytes" : "null"})`);

      currentStage = "PLAY-12";
      console.log("[PLAY-12] before buildPlayCard");
      let buttons: any[] = [];
      try {
        buttons = buildPlayCard(song, settings.botName, playerUrl);
      } catch (cardErr: any) {
        logPlayError("buildPlayCard", cardErr);
        await reply(`❌ Gagal membuat tombol interaktif.\nError: ${cardErr?.message || "Unknown error"}`);
        return;
      }
      console.log(`[PLAY-13] after buildPlayCard (${buttons.length} buttons)`);

      const contextInfo = settings.newsletterJid ? {
        forwardedNewsletterMessageInfo: {
          newsletterJid: settings.newsletterJid,
          newsletterName: settings.channelName || settings.botName,
          serverMessageId: -1
        },
        isForwarded: true
      } : {};

      currentStage = "PLAY-14";
      console.log("[PLAY-14] before sendInteractiveMessage");
      try {
        await withTimeout(
          sendInteractiveMessage(sock, {
            to: from,
            title: `🎬 ${song.title}`,
            body: `🏢 ${song.channel}\n⏱️ ${formatDuration(song.duration)}`,
            footer: `${settings.botName} • In-App Video Player`,
            thumbnail: thumb || undefined,
            buttons,
            contextInfo,
            useViewOnce: false
          }),
          15000,
          "sendInteractiveMessage"
        );
        console.log("[PLAY-15] after sendInteractiveMessage");
      } catch (sendErr: any) {
        logPlayError("sendInteractiveMessage", sendErr);
        try {
          await reply(
            `❌ Gagal mengirim kartu interaktif.\nError: ${sendErr?.message || "Unknown error"}\n\n` +
            `🎬 *${song.title}*\n🏢 ${song.channel}\n⏱️ ${formatDuration(song.duration)}\n\n` +
            `[▶️ Play Video: ${playerUrl}]`
          );
        } catch (repErr) {
          console.error("[PLAY] fallback reply failed:", repErr);
        }
        return;
      }

      console.log("[PLAY-16] DONE");
    } catch (unhandledErr: any) {
      logPlayError(`unhandled-${currentStage}`, unhandledErr);
      try {
        await reply(`❌ Terjadi error pada tahap [${currentStage}]: ${unhandledErr?.message || "Unknown error"}`);
      } catch {}
    }
  }
});
