import { definePlugin } from "@nibolbot/shared";

export default definePlugin({
  name: "owner",
  category: "system",
  description: "Cek identitas pengirim dan status otorisasi owner",
  commands: ["owner", "whoami", "cekowner"],
  defaults: {
    enabled: true,
    cooldown: 3,
    limitPerDay: 50
  },
  async run({ reply, sender, isGroup, isOwner, settings, from }) {
    const rawNumber = sender.split("@")[0].split(":")[0];
    const maskedOwners = settings.owners.map(o => {
      const clean = o.trim();
      if (clean.length > 7) {
        return clean.slice(0, 4) + "****" + clean.slice(-3);
      }
      return clean;
    });

    const text =
      `👑 *IDENTITAS & STATUS OWNER*\n\n` +
      `• *Pengirim:* \`${sender}\`\n` +
      `• *ID / Nomor:* \`${rawNumber}\`\n` +
      `• *Status:* ${isOwner ? "✅ *OWNER TERVERIFIKASI*" : "❌ *Pengguna Biasa*"}\n` +
      `• *Lokasi Chat:* ${isGroup ? "👥 Grup WhatsApp" : "👤 Chat Pribadi (PM)"}\n` +
      `• *Mode Bot:* ${settings.mode === "owner" ? "🔒 Khusus Owner" : "🌐 Publik"}\n` +
      `• *Akses PM:* ${settings.allowPm === false ? "🚫 Dinonaktifkan" : "✅ Aktif"}\n\n` +
      `📋 *Daftar Owner Terdaftar (${settings.owners.length}):*\n` +
      (maskedOwners.length ? maskedOwners.map(o => `  - ${o}`).join("\n") : "  _(belum ada owner terdaftar)_") +
      `\n\n_Ubah konfigurasi nomor owner melalui Admin Panel di tab Pengaturan._`;

    await reply(text);
  }
});
