import { buildPlayCard } from "./src/lib/interactive";
import { extractVideoId } from "./src/lib/youtube";
import { createPlayerToken, getPlayerToken } from "./src/lib/player";
import { getPlayerUrl } from "./src/lib/config";
import { proto, generateWAMessageFromContent } from "@whiskeysockets/baileys";

console.log("=================================================================");
console.log("🧪 TESTING BAILEYS 6.17.16 INTERACTIVE PAYLOAD SERIALIZATION");
console.log("=================================================================\n");

// --- STEP 1: Video ID Extraction & Player Token ---
const id = extractVideoId("https://www.youtube.com/watch?v=i0p1bmr0EmE");
console.log("STEP 1: Extracted Video ID:", id);

const token = createPlayerToken("i0p1bmr0EmE", "TWICE \"What is Love?\" M/V", "JYP Entertainment", 224, "https://i.ytimg.com/vi/i0p1bmr0EmE/hqdefault.jpg");
console.log("STEP 1: Created Token:", token);
const tokenInfo = getPlayerToken(token);
console.log("STEP 1: Token Verified:", tokenInfo?.title, "\n");

// --- STEP 2: Minimal InteractiveMessage (NO image, NO merchant_url, NO webview_presentation) ---
console.log("-----------------------------------------------------------------");
console.log("STEP 2: Minimal interactiveMessage + cta_url (Direct, No ViewOnce)");
console.log("-----------------------------------------------------------------");

const minimalBtnJson = JSON.stringify({
  display_text: "Open Player",
  url: getPlayerUrl(token)
});

const minimalInteractiveMsg: proto.Message.IInteractiveMessage = {
  body: { text: "WebView test" },
  nativeFlowMessage: {
    buttons: [
      {
        name: "cta_url",
        buttonParamsJson: minimalBtnJson
      }
    ],
    messageParamsJson: ""
  }
};

const minimalDirectMsg = generateWAMessageFromContent(
  "628123456789@s.whatsapp.net",
  { interactiveMessage: minimalInteractiveMsg },
  {}
);

console.log("Payload yang dikirim ke sock.relayMessage() [Direct Minimal]:");
console.log(JSON.stringify(minimalDirectMsg.message, null, 2));

// --- STEP 3: Minimal Wrapped in ViewOnceMessage ---
console.log("\n-----------------------------------------------------------------");
console.log("STEP 3: Minimal interactiveMessage Wrapped in ViewOnceMessage");
console.log("-----------------------------------------------------------------");

const minimalVoMsg = generateWAMessageFromContent(
  "628123456789@s.whatsapp.net",
  {
    viewOnceMessage: {
      message: {
        interactiveMessage: minimalInteractiveMsg
      }
    }
  },
  {}
);

console.log("Payload yang dikirim ke sock.relayMessage() [ViewOnce Minimal]:");
console.log(JSON.stringify(minimalVoMsg.message, null, 2));

// --- STEP 4: With webview_presentation: 'FULL' ---
console.log("\n-----------------------------------------------------------------");
console.log("STEP 4: cta_url with webview_presentation: 'FULL'");
console.log("-----------------------------------------------------------------");

const webviewBtnJson = JSON.stringify({
  display_text: "▶️ Play Video",
  url: getPlayerUrl(token),
  webview_presentation: "FULL"
});

const webviewInteractiveMsg: proto.Message.IInteractiveMessage = {
  header: {
    title: "🎬 TWICE - What is Love?",
    hasMediaAttachment: false
  },
  body: { text: "🏢 JYP Entertainment\n⏱️ 03:44" },
  footer: { text: "nibolbot • In-App Video Player" },
  nativeFlowMessage: {
    buttons: [
      {
        name: "cta_url",
        buttonParamsJson: webviewBtnJson
      }
    ],
    messageParamsJson: ""
  }
};

const fullVoMsg = generateWAMessageFromContent(
  "628123456789@s.whatsapp.net",
  {
    viewOnceMessage: {
      message: {
        interactiveMessage: webviewInteractiveMsg
      }
    }
  },
  {}
);

console.log("Payload yang dikirim ke sock.relayMessage() [Full Card + Webview Presentation]:");
console.log(JSON.stringify(fullVoMsg.message, null, 2));
console.log("\n=================================================================");
