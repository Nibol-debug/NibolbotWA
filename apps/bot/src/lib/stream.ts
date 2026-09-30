import { spawn } from "node:child_process";

interface CachedStream {
  url: string;
  expiresAt: number;
}

const streamUrlCache = new Map<string, CachedStream>();

export async function getVideoStreamUrl(videoId: string): Promise<string | null> {
  const cached = streamUrlCache.get(videoId);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.url;
  }

  const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const args = [
    "--js-runtimes", "node:/usr/bin/node",
    "-g",
    "-f", "18/best[ext=mp4]/bestaudio/best",
    "--no-playlist",
    "--no-warnings",
    ytUrl
  ];

  return new Promise((resolve) => {
    const proc = spawn("yt-dlp", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("close", (code) => {
      if (code === 0 && stdout.trim()) {
        const streamUrl = stdout.trim().split("\n")[0].trim();
        // Google Video URLs typically valid for several hours; cache for 1 hour
        streamUrlCache.set(videoId, {
          url: streamUrl,
          expiresAt: Date.now() + 3600_000
        });
        resolve(streamUrl);
      } else {
        console.error(`yt-dlp -g error for ${videoId}:`, stderr.slice(0, 200));
        resolve(null);
      }
    });

    proc.on("error", (err) => {
      console.error(`yt-dlp spawn error for ${videoId}:`, err);
      resolve(null);
    });
  });
}

export function invalidateStreamCache(videoId: string) {
  streamUrlCache.delete(videoId);
}
