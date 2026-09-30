import { db } from "../db";

/**
 * Canonical API_URL for Nibolbot.
 * Priority:
 * 1. process.env.API_URL
 * 2. SQLite settings table (key: 'api_url' or 'public_url')
 * 3. Default: https://nibol.my.id (NEVER localhost)
 */
export function getApiUrl(): string {
  let url = process.env.API_URL;
  if (!url || url.includes("localhost") || url.includes("127.0.0.1")) {
    try {
      const row = db.query("SELECT value FROM settings WHERE key = 'api_url' OR key = 'public_url'").get() as { value: string } | null;
      if (row?.value) {
        try {
          const parsed = JSON.parse(row.value);
          if (parsed && typeof parsed === "string") url = parsed;
        } catch {
          url = row.value;
        }
      }
    } catch {}
  }

  // Ensure default is always canonical HTTPS domain if env/db is missing or set to localhost
  if (!url || url.includes("localhost") || url.includes("127.0.0.1")) {
    url = "https://nibol.my.id";
  }

  return url.replace(/\/$/, "");
}

export function getPlayerUrl(id: string): string {
  return `${getApiUrl()}/p/${id}`;
}

export function getStreamUrl(id: string): string {
  return `${getApiUrl()}/stream/${id}`;
}
