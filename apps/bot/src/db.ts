import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { BotSettings } from "@nibolbot/shared";

const dataDir = resolve(import.meta.dir, "../../..", "data");
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

const dbPath = process.env.DB_PATH || resolve(dataDir, "nibolbot.db");
export const db = new Database(dbPath);
db.run("PRAGMA journal_mode = WAL;");

export function getBotSettings(): BotSettings {
  const rows = db.query("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  const map: Record<string, any> = {};
  for (const r of rows) {
    try {
      map[r.key] = JSON.parse(r.value);
    } catch {
      map[r.key] = r.value;
    }
  }

  let ownersList: string[] = [];
  if (Array.isArray(map.owners)) {
    ownersList = map.owners;
  } else if (typeof map.owners === "string") {
    ownersList = map.owners.split("\n").map(s => s.trim()).filter(Boolean);
  }

  return {
    botName: map.bot_name || "nibolbot",
    prefix: map.prefix || ".",
    mode: map.mode || "public",
    owners: ownersList,
    stickerPack: map.sticker_pack || "nibol.my.id",
    stickerAuthor: map.sticker_author || "by @nibol",
    newsletterJid: map.newsletter_jid,
    channelName: map.channel_name
  };
}

export function isUserBlacklisted(jid: string): boolean {
  const row = db.query("SELECT blacklisted FROM users WHERE jid = ?").get(jid) as { blacklisted: number } | null;
  return !!row && row.blacklisted === 1;
}

export function isGroupBanned(jid: string): boolean {
  const row = db.query("SELECT banned FROM groups WHERE jid = ?").get(jid) as { banned: number } | null;
  return !!row && row.banned === 1;
}

export function logCommand(user: string, command: string, status: "SUCCESS" | "FAILED" | "BLOCKED" | "COOLDOWN") {
  db.run("INSERT INTO command_logs (user, command, status) VALUES (?, ?, ?)", [user, command, status]);
  db.run("DELETE FROM command_logs WHERE id NOT IN (SELECT id FROM command_logs ORDER BY id DESC LIMIT 200)");
}

export function logError(feature: string, message: string) {
  db.run("INSERT INTO error_logs (feature, message) VALUES (?, ?)", [feature, message]);
  db.run("DELETE FROM error_logs WHERE id NOT IN (SELECT id FROM error_logs ORDER BY id DESC LIMIT 100)");
}
