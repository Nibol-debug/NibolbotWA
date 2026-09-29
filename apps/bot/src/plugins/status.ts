import { definePlugin } from "@nibolbot/shared";

export default definePlugin({
  name: "status",
  category: "system",
  description: "Cek statistik performa bot dan sistem",
  commands: ["status", "botstatus", "stats"],
  defaults: {
    enabled: true,
    cooldown: 5,
    limitPerDay: 50
  },
  async run({ reply, settings, db }) {
    const uptimeSec = Math.floor(process.uptime());
    const days = Math.floor(uptimeSec / 86400);
    const hours = Math.floor((uptimeSec % 86400) / 3600);
    const mins = Math.floor((uptimeSec % 3600) / 60);
    const secs = uptimeSec % 60;
    const uptimeFormatted = `${days}d ${hours}h ${mins}m ${secs}s`;

    const ramMb = (process.memoryUsage().rss / 1024 / 1024).toFixed(1);

    // Query command statistics from SQLite
    const totalCommands = (db.query("SELECT COUNT(*) as c FROM command_logs").get() as any)?.c || 0;
    const totalErrors = (db.query("SELECT COUNT(*) as c FROM error_logs").get() as any)?.c || 0;

    const text =
      `📊 *STATISTIK BOT*\n\n` +
      `• *Nama:* ${settings.botName}\n` +
      `• *Uptime:* ${uptimeFormatted}\n` +
      `• *RAM Bot:* ${ramMb} MB / < 500 MB (Target PRD)\n` +
      `• *Total Perintah Tercatat:* ${totalCommands}\n` +
      `• *Error Logs:* ${totalErrors}\n` +
      `• *Node/Bun:* Bun ${Bun.version} (${process.platform} ${process.arch})\n\n` +
      `_Semua data log otomatis dirotasi per 200 baris._`;

    await reply(text);
  }
});
