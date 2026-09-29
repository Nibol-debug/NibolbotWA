import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

export interface DownloadResult {
  filePath: string;
  fileSize: number;
}

function run(cmd: string, args: string[]): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("close", (code) => resolve({ code: code ?? 1, stderr }));
    proc.on("error", (err) => resolve({ code: 1, stderr: err.message }));
  });
}

export async function checkYtDlp(): Promise<boolean> {
  const { code } = await run("yt-dlp", ["--version"]);
  return code === 0;
}

export async function downloadAudio(videoId: string, cacheDir: string): Promise<DownloadResult> {
  const outPath = join(cacheDir, `${videoId}.mp3`);
  if (existsSync(outPath)) return { filePath: outPath, fileSize: Bun.file(outPath).size };

  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const { code, stderr } = await run("yt-dlp", [
    "-x",
    "--audio-format", "mp3",
    "--audio-quality", "128K",
    "--postprocessor-args", "-threads 2",
    "--no-playlist",
    "--no-warnings",
    "-o", outPath,
    url
  ]);

  if (code !== 0 || !existsSync(outPath)) {
    throw new Error(`yt-dlp audio failed (code ${code}): ${stderr.slice(0, 200)}`);
  }

  return { filePath: outPath, fileSize: Bun.file(outPath).size };
}

export async function downloadVideo(videoId: string, cacheDir: string): Promise<DownloadResult> {
  const outPath = join(cacheDir, `${videoId}.mp4`);
  if (existsSync(outPath)) return { filePath: outPath, fileSize: Bun.file(outPath).size };

  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const { code, stderr } = await run("yt-dlp", [
    "-f", "bestvideo[height<=480]+bestaudio/best[height<=480]",
    "--merge-output-format", "mp4",
    "--postprocessor-args", "-threads 2",
    "--no-playlist",
    "--no-warnings",
    "-o", outPath,
    url
  ]);

  if (code !== 0 || !existsSync(outPath)) {
    throw new Error(`yt-dlp video failed (code ${code}): ${stderr.slice(0, 200)}`);
  }

  return { filePath: outPath, fileSize: Bun.file(outPath).size };
}
