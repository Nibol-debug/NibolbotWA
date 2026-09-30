import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const targetUrl = process.argv[2];
const outputDir = process.argv[3];
const maxDurationSec = Math.min(60, Math.max(5, Number(process.argv[4]) || 30));

if (!targetUrl || !outputDir) {
  console.error("Usage: node record.mjs <targetUrl> <outputDir> [maxDurationSec]");
  process.exit(1);
}

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

console.log(`[RECORDER] Target: ${targetUrl} | Max duration: ${maxDurationSec}s | Dir: ${outputDir}`);

let browser = null;
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium-browser",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--use-gl=swiftshader",
      "--disable-gpu",
      "--mute-audio"
    ]
  });

  const context = await browser.newContext({
    recordVideo: {
      dir: outputDir,
      size: { width: 540, height: 960 }
    },
    viewport: { width: 540, height: 960 },
    deviceScaleFactor: 1
  });

  const page = await context.newPage();
  console.log(`[RECORDER] Navigating to ${targetUrl}...`);
  await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 20000 });

  // 1. Wait for player ready signal
  console.log("[RECORDER] Waiting for window.__playerReady...");
  const readyStart = Date.now();
  let playerReady = false;
  while (Date.now() - readyStart < 15000) {
    playerReady = await page.evaluate(() => !!window.__playerReady).catch(() => false);
    if (playerReady) break;
    await new Promise((r) => setTimeout(r, 200));
  }

  if (playerReady) {
    console.log("[RECORDER] window.__playerReady detected! Recording video playback...");
  } else {
    console.warn("[RECORDER] window.__playerReady timed out, recording anyway...");
  }

  // 2. Record video playback
  const playStart = Date.now();
  const maxMs = maxDurationSec * 1000;
  while (Date.now() - playStart < maxMs) {
    const isEnded = await page.evaluate(() => !!window.__videoEnded).catch(() => false);
    if (isEnded) {
      console.log("[RECORDER] window.__videoEnded detected!");
      break;
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  // Grace period so final frame lands
  await new Promise((r) => setTimeout(r, 500));

  await page.close();
  await context.close();
  await browser.close();
  browser = null;

  console.log("[RECORDER] Recording complete and saved to:", outputDir);
  process.exit(0);
} catch (err) {
  console.error("[RECORDER] Error:", err?.message || err);
  if (browser) {
    try {
      await browser.close();
    } catch {}
  }
  process.exit(1);
}
