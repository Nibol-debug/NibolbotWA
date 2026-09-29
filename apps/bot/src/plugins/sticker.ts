import { definePlugin } from "@nibolbot/shared";
import { downloadMediaMessage } from "@whiskeysockets/baileys";
import sharp from "sharp";

export default definePlugin({
  name: "sticker",
  category: "media",
  description: "Jadikan gambar menjadi stiker WhatsApp",
  commands: ["sticker", "s"],
  defaults: {
    enabled: true,
    cooldown: 5,
    limitPerDay: 30
  },
  async run({ msg, reply, settings }) {
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const imageMsg = msg.message?.imageMessage || quotedMsg?.imageMessage;

    if (!imageMsg) {
      await reply("❌ Kirim atau balas gambar dengan perintah `.sticker` untuk dijadikan stiker.");
      return;
    }

    await reply("⏳ Membuat stiker...");

    // ponytail: downloads the image from WhatsApp servers; swap to stream if memory becomes a concern
    const source = quotedMsg?.imageMessage
      ? { ...msg, message: quotedMsg }
      : msg;

    const buffer = await downloadMediaMessage(source as any, "buffer", {});

    const webp = await sharp(buffer as Buffer)
      .resize(512, 512, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .webp({ quality: 80 })
      .toBuffer();

    await reply({
      sticker: webp,
      mimetype: "image/webp",
      isAnimated: false,
      stickerSentTs: Date.now(),
      contextInfo: {
        externalAdReply: undefined
      }
    } as any);
  }
});
