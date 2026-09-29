import { definePlugin } from "@nibolbot/shared";

export default definePlugin({
  name: "ping",
  category: "system",
  description: "Cek responsivitas bot dan latensi",
  commands: ["ping"],
  defaults: {
    enabled: true,
    cooldown: 3,
    limitPerDay: 100
  },
  async run({ reply }) {
    const start = Date.now();
    const memMb = (process.memoryUsage().rss / 1024 / 1024).toFixed(1);
    const latency = Date.now() - start;

    await reply(`🏓 *Pong!*\n\n• *Latensi:* ${latency} ms\n• *RAM Usage:* ${memMb} MB\n• *Runtime:* Bun ${Bun.version}`);
  }
});
