import { db } from "../db";

function isInternalOrLocal(url: string | undefined): boolean {
  if (!url) return true;
  const lower = url.toLowerCase().trim();
  return (
    lower.includes("localhost") ||
    lower.includes("127.0.0.1") ||
    lower.includes("api:3000") ||
    lower.includes("bot:3001") ||
    lower.startsWith("http://api") ||
    lower.startsWith("http://bot")
  );
}

/**
 * Resolver URL publik terpusat untuk Nibolbot.
 * Prioritas:
 * 1. process.env.PUBLIC_URL
 * 2. SQLite settings table (`public_url` atau `api_url`)
 * 3. process.env.API_URL (jika bukan internal/local)
 * 4. Default: https://nibol.my.id (fallback domain publik)
 */
export function getApiUrl(): string {
  // 1. process.env.PUBLIC_URL
  let url = process.env.PUBLIC_URL;
  if (url && !isInternalOrLocal(url)) {
    return url.trim().replace(/\/$/, "");
  }

  // 2. SQLite settings table (key: 'public_url' or 'api_url')
  try {
    const row = db.query(
      "SELECT value FROM settings WHERE key = 'public_url' OR key = 'api_url' ORDER BY key = 'public_url' DESC LIMIT 1"
    ).get() as { value: string } | null;
    if (row?.value) {
      let val = row.value;
      try {
        const parsed = JSON.parse(row.value);
        if (typeof parsed === "string") val = parsed;
      } catch {}
      if (val && !isInternalOrLocal(val)) {
        return val.trim().replace(/\/$/, "");
      }
    }
  } catch {}

  // 3. process.env.API_URL
  url = process.env.API_URL;
  if (url && !isInternalOrLocal(url)) {
    return url.trim().replace(/\/$/, "");
  }

  // 4. Default public domain (NEVER localhost / internal container name)
  return "https://nibol.my.id:2235";
}

export function getPlayerUrl(id: string): string {
  return `${getApiUrl()}/p/${id}`;
}

export function getStreamUrl(id: string): string {
  return `${getApiUrl()}/stream/${id}`;
}

export function getGameUrl(game: string): string {
  return `${getApiUrl()}/games/${game}`;
}
