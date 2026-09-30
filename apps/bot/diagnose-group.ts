/**
 * Jalankan: bun apps/bot/diagnose-group.ts
 * Script ini cek semua kemungkinan kenapa bot tidak merespons di grup.
 */
import { Database } from "bun:sqlite";
import { resolve } from "node:path";

const dbPath = process.env.DB_PATH || resolve(import.meta.dir, "../..", "data/nibolbot.db");
const db = new Database(dbPath);

console.log("🔍 DIAGNOSA BOT GRUP\n");

// 1. Cek mode bot
const rows = db.query("SELECT key, value FROM settings").all() as { key: string; value: string }[];
const settingsMap: Record<string, any> = {};
for (const r of rows) {
  try { settingsMap[r.key] = JSON.parse(r.value); } catch { settingsMap[r.key] = r.value; }
}

const mode = settingsMap.mode || "public";
const prefix = settingsMap.prefix || ".";
const owners = settingsMap.owners || [];
const allowPm = settingsMap.allow_pm;

console.log(`1. MODE BOT: "${mode}"`);
if (mode === "owner") {
  console.log("   ⚠️  MODE = OWNER → Bot HANYA merespons nomor owner. Anggota grup biasa TIDAK bisa pakai bot!");
  console.log("   🔧 FIX: Buka panel admin → Pengaturan → Ubah mode ke 'public'");
} else {
  console.log("   ✅ Mode publik — semua orang bisa pakai bot");
}

console.log(`\n2. PREFIX: "${prefix}"`);
console.log(`   ℹ️  Pastikan perintah dikirim dengan prefix ini. Contoh: ${prefix}ping`);

console.log(`\n3. OWNERS (${Array.isArray(owners) ? owners.length : 0}):`);
if (Array.isArray(owners) && owners.length > 0) {
  owners.forEach((o: string) => console.log(`   - ${o}`));
} else {
  console.log("   ⚠️  Tidak ada owner terdaftar!");
}

// 2. Cek grup yang di-ban
console.log(`\n4. GRUP TERDAFTAR:`);
const groups = db.query("SELECT jid, name, banned FROM groups").all() as any[];
if (groups.length === 0) {
  console.log("   ℹ️  Belum ada grup terdaftar (otomatis terdaftar saat pesan pertama masuk)");
} else {
  for (const g of groups) {
    const status = g.banned === 1 ? "🚫 BANNED" : "✅ aktif";
    console.log(`   ${status} | ${g.name} (${g.jid})`);
    if (g.banned === 1) {
      console.log(`   🔧 FIX: Buka panel admin → Grup → Unban grup ini`);
    }
  }
}

// 3. Cek fitur yang dinonaktifkan
console.log(`\n5. FITUR:`);
const features = db.query("SELECT feature, enabled FROM feature_settings").all() as any[];
if (features.length === 0) {
  console.log("   ✅ Semua fitur aktif (default)");
} else {
  for (const f of features) {
    const status = f.enabled === 1 ? "✅" : "🚫 DISABLED";
    console.log(`   ${status} ${f.feature}`);
    if (f.enabled !== 1) {
      console.log(`   🔧 FIX: Buka panel admin → Toggle fitur → Aktifkan "${f.feature}"`);
    }
  }
}

// 4. Cek blacklist
console.log(`\n6. USER BLACKLIST:`);
const blacklisted = db.query("SELECT jid FROM users WHERE blacklisted = 1").all() as any[];
if (blacklisted.length === 0) {
  console.log("   ✅ Tidak ada user yang di-blacklist");
} else {
  for (const u of blacklisted) {
    console.log(`   🚫 ${u.jid}`);
  }
}

console.log(`\n${"=".repeat(60)}`);
console.log("RINGKASAN:");
const issues: string[] = [];
if (mode === "owner") issues.push("Mode bot = owner (hanya owner bisa pakai)");
const bannedGroups = groups.filter(g => g.banned === 1);
if (bannedGroups.length > 0) issues.push(`${bannedGroups.length} grup di-ban`);
const disabledFeatures = features.filter(f => f.enabled !== 1);
if (disabledFeatures.length > 0) issues.push(`${disabledFeatures.length} fitur dinonaktifkan`);

if (issues.length === 0) {
  console.log("✅ Tidak ada masalah konfigurasi terdeteksi.");
  console.log("   Jika bot tetap tidak merespons di grup, restart bot dan cek log [GROUP] di terminal.");
} else {
  console.log("⚠️  Masalah ditemukan:");
  issues.forEach(i => console.log(`   - ${i}`));
}
console.log("");
