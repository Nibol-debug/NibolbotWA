import { proto, generateWAMessageFromContent, prepareWAMessageMedia } from "@whiskeysockets/baileys";
import type { WASocket } from "@whiskeysockets/baileys";
import type { YouTubeResult } from "./youtube";
import { formatDuration } from "./youtube";

interface InteractiveButton {
  name: string;
  buttonParamsJson: string;
}

interface SendInteractiveOpts {
  to: string;
  title: string;
  body: string;
  footer: string;
  buttons: InteractiveButton[];
  thumbnail?: Buffer;
  contextInfo?: any;
}

export async function sendInteractiveMessage(sock: WASocket, opts: SendInteractiveOpts) {
  let header: proto.Message.InteractiveMessage.IHeader = {
    title: opts.title,
    hasMediaAttachment: false
  };

  if (opts.thumbnail) {
    try {
      const media = await prepareWAMessageMedia(
        { image: opts.thumbnail },
        { upload: sock.waUploadToServer }
      );
      if (media.imageMessage) {
        header = {
          title: opts.title,
          hasMediaAttachment: true,
          imageMessage: media.imageMessage
        };
      }
    } catch {
      header = { title: opts.title, hasMediaAttachment: false };
    }
  }

  const interactiveMsg: proto.Message.IInteractiveMessage = {
    header,
    body: { text: opts.body },
    footer: { text: opts.footer },
    contextInfo: opts.contextInfo || undefined,
    nativeFlowMessage: {
      buttons: opts.buttons.map(b => ({
        name: b.name,
        buttonParamsJson: b.buttonParamsJson
      })),
      messageParamsJson: ""
    }
  };

  const fullMsg = generateWAMessageFromContent(opts.to, {
    viewOnceMessage: {
      message: {
        interactiveMessage: interactiveMsg
      }
    }
  }, {});

  await sock.relayMessage(opts.to, fullMsg.message!, {
    messageId: fullMsg.key.id!
  });
}

export function buildPlayCard(song: YouTubeResult, botName: string, webPlayerUrl?: string): InteractiveButton[] {
  const buttons: InteractiveButton[] = [];

  if (webPlayerUrl) {
    buttons.push({
      name: "cta_url",
      buttonParamsJson: JSON.stringify({
        display_text: "🎧 Putar di Web",
        url: webPlayerUrl,
        merchant_url: webPlayerUrl
      })
    });
  }

  buttons.push({
    name: "cta_copy",
    buttonParamsJson: JSON.stringify({
      display_text: "📋 Salin Link",
      copy_code: `https://youtu.be/${song.id}`
    })
  });

  return buttons;
}

export function buildSearchCarousel(
  results: YouTubeResult[],
  botName: string
): proto.Message.IInteractiveMessage[] {
  return results.map(song => ({
    header: { title: song.title },
    body: { text: `👤 ${song.channel}\n⏱️ ${formatDuration(song.duration)}` },
    footer: { text: botName },
    nativeFlowMessage: {
      buttons: [
        {
          name: "quick_reply",
          buttonParamsJson: JSON.stringify({
            display_text: "🎵 Download MP3",
            id: `.ytmp3 https://youtu.be/${song.id}`
          })
        },
        {
          name: "quick_reply",
          buttonParamsJson: JSON.stringify({
            display_text: "🎬 Download MP4",
            id: `.ytmp4 https://youtu.be/${song.id}`
          })
        },
        {
          name: "cta_copy",
          buttonParamsJson: JSON.stringify({
            display_text: "📋 Salin Link",
            copy_code: `https://youtu.be/${song.id}`
          })
        }
      ]
    }
  }));
}

export async function sendCarouselMessage(
  sock: WASocket,
  to: string,
  cards: proto.Message.IInteractiveMessage[],
  body: string,
  footer: string,
  contextInfo?: any
) {
  const fullMsg = generateWAMessageFromContent(to, {
    viewOnceMessage: {
      message: {
        interactiveMessage: {
          body: { text: body },
          footer: { text: footer },
          contextInfo: contextInfo || undefined,
          carouselMessage: {
            cards,
            messageVersion: 1
          }
        }
      }
    }
  }, {});

  await sock.relayMessage(to, fullMsg.message!, {
    messageId: fullMsg.key.id!
  });
}

export async function fetchThumbnailBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}
