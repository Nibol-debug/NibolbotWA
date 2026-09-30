import { definePlugin } from "@nibolbot/shared";
import { generateWAMessageFromContent, proto } from "@whiskeysockets/baileys";
import { getApiUrl, getPlayerUrl, getStreamUrl } from "../lib/config";

export default definePlugin({
  name: "testurl",
  category: "utility",
  description: "Debug & test canonical URLs and minimal interactiveMessage",
  commands: ["testurl", "tu"],
  defaults: {
    enabled: true,
    cooldown: 0,
    limitPerDay: 100,
    maxDuration: 0
  },
  async run({ sock, msg, from, args, reply }) {
    const mode = (args[0] || "").toLowerCase();
    const apiUrl = getApiUrl();
    const playerUrl = getPlayerUrl("TEST_ID");
    const streamUrl = getStreamUrl("TEST_ID");

    // 1. Parameter minimal button
    let buttonParams: Record<string, any> = {
      display_text: "Open Player",
      url: playerUrl
    };

    if (mode === "webview" || mode === "full") {
      buttonParams.webview_presentation = "FULL";
    }

    // 2. Minimal interactiveMessage:
    // interactiveMessage
    // └── body
    // └── nativeFlowMessage
    //     └── cta_url
    const interactiveMsg: proto.Message.IInteractiveMessage = {
      body: {
        text: `🌐 *CANONICAL URL CONFIG*\n\n` +
          `• *API_URL:* ${apiUrl}\n` +
          `• *PLAYER_URL:* ${playerUrl}\n` +
          `• *STREAM_URL:* ${streamUrl}\n\n` +
          `Mode: *${mode || "minimal"}*`
      },
      nativeFlowMessage: {
        buttons: [
          {
            name: "cta_url",
            buttonParamsJson: JSON.stringify(buttonParams)
          }
        ],
        messageParamsJson: ""
      }
    };

    // 3. Tentukan apakah menggunakan wrapper viewOnceMessage atau direct
    const useViewOnce = mode === "vo" || mode === "viewonce";
    const messageContent: proto.IMessage = useViewOnce
      ? {
          viewOnceMessage: {
            message: {
              interactiveMessage: interactiveMsg
            }
          }
        }
      : {
          interactiveMessage: interactiveMsg
        };

    // 4. Generate & Serialize ke Protobuf
    const fullMsg = generateWAMessageFromContent(from, messageContent, {});

    // 5. Print payload final sebelum diserahkan ke sock.relayMessage()
    console.log("\n==================== [CANONICAL URL DEBUG] ====================");
    console.log(`API_URL:    ${apiUrl}`);
    console.log(`PLAYER_URL: ${playerUrl}`);
    console.log(`STREAM_URL: ${streamUrl}`);
    console.log(`Target:     ${from}`);
    console.log(`Mode:       ${useViewOnce ? "viewOnceMessage" : "direct interactiveMessage"}`);
    console.log("Full Message JSON (After Protobuf Serialization):");
    console.log(JSON.stringify(fullMsg.message, null, 2));
    console.log("===============================================================\n");

    try {
      await sock.relayMessage(from, fullMsg.message!, {
        messageId: fullMsg.key.id!
      });
      await reply(
        `📡 *CONFIG VERIFIED*\n\n` +
        `API_URL: ${apiUrl}\n` +
        `PLAYER_URL: ${playerUrl}\n` +
        `STREAM_URL: ${streamUrl}\n\n` +
        `✅ Pesan interaktif terkirim!`
      );
    } catch (err: any) {
      console.error("❌ relayMessage failed:", err);
      await reply(`❌ Gagal relay: ${err.message}`);
    }
  }
});
