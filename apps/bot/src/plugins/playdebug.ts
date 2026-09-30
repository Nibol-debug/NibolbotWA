import { definePlugin } from "@nibolbot/shared";
import { searchYouTube, formatDuration } from "../lib/youtube";
import { sendInteractiveMessage, buildPlayCard, fetchThumbnailBuffer } from "../lib/interactive";
import { getPlayerUrl } from "../lib/config";
import { createPlayerToken } from "../lib/player";
import { proto, generateWAMessageFromContent } from "@whiskeysockets/baileys";

export default definePlugin({
  name: "playdebug",
  category: "utility",
  description: "Debug execution flow untuk command play (playdebug, playdebug2, playdebug3)",
  commands: ["playdebug", "pd", "playdebug2", "pd2", "playdebug3", "pd3"],
  defaults: {
    enabled: true,
    cooldown: 0,
    limitPerDay: 100,
    maxDuration: 60
  },
  async run({ sock, msg, from, args, reply, fullText, command, settings }) {
    const cmd = command.toLowerCase();

    // ==========================================
    // TEST 1: .playdebug <query>
    // Search YouTube only, NO interactive card
    // ==========================================
    if (cmd === "playdebug" || cmd === "pd") {
      const query = (fullText || args.join(" ")).trim();
      if (!query) {
        await reply("❌ Masukkan query. Contoh: `.playdebug love story`");
        return;
      }

      console.log(`\n[PLAYDEBUG] Stage: start search query="${query}"`);
      await reply("🔎 PLAY DEBUG: Memulai pencarian YouTube...");

      try {
        const t0 = Date.now();
        const results = await searchYouTube(query, 5);
        const elapsed = Date.now() - t0;
        console.log(`[PLAYDEBUG] Stage: search finished in ${elapsed}ms, results count: ${results.length}`);

        let out = `🔎 *PLAY DEBUG*\n\n`;
        out += `Query: ${query}\n`;
        out += `Search: OK (${elapsed}ms)\n`;
        out += `Results: ${results.length}\n\n`;

        results.forEach((item, i) => {
          console.log(`[PLAYDEBUG] Result #${i + 1}: ${item.title} (ID: ${item.id})`);
          out += `${i + 1}. *Title:* ${item.title}\n`;
          out += `   *ID:* ${item.id}\n`;
          out += `   *Channel:* ${item.channel}\n`;
          out += `   *Duration:* ${formatDuration(item.duration)} (${item.duration}s)\n`;
          out += `   *URL:* https://youtu.be/${item.id}\n\n`;
        });

        await reply(out.trim());
        console.log(`[PLAYDEBUG] Stage: reply sent to WhatsApp`);
      } catch (err: any) {
        console.error(`[PLAYDEBUG-ERROR] search failed:`, err);
        await reply(`❌ *SEARCH FAILED*\nError: ${err?.message || String(err)}`);
      }
      return;
    }

    // ==========================================
    // TEST 2: .playdebug2
    // Hardcoded ID -> buildPlayCard -> sendInteractiveMessage (with thumbnail)
    // ==========================================
    if (cmd === "playdebug2" || cmd === "pd2") {
      const VIDEO_ID = "i0p1bm";
      console.log(`\n[PLAYDEBUG2] Stage: start with hardcoded ID=${VIDEO_ID}`);
      await reply(`🔎 *PLAYDEBUG2*\nTesting interactive message with hardcoded ID: ${VIDEO_ID}...`);

      try {
        const mockSong = {
          id: VIDEO_ID,
          title: "TWICE What is Love Test",
          channel: "JYP Entertainment",
          duration: 224,
          thumbnail: "https://i.ytimg.com/vi/i0p1bmr0EmE/hqdefault.jpg"
        };

        const token = createPlayerToken(mockSong.id, mockSong.title, mockSong.channel, mockSong.duration, mockSong.thumbnail);
        const playerUrl = getPlayerUrl(token);
        console.log(`[PLAYDEBUG2] Stage: playerUrl generated: ${playerUrl}`);

        const buttons = buildPlayCard(mockSong, settings.botName, playerUrl);
        console.log(`[PLAYDEBUG2] Stage: buildPlayCard finished, buttons: ${buttons.length}`);

        console.log(`[PLAYDEBUG2] Stage: fetching thumbnail...`);
        const thumb = await fetchThumbnailBuffer(mockSong.thumbnail);
        console.log(`[PLAYDEBUG2] Stage: thumbnail buffer: ${thumb ? thumb.length + " bytes" : "null"}`);

        console.log(`[PLAYDEBUG2] Stage: sending interactive message...`);
        await sendInteractiveMessage(sock, {
          to: from,
          title: `🎬 ${mockSong.title}`,
          body: `🏢 ${mockSong.channel}\n⏱️ ${formatDuration(mockSong.duration)}`,
          footer: `${settings.botName} • In-App Video Player`,
          thumbnail: thumb || undefined,
          buttons,
          useViewOnce: false
        });

        console.log(`[PLAYDEBUG2] Stage: interactive message sent successfully!`);
        await reply(`✅ *PLAYDEBUG2 SUCCESS*\nPesan interaktif dengan thumbnail berhasil terkirim!`);
      } catch (err: any) {
        console.error(`[PLAYDEBUG2-ERROR] failed:`, err);
        await reply(`❌ *PLAYDEBUG2 FAILED*\nStage: sendInteractiveMessage\nError: ${err?.message || String(err)}`);
      }
      return;
    }

    // ==========================================
    // TEST 3: .playdebug3
    // Minimal interactive card WITHOUT thumbnail / prepareWAMessageMedia / yt-dlp
    // ==========================================
    if (cmd === "playdebug3" || cmd === "pd3") {
      const VIDEO_ID = "i0p1bm";
      const targetUrl = "https://nibolbot.my.id/p/i0p1bm";
      console.log(`\n[PLAYDEBUG3] Stage: start minimal card ID=${VIDEO_ID}, URL=${targetUrl}`);

      try {
        const interactiveMsg: proto.Message.IInteractiveMessage = {
          header: {
            title: "🎬 Test Player",
            hasMediaAttachment: false
          },
          body: {
            text: "HTML Player Test"
          },
          footer: {
            text: `${settings.botName} • Direct URL Test`
          },
          nativeFlowMessage: {
            buttons: [
              {
                name: "cta_url",
                buttonParamsJson: JSON.stringify({
                  display_text: "▶️ Play Video",
                  url: targetUrl,
                  merchant_url: targetUrl,
                  webview_presentation: "FULL"
                })
              }
            ],
            messageParamsJson: ""
          }
        };

        const fullMsg = generateWAMessageFromContent(from, { interactiveMessage: interactiveMsg }, {});

        console.log(`[PLAYDEBUG3] Stage: relaying minimal interactive message...`);
        await sock.relayMessage(from, fullMsg.message!, {
          messageId: fullMsg.key.id!
        });

        console.log(`[PLAYDEBUG3] Stage: minimal interactive message relayed successfully!`);
        await reply(`✅ *PLAYDEBUG3 SUCCESS*\nInteractive message sederhana (tanpa thumbnail) berhasil terkirim!`);
      } catch (err: any) {
        console.error(`[PLAYDEBUG3-ERROR] failed:`, err);
        await reply(`❌ *PLAYDEBUG3 FAILED*\nError: ${err?.message || String(err)}`);
      }
      return;
    }
  }
});
