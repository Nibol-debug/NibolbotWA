import { definePlugin } from "@nibolbot/shared";
import { plugins } from "../plugin-loader";

export default definePlugin({
  name: "help",
  category: "system",
  description: "Menampilkan daftar perintah dan fitur bot",
  commands: ["help", "menu"],
  defaults: {
    enabled: true,
    cooldown: 5,
    limitPerDay: 50
  },
  async run({ reply, settings }) {
    const prefix = settings.prefix || ".";

    // Group commands by category
    const categories: Record<string, string[]> = {
      system: [],
      music: [],
      downloader: [],
      media: [],
      admin: []
    };

    for (const [, p] of plugins) {
      const cat = p.category || "system";
      if (!categories[cat]) categories[cat] = [];
      const cmds = p.commands.map(c => `\`${prefix}${c}\``).join(", ");
      categories[cat].push(`• ${cmds}${p.description ? ` - _${p.description}_` : ""}`);
    }

    const header = `╭─── *${settings.botName.toUpperCase()}* ───╮\n` +
      `│ Prefix: *[ ${prefix} ]*\n` +
      `│ Mode: *${settings.mode === "public" ? "Publik" : "Owner-Only"}*\n` +
      `╰─────────────────────╯\n\n`;

    let body = "";
    if (categories.music?.length) {
      body += `🎵 *MUSIK & AUDIO*\n${categories.music.join("\n")}\n\n`;
    }
    if (categories.downloader?.length) {
      body += `📥 *DOWNLOADER*\n${categories.downloader.join("\n")}\n\n`;
    }
    if (categories.media?.length) {
      body += `🎨 *STICKER & MEDIA*\n${categories.media.join("\n")}\n\n`;
    }
    if (categories.system?.length) {
      body += `⚙️ *SISTEM & BOT*\n${categories.system.join("\n")}\n\n`;
    }

    const footer = `_Ketik ${prefix}<perintah> untuk menggunakan fitur._\n_Contoh: \`${prefix}play Sheila On 7\`_`;

    await reply(header + body + footer);
  }
});
