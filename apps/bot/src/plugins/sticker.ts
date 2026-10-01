import { definePlugin } from "@nibolbot/shared";
import { downloadMediaMessage } from "@whiskeysockets/baileys";
import sharp from "sharp";
import { Image as WebPImage } from "node-webpmux";

async function addExif(webpBuffer: Buffer, pack: string, author: string): Promise<Buffer> {
  try {
    const json = {
      "sticker-pack-id": "nibolbot",
      "sticker-pack-name": pack,
      "sticker-pack-publisher": author,
      "emojis": ["🤖"]
    };
    const jsonBuff = Buffer.from(JSON.stringify(json), "utf-8");
    const exifAttr = Buffer.from([
      0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00,
      0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x16, 0x00, 0x00, 0x00
    ]);
    const exif = Buffer.concat([exifAttr, jsonBuff]);
    exif.writeUIntLE(jsonBuff.length, 14, 4);

    const img = new WebPImage();
    await img.load(webpBuffer);
    img.exif = exif;
    return await img.save(null);
  } catch (err: any) {
    console.warn("[STICKER] Failed to embed EXIF:", err?.message || err);
    return webpBuffer;
  }
}

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

    const webpRaw = await sharp(buffer as Buffer)
      .resize(512, 512, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .webp({ quality: 80 })
      .toBuffer();

    const webp = await addExif(
      webpRaw,
      settings.stickerPack || "nibolbot.my.id",
      settings.stickerAuthor || "by @nibol"
    );

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
