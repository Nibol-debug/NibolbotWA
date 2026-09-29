import { db } from "../db";
import { randomBytes } from "node:crypto";

/** Create a player token for a YouTube video, expires in 15 minutes */
export function createPlayerToken(videoId: string, title: string, channel: string, duration: number, thumbnail: string): string {
  const id = randomBytes(8).toString("hex");
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const mediaRef = JSON.stringify({ videoId, title, channel, duration, thumbnail });

  db.run(
    "INSERT OR REPLACE INTO player_tokens (id, media_ref, expires_at) VALUES (?, ?, ?)",
    [id, mediaRef, expiresAt]
  );

  // ponytail: no scheduled cleanup — tokens are checked on read, bulk cleanup when > 500 rows
  const count = db.query("SELECT COUNT(*) as c FROM player_tokens").get() as { c: number };
  if (count.c > 500) {
    db.run("DELETE FROM player_tokens WHERE expires_at < datetime('now')");
  }

  return id;
}

/** Look up a token, returns null if expired or missing */
export function getPlayerToken(id: string): { videoId: string; title: string; channel: string; duration: number; thumbnail: string } | null {
  const row = db.query("SELECT media_ref, expires_at FROM player_tokens WHERE id = ?").get(id) as { media_ref: string; expires_at: string } | null;
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) {
    db.run("DELETE FROM player_tokens WHERE id = ?", [id]);
    return null;
  }
  return JSON.parse(row.media_ref);
}
