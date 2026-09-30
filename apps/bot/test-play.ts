import playPlugin from "./src/plugins/play";
import { db } from "./src/db";

async function runTest(query: string) {
  console.log(`\n==================== [TEST RUN: .play ${query}] ====================`);
  const mockSock: any = {
    relayMessage: async (to: string, msg: any, opts: any) => {
      console.log(`[MOCK_SOCK] relayMessage called for: ${to} | msgId: ${opts.messageId}`);
    },
    waUploadToServer: async (stream: any, opts: any) => {
      console.log("[MOCK_SOCK] waUploadToServer called");
      return { url: "https://mock.upload.url" };
    }
  };

  const mockReply = async (text: any) => {
    console.log("[MOCK_REPLY]:", typeof text === "string" ? text : JSON.stringify(text));
  };

  const ctx: any = {
    sock: mockSock,
    msg: { key: { remoteJid: "628123456789@s.whatsapp.net", id: "TEST_MSG_ID" } },
    from: "628123456789@s.whatsapp.net",
    sender: "628123456789@s.whatsapp.net",
    isGroup: false,
    command: "play",
    args: query.split(" "),
    fullText: query,
    reply: mockReply,
    db,
    settings: {
      botName: "NibolBot",
      channelName: "Nibol Channel",
      newsletterJid: "12036302@newsletter"
    }
  };

  await playPlugin.run(ctx);
}

async function main() {
  await runTest("what is love");
  await runTest("love story");
}

main().catch(console.error);
