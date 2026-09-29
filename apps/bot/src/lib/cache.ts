import { readdirSync, statSync, unlinkSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const cacheDir = process.env.CACHE_DIR || resolve(import.meta.dir, "../../../..", "data/cache");
if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });

export function getCacheDir(): string {
  return cacheDir;
}

export function getCacheSize(): number {
  if (!existsSync(cacheDir)) return 0;
  let total = 0;
  for (const f of readdirSync(cacheDir)) {
    try {
      total += statSync(join(cacheDir, f)).size;
    } catch { /* file gone between readdir and stat */ }
  }
  return total;
}

export function isCacheFull(maxMb: number): boolean {
  return getCacheSize() > maxMb * 1024 * 1024;
}

export function cleanExpired(ttlMinutes: number): number {
  if (!existsSync(cacheDir)) return 0;
  const now = Date.now();
  const ttlMs = ttlMinutes * 60 * 1000;
  let removed = 0;

  for (const f of readdirSync(cacheDir)) {
    try {
      const fp = join(cacheDir, f);
      const st = statSync(fp);
      if (now - st.mtimeMs > ttlMs) {
        unlinkSync(fp);
        removed++;
      }
    } catch { /* already gone */ }
  }
  return removed;
}

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

export function scheduleCacheCleanup(ttlMinutes = 30, intervalMinutes = 5) {
  if (cleanupTimer) clearInterval(cleanupTimer);
  cleanupTimer = setInterval(() => {
    const n = cleanExpired(ttlMinutes);
    if (n > 0) console.log(`🗑️ Cache cleanup: removed ${n} expired files`);
  }, intervalMinutes * 60 * 1000);

  // run once at startup
  const n = cleanExpired(ttlMinutes);
  if (n > 0) console.log(`🗑️ Cache cleanup (startup): removed ${n} expired files`);
}
