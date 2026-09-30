import playPlugin from "./src/plugins/play";
import playdebugPlugin from "./src/plugins/playdebug";
import { db } from "./src/db";

const mockSock: any = {
  relayMessage: async (to: string, msg: any, opts: any) => {
    console.log(`[MOCK_SOCK] relayMessage OK -> to: ${to}, msgId: ${opts.messageId}`);
    return true;
  },
  waUploadToServer: async (stream: any, opts: any) => {
    console.log(`[MOCK_SOCK] waUploadToServer OK`);
    return { url: "https://mmg.whatsapp.net/mock_image.jpg" };
  }
};

const mockReply = async (text: any) => {
  const content = typeof text === "string" ? text : JSON.stringify(text);
  console.log(`[MOCK_REPLY]:\n${content}\n`);
};

const defaultSettings = {
  botName: "NibolBot",
  channelName: "Nibol Channel",
  newsletterJid: "12036302@newsletter"
};

function createContext(command: string, args: string[]) {
  const fullText = args.join(" ");
  return {
    sock: mockSock,
    msg: { key: { remoteJid: "628123456789@s.whatsapp.net", id: "TEST_MSG_" + Date.now() } },
    from: "628123456789@s.whatsapp.net",
    sender: "628123456789@s.whatsapp.net",
    isGroup: false,
    command,
    args,
    fullText,
    reply: mockReply,
    db,
    settings: defaultSettings
  };
}

async function runSuite() {
  console.log("==================================================");
  console.log("TEST 1: .playdebug love story");
  console.log("==================================================");
  try {
    await playdebugPlugin.run(createContext("playdebug", ["love", "story"]));
  } catch (err: any) {
    console.error("Test 1 error:", err);
  }

  console.log("\n==================================================");
  console.log("TEST 2: .playdebug2");
  console.log("==================================================");
  try {
    await playdebugPlugin.run(createContext("playdebug2", []));
  } catch (err: any) {
    console.error("Test 2 error:", err);
  }

  console.log("\n==================================================");
  console.log("TEST 3: .playdebug3");
  console.log("==================================================");
  try {
    await playdebugPlugin.run(createContext("playdebug3", []));
  } catch (err: any) {
    console.error("Test 3 error:", err);
  }

  console.log("\n==================================================");
  console.log("TEST 4: .play love story (Numbered flow)");
  console.log("==================================================");
  try {
    await playPlugin.run(createContext("play", ["love", "story"]));
  } catch (err: any) {
    console.error("Test 4 error:", err);
  }
}

runSuite().catch(console.error);
