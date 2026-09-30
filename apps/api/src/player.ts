export function renderPlayerPage(id: string): string {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <title>Lyric's Md - In-App Video Player</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #070a0d;
      --card-bg: #0f151b;
      --card-border: #1b2631;
      --cyan: #00e5ff;
      --cyan-dim: rgba(0, 229, 255, 0.12);
      --green: #10b981;
      --yellow: #f59e0b;
      --yellow-bg: rgba(245, 158, 11, 0.15);
      --text: #f1f5f9;
      --muted: #94a3b8;
      --dark-box: #05080b;
    }
    * { margin:0; padding:0; box-sizing:border-box; -webkit-tap-highlight-color: transparent; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
      min-height: 100vh;
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 12px 14px 28px;
    }
    .container {
      width: 100%;
      max-width: 480px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      padding: 14px 16px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.6);
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    /* CARD 1: NOW PLAYING */
    .header-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--card-border);
      padding-bottom: 8px;
    }
    .now-playing-label {
      font-size: 0.8rem;
      font-weight: 800;
      letter-spacing: 0.08em;
      color: var(--cyan);
      display: flex;
      align-items: center;
      gap: 6px;
      font-family: 'JetBrains Mono', monospace;
    }
    .sound-icon { font-size: 0.95rem; color: var(--muted); }
    .marquee-title {
      font-size: 0.72rem;
      color: var(--muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-family: 'JetBrains Mono', monospace;
      margin-top: -4px;
    }
    .video-viewport {
      position: relative;
      width: 100%;
      aspect-ratio: 16/9;
      background: #000;
      border-radius: 10px;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid rgba(255,255,255,0.06);
    }
    video {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .poster-img {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      opacity: 0.6;
    }
    .play-overlay-btn {
      position: absolute;
      width: 58px;
      height: 58px;
      border-radius: 50%;
      background: rgba(0, 229, 255, 0.9);
      color: #000;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.5rem;
      border: 3px solid #fff;
      cursor: pointer;
      box-shadow: 0 4px 20px rgba(0, 229, 255, 0.4);
      z-index: 10;
      transition: transform 0.1s;
    }
    .play-overlay-btn:active { transform: scale(0.92); }
    .play-overlay-btn.hidden { display: none; }
    .meta-row {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .video-title {
      font-size: 0.98rem;
      font-weight: 700;
      line-height: 1.3;
      color: #fff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .platform-tag {
      font-size: 0.72rem;
      color: var(--cyan);
      font-weight: 600;
      font-family: 'JetBrains Mono', monospace;
    }
    /* Timeline seeker */
    .timeline-wrap {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .timeline-bar {
      width: 100%;
      height: 5px;
      background: #202b36;
      border-radius: 3px;
      position: relative;
      cursor: pointer;
    }
    .timeline-fill {
      position: absolute;
      left: 0; top: 0; bottom: 0;
      background: var(--cyan);
      border-radius: 3px;
      width: 0%;
      pointer-events: none;
    }
    .timeline-knob {
      position: absolute;
      top: 50%;
      transform: translate(-50%, -50%);
      left: 0%;
      width: 12px;
      height: 12px;
      background: #fff;
      border: 2px solid var(--cyan);
      border-radius: 50%;
      box-shadow: 0 0 8px var(--cyan);
      pointer-events: none;
    }
    .time-labels {
      display: flex;
      justify-content: space-between;
      font-size: 0.72rem;
      color: var(--muted);
      font-family: 'JetBrains Mono', monospace;
    }
    /* Main controls */
    .ctrl-row {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 24px;
      padding: 2px 0;
    }
    .ctrl-btn {
      background: none;
      border: none;
      color: var(--text);
      font-size: 1.3rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      transition: background 0.15s;
    }
    .ctrl-btn:active { background: rgba(255,255,255,0.1); }
    .play-circle {
      width: 52px;
      height: 52px;
      background: var(--cyan);
      color: #000;
      border-radius: 50%;
      font-size: 1.4rem;
      font-weight: 800;
      box-shadow: 0 0 16px rgba(0, 229, 255, 0.4);
    }
    .play-circle:active { transform: scale(0.94); }
    /* Sub controls */
    .sub-ctrl-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-top: 6px;
      border-top: 1px solid var(--card-border);
    }
    .loop-toggle {
      background: none;
      border: 1px solid var(--card-border);
      color: var(--muted);
      font-size: 0.85rem;
      padding: 4px 10px;
      border-radius: 6px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      font-family: 'JetBrains Mono', monospace;
    }
    .loop-toggle.active {
      color: var(--cyan);
      border-color: var(--cyan);
      background: var(--cyan-dim);
    }
    .vol-box {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .vol-box input {
      width: 80px;
      height: 4px;
      accent-color: var(--cyan);
      cursor: pointer;
    }

    /* CARD 2: WEBSOCKET VIDEO */
    .ws-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .ws-title {
      font-size: 0.82rem;
      font-weight: 800;
      color: #38bdf8;
      font-family: 'JetBrains Mono', monospace;
      letter-spacing: 0.05em;
    }
    .status-badge {
      background: var(--yellow-bg);
      color: var(--yellow);
      border: 1px solid var(--yellow);
      font-size: 0.68rem;
      font-weight: 800;
      padding: 3px 8px;
      border-radius: 4px;
      font-family: 'JetBrains Mono', monospace;
      letter-spacing: 0.05em;
    }
    .status-badge.streaming {
      background: var(--cyan-dim);
      color: var(--cyan);
      border-color: var(--cyan);
    }
    .status-badge.complete {
      background: rgba(16, 185, 129, 0.15);
      color: #10b981;
      border-color: #10b981;
    }

    /* Grid 3x2 */
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 6px;
      background: var(--dark-box);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 8px 10px;
      font-family: 'JetBrains Mono', monospace;
    }
    .metric-cell {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .metric-name {
      font-size: 0.65rem;
      color: var(--muted);
    }
    .metric-val {
      font-size: 0.78rem;
      font-weight: 700;
      color: var(--text);
    }

    /* Stream Progress bar */
    .ws-progress-wrap {
      width: 100%;
      height: 6px;
      background: var(--dark-box);
      border: 1px solid var(--card-border);
      border-radius: 3px;
      overflow: hidden;
    }
    .ws-progress-bar {
      height: 100%;
      width: 0%;
      background: linear-gradient(90deg, #0284c7, var(--cyan), #10b981);
      transition: width 0.15s ease-out;
    }

    /* Terminal Console Window */
    .console-window {
      background: var(--dark-box);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 8px 10px;
      height: 110px;
      overflow-y: auto;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.68rem;
      display: flex;
      flex-direction: column;
      gap: 2px;
      color: #22d3ee;
    }
    .console-line {
      line-height: 1.35;
      word-break: break-all;
    }
    .console-line.success { color: #4ade80; }
    .console-line.dim { color: #64748b; }
    .console-line.warn { color: #fbbf24; }
  </style>
</head>
<body>
  <div class="container">
    <!-- CARD 1: NOW PLAYING VIDEO -->
    <div class="card">
      <div class="header-bar">
        <div class="now-playing-label">
          <span>●</span> NOW PLAYING VIDEO
        </div>
        <div class="sound-icon">🔊</div>
      </div>
      <div class="marquee-title" id="marquee">Memuat video info...</div>

      <div class="video-viewport">
        <img id="poster" class="poster-img" src="" alt="" style="display:none;">
        <video id="player" playsinline webkit-playsinline preload="auto"></video>
        <button class="play-overlay-btn" id="overlay-btn">▶</button>
      </div>

      <div class="meta-row">
        <div class="video-title" id="song-title">Memuat judul...</div>
        <div class="platform-tag">YouTube</div>
      </div>

      <div class="timeline-wrap">
        <div class="timeline-bar" id="timeline">
          <div class="timeline-fill" id="t-fill"></div>
          <div class="timeline-knob" id="t-knob"></div>
        </div>
        <div class="time-labels">
          <span id="cur-time">0:00</span>
          <span id="dur-time">0:00</span>
        </div>
      </div>

      <div class="ctrl-row">
        <button class="ctrl-btn" id="btn-prev" title="Mundur 10d">|◀◀</button>
        <button class="ctrl-btn play-circle" id="btn-play" title="Play / Pause">▶</button>
        <button class="ctrl-btn" id="btn-next" title="Maju 10d">▶▶|</button>
      </div>

      <div class="sub-ctrl-row">
        <button class="loop-toggle" id="btn-loop">
          <span>🔁</span> Loop: <b id="loop-state">OFF</b>
        </button>
        <div class="vol-box">
          <span style="font-size:0.8rem">🔈</span>
          <input type="range" id="vol-slider" min="0" max="100" value="85">
        </div>
      </div>
    </div>

    <!-- CARD 2: WEBSOCKET VIDEO -->
    <div class="card">
      <div class="ws-header">
        <div class="ws-title">WEBSOCKET VIDEO</div>
        <div class="status-badge" id="status-badge">CONNECTING</div>
      </div>

      <div class="metrics-grid">
        <div class="metric-cell">
          <div class="metric-name">MIME</div>
          <div class="metric-val" id="m-mime">video/mp4</div>
        </div>
        <div class="metric-cell">
          <div class="metric-name">Downloaded</div>
          <div class="metric-val" id="m-down">0.00 MB</div>
        </div>
        <div class="metric-cell">
          <div class="metric-name">Total</div>
          <div class="metric-val" id="m-total">0.00 MB</div>
        </div>
        <div class="metric-cell">
          <div class="metric-name">Progress</div>
          <div class="metric-val" id="m-prog">0.0%</div>
        </div>
        <div class="metric-cell">
          <div class="metric-name">Chunks</div>
          <div class="metric-val" id="m-chunks">0</div>
        </div>
        <div class="metric-cell">
          <div class="metric-name">Loop</div>
          <div class="metric-val" id="m-loop">OFF</div>
        </div>
      </div>

      <div class="ws-progress-wrap">
        <div class="ws-progress-bar" id="ws-prog-bar"></div>
      </div>

      <div class="console-window" id="console-log">
        <div class="console-line dim">[SYS] Initializing WebSocket client...</div>
      </div>
    </div>
  </div>

  <script>
    const TOKEN = "${id}";
    const API = location.origin;
    const WS_PROTO = location.protocol === "https:" ? "wss://" : "ws://";
    const WS_URL = WS_PROTO + location.host + "/ws/stream/" + TOKEN;

    const player = document.getElementById("player");
    const overlayBtn = document.getElementById("overlay-btn");
    const btnPlay = document.getElementById("btn-play");
    const btnPrev = document.getElementById("btn-prev");
    const btnNext = document.getElementById("btn-next");
    const btnLoop = document.getElementById("btn-loop");
    const loopState = document.getElementById("loop-state");
    const volSlider = document.getElementById("vol-slider");

    const tFill = document.getElementById("t-fill");
    const tKnob = document.getElementById("t-knob");
    const timeline = document.getElementById("timeline");
    const curTime = document.getElementById("cur-time");
    const durTime = document.getElementById("dur-time");
    const songTitle = document.getElementById("song-title");
    const marquee = document.getElementById("marquee");
    const poster = document.getElementById("poster");

    const statusBadge = document.getElementById("status-badge");
    const mMime = document.getElementById("m-mime");
    const mDown = document.getElementById("m-down");
    const mTotal = document.getElementById("m-total");
    const mProg = document.getElementById("m-prog");
    const mChunks = document.getElementById("m-chunks");
    const mLoop = document.getElementById("m-loop");
    const wsProgBar = document.getElementById("ws-prog-bar");
    const consoleLog = document.getElementById("console-log");

    let isLooping = false;
    let chunks = [];
    let downloadedBytes = 0;
    let totalBytesExpected = 0;
    let chunkCount = 0;

    function log(msg, type = "") {
      const line = document.createElement("div");
      line.className = "console-line " + type;
      line.textContent = msg;
      consoleLog.appendChild(line);
      consoleLog.scrollTop = consoleLog.scrollHeight;
    }

    function fmt(sec) {
      if (!sec || isNaN(sec)) return "0:00";
      const m = Math.floor(sec / 60);
      const s = Math.floor(sec % 60);
      return m + ":" + String(s).padStart(2, "0");
    }

    // Controls listeners
    function togglePlay() {
      if (player.paused) {
        player.play().then(() => {
          btnPlay.textContent = "❚❚";
          overlayBtn.classList.add("hidden");
        }).catch(err => {
          log("Play error: " + err.message, "warn");
        });
      } else {
        player.pause();
        btnPlay.textContent = "▶";
        overlayBtn.classList.remove("hidden");
      }
    }

    btnPlay.onclick = togglePlay;
    overlayBtn.onclick = togglePlay;
    player.onclick = togglePlay;

    btnPrev.onclick = () => { player.currentTime = Math.max(0, player.currentTime - 10); };
    btnNext.onclick = () => { player.currentTime = Math.min(player.duration || 9999, player.currentTime + 10); };

    btnLoop.onclick = () => {
      isLooping = !isLooping;
      player.loop = isLooping;
      loopState.textContent = isLooping ? "ON" : "OFF";
      mLoop.textContent = isLooping ? "ON" : "OFF";
      btnLoop.classList.toggle("active", isLooping);
    };

    volSlider.oninput = () => {
      player.volume = volSlider.value / 100;
    };

    // Timeline updates
    player.ontimeupdate = () => {
      if (!player.duration) return;
      const pct = (player.currentTime / player.duration) * 100;
      tFill.style.width = pct + "%";
      tKnob.style.left = pct + "%";
      curTime.textContent = fmt(player.currentTime);
      durTime.textContent = fmt(player.duration);
    };

    timeline.onclick = (e) => {
      if (!player.duration) return;
      const rect = timeline.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      player.currentTime = pct * player.duration;
    };

    player.onended = () => {
      if (!isLooping) {
        btnPlay.textContent = "▶";
        overlayBtn.classList.remove("hidden");
      }
    };

    // 1. Fetch metadata first
    async function init() {
      try {
        log("[INFO] Fetching player metadata...");
        const res = await fetch(API + "/api/player/" + TOKEN);
        const data = await res.json();
        if (data.error) {
          log("[ERR] " + data.error, "warn");
          songTitle.textContent = "Error: " + data.error;
          marquee.textContent = "Token kedaluwarsa atau tidak valid";
          statusBadge.textContent = "ERROR";
          statusBadge.style.color = "#f43f5e";
          return;
        }

        songTitle.textContent = data.title;
        marquee.textContent = data.title + " • " + data.channel;
        durTime.textContent = fmt(data.duration);
        if (data.thumbnail) {
          poster.src = data.thumbnail;
          poster.style.display = "block";
        }

        log("[OK] Metadata: " + data.title, "success");
        connectWebSocket(data);
      } catch (err) {
        log("[ERR] Metadata fetch failed: " + err.message, "warn");
        startHttpFallback();
      }
    }

    // 2. Connect WebSocket Stream
    function connectWebSocket(info) {
      statusBadge.textContent = "CONNECTING";
      statusBadge.className = "status-badge";
      log("[WS] Connecting to: " + WS_URL, "dim");

      let ws;
      try {
        ws = new WebSocket(WS_URL);
        ws.binaryType = "arraybuffer";
      } catch (e) {
        log("[WS] Failed to create WebSocket, fallback to HTTP", "warn");
        startHttpFallback();
        return;
      }

      ws.onopen = () => {
        statusBadge.textContent = "STREAMING";
        statusBadge.className = "status-badge streaming";
        log("[WS] Connected successfully", "success");
        log("[INFO] Requesting video stream: " + info.videoId);
      };

      ws.onmessage = (event) => {
        if (typeof event.data === "string") {
          if (event.data === "END") {
            log("END", "dim");
            log("Download complete", "success");
            finishBlobDownload();
            ws.close();
          } else if (event.data.startsWith("TOTAL:")) {
            totalBytesExpected = Number(event.data.split(":")[1]) || 0;
            mTotal.textContent = (totalBytesExpected / 1024 / 1024).toFixed(2) + " MB";
          } else {
            log(event.data);
          }
          return;
        }

        // Binary chunk received
        const chunk = new Uint8Array(event.data);
        chunks.push(chunk);
        chunkCount++;
        downloadedBytes += chunk.byteLength;

        const kb = (chunk.byteLength / 1024).toFixed(2);
        log("Binary chunk: " + kb + " KB");

        const mb = (downloadedBytes / 1024 / 1024).toFixed(2);
        mDown.textContent = mb + " MB";
        mChunks.textContent = chunkCount;

        if (totalBytesExpected > 0) {
          const pct = Math.min(100, (downloadedBytes / totalBytesExpected) * 100);
          mProg.textContent = pct.toFixed(1) + "%";
          wsProgBar.style.width = pct + "%";
        } else {
          // If total unknown, estimate progress
          const fakePct = Math.min(98, chunkCount * 0.35);
          mProg.textContent = fakePct.toFixed(1) + "%";
          wsProgBar.style.width = fakePct + "%";
        }
      };

      ws.onerror = (e) => {
        log("[WS] Error encountered, fallback to HTTP stream", "warn");
        if (chunks.length === 0) {
          startHttpFallback();
        }
      };

      ws.onclose = () => {
        if (chunks.length > 0 && statusBadge.textContent !== "COMPLETE") {
          finishBlobDownload();
        }
      };
    }

    function finishBlobDownload() {
      const blob = new Blob(chunks, { type: "video/mp4" });
      const sizeMb = (blob.size / 1024 / 1024).toFixed(2);
      mTotal.textContent = sizeMb + " MB";
      mDown.textContent = sizeMb + " MB";
      mProg.textContent = "100.0%";
      wsProgBar.style.width = "100%";
      statusBadge.textContent = "COMPLETE";
      statusBadge.className = "status-badge complete";

      log("Blob created (" + sizeMb + " MB)", "success");

      const videoUrl = URL.createObjectURL(blob);
      player.src = videoUrl;
      poster.style.display = "none";
      log("Video source attached", "success");
      log("Player ready", "success");

      player.play().then(() => {
        btnPlay.textContent = "❚❚";
        overlayBtn.classList.add("hidden");
      }).catch(() => {
        // Mobile autoplay policy, requires user click
      });
    }

    function startHttpFallback() {
      log("[FALLBACK] Using direct HTTP range stream...", "warn");
      statusBadge.textContent = "HTTP STREAM";
      statusBadge.className = "status-badge streaming";
      player.src = API + "/stream/" + TOKEN;
      poster.style.display = "none";
      log("Player attached via /stream/" + TOKEN, "success");
      log("Player ready", "success");
    }

    init();
  </script>
</body>
</html>`;
}
