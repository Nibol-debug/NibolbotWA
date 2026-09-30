import { definePlugin } from "@nibolbot/shared";
import { sendInteractiveMessage } from "../lib/interactive";
import { getGameUrl } from "../lib/config";

export default definePlugin({
  name: "game",
  category: "games",
  description: "Mainkan mini game HTML5 arcade via In-App WebView WhatsApp",
  commands: ["game", "arcade", "dino", "flappy"],
  defaults: {
    enabled: true,
    cooldown: 5,
    limitPerDay: 50,
    maxDuration: 0
  },
  async run({ sock, from, args, command, settings, reply }) {
    let selectedGame = (args[0] || command).toLowerCase();
    if (selectedGame === "game" || selectedGame === "arcade") {
      selectedGame = "dino";
    }

    const titleMap: Record<string, string> = {
      dino: "🦖 Dino T-Rex Runner",
      flappy: "🐦 Flappy Nibol"
    };

    const descMap: Record<string, string> = {
      dino: "Lari dan lompati kaktus rintangan dalam In-App WebView WhatsApp!",
      flappy: "Ketuk layar untuk mengepakkan sayap dan melewati pipa!"
    };

    const gameTitle = titleMap[selectedGame] || "🎮 Nibol Arcade Hub";
    const gameDesc = descMap[selectedGame] || "Mainkan game arcade seru langsung di WhatsApp!";
    const gameUrl = getGameUrl(selectedGame);

    const buttons = [
      {
        name: "cta_url",
        buttonParamsJson: JSON.stringify({
          display_text: `▶️ Mainkan ${selectedGame.toUpperCase()}`,
          url: gameUrl,
          merchant_url: gameUrl,
          webview_presentation: "FULL"
        })
      }
    ];

    const contextInfo = settings.newsletterJid ? {
      forwardedNewsletterMessageInfo: {
        newsletterJid: settings.newsletterJid,
        newsletterName: settings.channelName || settings.botName,
        serverMessageId: -1
      },
      isForwarded: true
    } : {};

    try {
      await sendInteractiveMessage(sock, {
        to: from,
        title: `🕹️ ${gameTitle}`,
        body: `${gameDesc}\n\nKetuk tombol di bawah untuk mulai bermain tanpa keluar dari WhatsApp!`,
        footer: `${settings.botName} • In-App Arcade Games`,
        buttons,
        contextInfo,
        useViewOnce: false
      });
    } catch (err: any) {
      console.error("[GAME] sendInteractiveMessage failed:", err);
      await reply(
        `🕹️ *${gameTitle}*\n${gameDesc}\n\n` +
        `Mainkan di browser / WebView:\n👉 ${gameUrl}`
      );
    }
  }
});
