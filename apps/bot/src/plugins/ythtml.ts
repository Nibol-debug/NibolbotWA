import { definePlugin } from "@nibolbot/shared";
import { searchYouTube, getVideoInfo, extractVideoId, formatDuration } from "../lib/youtube";
import { downloadVideo, checkYtDlp } from "../lib/downloader";
import { getCacheDir } from "../lib/cache";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { existsSync, readdirSync, rmSync, unlinkSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

// Hanya 1 job perekaman yang berjalan dalam satu waktu
let isRecordingActive = false;
const recordingQueue: Array<() => Promise<void>> = [];

function processNextRecording() {
  if (isRecordingActive || recordingQueue.length === 0) return;
  const nextJob = recordingQueue.shift();
  if (nextJob) {
    isRecordingActive = true;
    nextJob().finally(() => {
      isRecordingActive = false;
      processNextRecording();
    });
  }
}

function runCommand(cmd: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
    proc.on("error", (err) => resolve({ code: 1, stdout, stderr: err.message }));
  });
}

export default definePlugin({
  name: "ythtml",
  category: "downloader",
  description: "Kirim video MP4 hasil rekaman layar HTML5 player WebSocket langsung ke WhatsApp",
  commands: ["ythtml"],
  defaults: {
    enabled: true,
    cooldown: 60, // 1 request per user per 60 detik
    limitPerDay: 20,
    maxDuration: 5 // Maks 5 menit
  },
  async run({ sock, msg, from, args, reply, fullText, settings }) {
    const query = (fullText || args.join(" ")).trim();
    if (!query) {
      await reply("❌ Masukkan judul atau link YouTube.\nContoh: `.ythtml dj mmg xputz` atau `.ythtml https://youtu.be/xxx`");
      return;
    }

    // Keamanan: Validasi input query
    if (query.length > 200 || /[\x00;\`\$<>\|&]/g.test(query)) {
      await reply("❌ Input tidak valid atau mengandung karakter yang tidak diizinkan.");
      return;
    }

    if (/^https?:\/\//i.test(query) && !/(?:youtube\.com|youtu\.be)\//i.test(query)) {
      await reply("❌ Hanya tautan YouTube resmi (youtube.com / youtu.be) yang didukung.");
      return;
    }

    const hasYtDlp = await checkYtDlp();
    if (!hasYtDlp) {
      await reply("⚠️ yt-dlp belum terinstall di server.");
      return;
    }

    const maxSeconds = Number(process.env.YTHTML_MAX_SECONDS) || 300;
    const maxMb = Number(process.env.YTHTML_MAX_MB) || 50;

    // 1. Cari video YouTube
    let song: any = null;
    const directId = extractVideoId(query);

    if (directId) {
      song = await getVideoInfo(directId);
    } else {
      const results = await searchYouTube(query, 5);
      if (results.length > 0) {
        song = results.find(r => r.duration > 0 && r.duration <= maxSeconds) || results[0];
      }
    }

    if (!song) {
      await reply(`❌ Video tidak ditemukan untuk: "${query}". Coba gunakan judul yang lebih spesifik.`);
      return;
    }

    // Validasi batas durasi maksimal
    if (song.duration > maxSeconds) {
      await reply(`❌ Durasi video (${formatDuration(song.duration)}) melebihi batas maksimal ${Math.round(maxSeconds / 60)} menit.`);
      return;
    }

    if (isRecordingActive) {
      await reply("⏳ Bot sedang sibuk memproses rekaman lain. Permintaan Anda telah dimasukkan ke antrean...");
    } else {
      await reply(
        `⏳ *Sedang diproses...*\n\n` +
        `🎬 *${song.title}*\n` +
        `👤 ${song.channel} • ⏱️ ${formatDuration(song.duration)}\n\n` +
        `_1. Mengunduh video (480p)...\n` +
        `_2. Merekam antarmuka HTML player...\n` +
        `_3. Menggabungkan audio & render MP4..._`
      );
    }

    const executeJob = async () => {
      const pvId = randomBytes(16).toString("hex"); // ID acak sekali pakai
      const cacheDir = getCacheDir();
      const recDir = join(cacheDir, `rec_${pvId}`);
      const finalMp4 = join(cacheDir, `ythtml_${pvId}.mp4`);
      let downloadedFilePath: string | null = null;

      try {
        // 2. Download video 480p via yt-dlp
        console.log(`[YTHTML] Downloading video ${song.id}...`);
        const downloaded = await downloadVideo(song.id, cacheDir);
        downloadedFilePath = downloaded.filePath;

        // Validasi ukuran maksimal
        if (downloaded.fileSize > maxMb * 1024 * 1024) {
          await reply(`❌ Ukuran video (${(downloaded.fileSize / 1024 / 1024).toFixed(1)} MB) melebihi batas maksimal ${maxMb} MB.`);
          return;
        }

        // 3. Daftarkan file ke API (/api/pv/register) dengan TTL 5 menit
        const apiInternalUrl = process.env.API_URL || "http://api:3000";
        const internalToken = process.env.INTERNAL_TOKEN || "secret";

        console.log(`[YTHTML] Registering session to API ${apiInternalUrl}/api/pv/register...`);
        const regRes = await fetch(`${apiInternalUrl}/api/pv/register`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-token": internalToken
          },
          body: JSON.stringify({
            id: pvId,
            filePath: downloaded.filePath,
            title: song.title,
            channel: song.channel,
            duration: song.duration
          })
        });

        if (!regRes.ok) {
          throw new Error(`API registration failed with status ${regRes.status}`);
        }

        // 4. Jalankan script perekam headless
        const recordScript = resolve(process.cwd(), "scripts/record.mjs");
        const targetPageUrl = `${apiInternalUrl}/pv/${pvId}`;
        const recordDurationSec = Math.min(60, Math.max(10, song.duration + 5));

        console.log(`[YTHTML] Running recorder script on ${targetPageUrl}...`);
        const recResult = await runCommand("/usr/bin/node", [
          recordScript,
          targetPageUrl,
          recDir,
          String(recordDurationSec)
        ]);

        if (recResult.code !== 0) {
          console.error("[YTHTML] Recorder stderr:", recResult.stderr);
          throw new Error(`Recorder exited with code ${recResult.code}: ${recResult.stderr.slice(0, 150)}`);
        }

        // 5. Cari file webm hasil rekaman
        if (!existsSync(recDir)) {
          throw new Error("Recording directory not found");
        }

        const files = readdirSync(recDir).filter((f) => f.endsWith(".webm"));
        if (files.length === 0) {
          throw new Error("No webm recording file found in output directory");
        }
        const recordedWebmPath = join(recDir, files[0]);

        // 6. Konversi & Mux audio asli via ffmpeg
        console.log(`[YTHTML] Muxing video and audio with ffmpeg...`);
        const ffmpegArgs = [
          "-y",
          "-i", recordedWebmPath,
          "-i", downloaded.filePath,
          "-map", "0:v",
          "-map", "1:a",
          "-c:v", "libx264",
          "-pix_fmt", "yuv420p",
          "-movflags", "+faststart",
          "-c:a", "aac",
          "-shortest",
          finalMp4
        ];

        const ffResult = await runCommand("ffmpeg", ffmpegArgs);
        if (ffResult.code !== 0 || !existsSync(finalMp4)) {
          console.error("[YTHTML] ffmpeg error:", ffResult.stderr);
          throw new Error(`FFmpeg failed with code ${ffResult.code}: ${ffResult.stderr.slice(0, 150)}`);
        }

        // 7. Kirim video MP4 langsung ke chat WhatsApp
        const fileSize = statSync(finalMp4).size;
        console.log(`[YTHTML] Sending MP4 video (${fileSize} bytes) to WhatsApp...`);

        const contextInfo: any = {};
        if (settings.newsletterJid) {
          contextInfo.forwardedNewsletterMessageInfo = {
            newsletterJid: settings.newsletterJid,
            newsletterName: settings.channelName || settings.botName,
            serverMessageId: -1
          };
          contextInfo.isForwarded = true;
        }

        await sock.sendMessage(from, {
          video: readFileSync(finalMp4),
          mimetype: "video/mp4",
          fileName: `${song.title}.mp4`,
          caption:
            `🎬 *${song.title}*\n` +
            `👤 ${song.channel} | ⏱️ ${formatDuration(song.duration)}\n\n` +
            `_NOW PLAYING VIDEO (HTML WebSocket Recording)_`,
          contextInfo: Object.keys(contextInfo).length ? contextInfo : undefined
        } as any, { quoted: msg });

        console.log("[YTHTML] Video successfully sent to WhatsApp!");
      } catch (err: any) {
        console.error("[YTHTML] Job failed:", err);
        // Error handling ramah, tidak membocorkan path server
        let friendlyMsg = "Terjadi kendala saat merekam video player. Silakan coba beberapa saat lagi.";
        if (err?.message?.includes("API registration failed")) {
          friendlyMsg = "Gagal menghubungkan sesi pemutar ke API internal.";
        } else if (err?.message?.includes("Recorder exited")) {
          friendlyMsg = "Waktu perekaman habis atau halaman pemutar tidak merespons.";
        } else if (err?.message?.includes("FFmpeg failed")) {
          friendlyMsg = "Gagal memproses penggabungan audio dan render MP4.";
        }
        await reply(`❌ Gagal memproses .ythtml:\n${friendlyMsg}`);
      } finally {
        // 8. Bersihkan semua file sementara (tidak ada file sisa di data/)
        try {
          if (existsSync(recDir)) rmSync(recDir, { recursive: true, force: true });
          if (existsSync(finalMp4)) unlinkSync(finalMp4);
          if (downloadedFilePath && existsSync(downloadedFilePath)) unlinkSync(downloadedFilePath);
        } catch (cleanErr) {
          console.warn("[YTHTML] Cleanup warning:", cleanErr);
        }
      }
    };

    if (isRecordingActive) {
      recordingQueue.push(executeJob);
    } else {
      isRecordingActive = true;
      executeJob().finally(() => {
        isRecordingActive = false;
        processNextRecording();
      });
    }
  }
});
