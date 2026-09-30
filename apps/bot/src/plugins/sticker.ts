import { definePlugin } from "@nibolbot/shared";
import { downloadMediaMessage } from "@whiskeysockets/baileys";
import sharp from "sharp";

function addExif(webpBuffer: Buffer, pack: string, author: string): Buffer {
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

    if (webpBuffer.toString("utf8", 0, 4) !== "RIFF" || webpBuffer.toString("utf8", 8, 12) !== "WEBP") {
      return webpBuffer;
    }

    const exifChunkHeader = Buffer.from("EXIF");
    const sizeBuf = Buffer.alloc(4);
    sizeBuf.writeUInt32LE(exif.length, 0);
    const pad = exif.length % 2 === 1 ? Buffer.from([0x00]) : Buffer.alloc(0);
    const fullExifChunk = Buffer.concat([exifChunkHeader, sizeBuf, exif, pad]);

    let offset = 12;
    const chunks: Buffer[] = [];
    while (offset < webpBuffer.length) {
      const chunkId = webpBuffer.toString("utf8", offset, offset + 4);
      const chunkSize = webpBuffer.readUInt32LE(offset + 4);
      const chunkFullSize = 8 + chunkSize + (chunkSize % 2 === 1 ? 1 : 0);
      if (chunkId !== "EXIF") {
        chunks.push(webpBuffer.subarray(offset, offset + chunkFullSize));
      }
      offset += chunkFullSize;
    }

    const newPayload = Buffer.concat([...chunks, fullExifChunk]);
    const newRiffHeader = Buffer.alloc(12);
    newRiffHeader.write("RIFF", 0);
    newRiffHeader.writeUInt32LE(newPayload.length + 4, 4);
    newRiffHeader.write("WEBP", 8);

    return Buffer.concat([newRiffHeader, newPayload]);
  } catch {
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

    const webp = addExif(
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
