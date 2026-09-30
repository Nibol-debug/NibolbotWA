import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const dataDir = resolve(import.meta.dir, "../../..", "data");
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

const dbPath = process.env.DB_PATH || resolve(dataDir, "nibolbot.db");
export const db = new Database(dbPath);

// Enable WAL mode for concurrency
db.run("PRAGMA journal_mode = WAL;");

// Initialize schema per PRD Section 10
db.run(`
  CREATE TABLE IF NOT EXISTS admin (
    username TEXT PRIMARY KEY,
    password_hash TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS feature_settings (
    feature TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 1,
    config TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS groups (
    jid TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    banned INTEGER NOT NULL DEFAULT 0,
    config TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    jid TEXT PRIMARY KEY,
    blacklisted INTEGER NOT NULL DEFAULT 0,
    daily_usage INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS command_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts DATETIME DEFAULT CURRENT_TIMESTAMP,
    user TEXT NOT NULL,
    command TEXT NOT NULL,
    status TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS error_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts DATETIME DEFAULT CURRENT_TIMESTAMP,
    feature TEXT NOT NULL,
    message TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS player_tokens (
    id TEXT PRIMARY KEY,
    media_ref TEXT NOT NULL,
    expires_at DATETIME NOT NULL
  );
`);

// Insert default settings if empty
const count = db.query("SELECT COUNT(*) as c FROM settings").get() as { c: number };
if (count.c === 0) {
  const defaultSettings = [
    ['bot_name', 'nibolbot'],
    ['prefix', '.'],
    ['mode', 'public'],
    ['sticker_pack', 'nibol.my.id'],
    ['sticker_author', 'by @nibol'],
    ['cache_ttl_minutes', '30'],
    ['cache_max_mb', '300']
  ];
  for (const [k, v] of defaultSettings) {
    db.run("INSERT INTO settings (key, value) VALUES (?, ?)", [k, JSON.stringify(v)]);
  }
}

// Seed default admin if no admin exists (configurable via env)
export async function ensureDefaultAdmin() {
  const username = process.env.ADMIN_USERNAME || "nibol";
  const password = process.env.ADMIN_PASSWORD || "nibolganteng";
  const admin = db.query("SELECT * FROM admin WHERE username = ?").get(username);
  if (!admin) {
    const hash = await Bun.password.hash(password);
    db.run("INSERT OR REPLACE INTO admin (username, password_hash) VALUES (?, ?)", [username, hash]);
    console.log(`🔑 Default admin initialized: ${username} / ${password}`);
  }
}
ensureDefaultAdmin();
