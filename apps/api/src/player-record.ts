export function renderRecordPlayerPage(id: string): string {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=540, height=960, initial-scale=1.0, user-scalable=no">
  <title>NOW PLAYING VIDEO</title>
  <style>
    :root {
      --bg: #070a0d;
      --card-bg: #0f151b;
      --card-border: #1b2631;
      --cyan: #00e5ff;
      --cyan-dim: rgba(0, 229, 255, 0.15);
      --green: #10b981;
      --yellow: #f59e0b;
      --yellow-bg: rgba(245, 158, 11, 0.18);
      --text: #f1f5f9;
      --muted: #8496aa;
      --dark-box: #04070a;
    }
    * { margin:0; padding:0; box-sizing:border-box; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      width: 540px;
      height: 960px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    .wrapper {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      gap: 16px;
      justify-content: center;
    }
    .card {
      background: var(--card-bg);
      border: 1.5px solid var(--card-border);
      border-radius: 18px;
      padding: 16px 18px;
      box-shadow: 0 12px 35px rgba(0,0,0,0.7);
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    /* CARD 1: NOW PLAYING VIDEO */
    .header-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--card-border);
      padding-bottom: 8px;
    }
    .now-playing-label {
      font-size: 0.85rem;
      font-weight: 800;
      letter-spacing: 0.08em;
      color: var(--cyan);
      display: flex;
      align-items: center;
      gap: 6px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    .sound-icon { font-size: 1rem; color: var(--muted); }
    .marquee-title {
      font-size: 0.74rem;
      color: var(--muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    .video-viewport {
      position: relative;
      width: 100%;
      aspect-ratio: 16/9;
      background: #000;
      border-radius: 12px;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid rgba(255,255,255,0.08);
    }
    video {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .meta-row {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .video-title {
      font-size: 1.05rem;
      font-weight: 700;
      line-height: 1.3;
      color: #fff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .platform-tag {
      font-size: 0.75rem;
      color: var(--cyan);
      font-weight: 700;
      font-family: ui-monospace, monospace;
    }
    .timeline-wrap {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    .timeline-bar {
      width: 100%;
      height: 6px;
      background: #1c2732;
      border-radius: 3px;
      position: relative;
    }
    .timeline-fill {
      position: absolute;
      left: 0; top: 0; bottom: 0;
      background: var(--cyan);
      border-radius: 3px;
      width: 0%;
    }
    .timeline-knob {
      position: absolute;
      top: 50%;
      transform: translate(-50%, -50%);
      left: 0%;
      width: 14px;
      height: 14px;
      background: #fff;
      border: 2.5px solid var(--cyan);
      border-radius: 50%;
      box-shadow: 0 0 10px var(--cyan);
    }
    .time-labels {
      display: flex;
      justify-content: space-between;
      font-size: 0.75rem;
      color: var(--muted);
      font-family: ui-monospace, monospace;
    }
    .ctrl-row {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 26px;
      padding: 4px 0;
    }
    .ctrl-btn {
      background: none;
      border: none;
      color: var(--text);
      font-size: 1.35rem;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      border-radius: 50%;
    }
    .play-circle {
      width: 54px;
      height: 54px;
      background: var(--cyan);
      color: #000;
      border-radius: 50%;
      font-size: 1.45rem;
      font-weight: 800;
      box-shadow: 0 0 18px rgba(0, 229, 255, 0.45);
    }
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
      font-size: 0.8rem;
      padding: 4px 10px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      gap: 6px;
      font-family: ui-monospace, monospace;
    }
    .vol-box {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .vol-box input {
      width: 85px;
      height: 5px;
      accent-color: var(--cyan);
    }

    /* CARD 2: WEBSOCKET VIDEO */
    .ws-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .ws-title {
      font-size: 0.88rem;
      font-weight: 800;
      color: #38bdf8;
      font-family: ui-monospace, monospace;
      letter-spacing: 0.05em;
    }
    .status-badge {
      background: var(--yellow-bg);
      color: var(--yellow);
      border: 1px solid var(--yellow);
      font-size: 0.72rem;
      font-weight: 800;
      padding: 4px 10px;
      border-radius: 4px;
      font-family: ui-monospace, monospace;
      letter-spacing: 0.05em;
    }
    .status-badge.complete {
      background: rgba(16, 185, 129, 0.2);
      color: #10b981;
      border-color: #10b981;
    }

    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      background: var(--dark-box);
      border: 1px solid var(--card-border);
      border-radius: 10px;
      padding: 10px 12px;
      font-family: ui-monospace, monospace;
    }
    .metric-cell {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .metric-name {
      font-size: 0.68rem;
      color: var(--muted);
    }
    .metric-val {
      font-size: 0.84rem;
      font-weight: 700;
      color: var(--text);
    }

    .ws-progress-wrap {
      width: 100%;
      height: 7px;
      background: var(--dark-box);
      border: 1px solid var(--card-border);
      border-radius: 4px;
      overflow: hidden;
    }
    .ws-progress-bar {
      height: 100%;
      width: 0%;
      background: linear-gradient(90deg, #0284c7, var(--cyan), #10b981);
      transition: width 0.1s linear;
    }

    .console-window {
      background: var(--dark-box);
      border: 1px solid var(--card-border);
      border-radius: 10px;
      padding: 10px 12px;
      height: 135px;
      overflow-y: hidden;
      font-family: ui-monospace, monospace;
      font-size: 0.74rem;
      display: flex;
      flex-direction: column;
      gap: 3px;
      color: #22d3ee;
    }
    .console-line { line-height: 1.35; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .console-line.success { color: #4ade80; }
    .console-line.dim { color: #64748b; }
  </style>
</head>
<body>
  <div class="wrapper">
    <!-- CARD 1 -->
    <div class="card">
      <div class="header-bar">
        <div class="now-playing-label">
          <span>●</span> NOW PLAYING VIDEO
        </div>
        <div class="sound-icon">🔊</div>
      </div>
      <div class="marquee-title" id="marquee">Menginisialisasi player...</div>

      <div class="video-viewport">
        <video id="player" playsinline webkit-playsinline muted preload="auto"></video>
      </div>

      <div class="meta-row">
        <div class="video-title" id="song-title">Memuat video...</div>
        <div class="platform-tag">YouTube</div>
      </div>

      <div class="timeline-wrap">
        <div class="timeline-bar">
          <div class="timeline-fill" id="t-fill"></div>
          <div class="timeline-knob" id="t-knob"></div>
        </div>
        <div class="time-labels">
          <span id="cur-time">0:00</span>
          <span id="dur-time">0:00</span>
        </div>
      </div>

      <div class="ctrl-row">
        <div class="ctrl-btn">|◀◀</div>
        <div class="ctrl-btn play-circle" id="btn-play">❚❚</div>
        <div class="ctrl-btn">▶▶|</div>
      </div>

      <div class="sub-ctrl-row">
        <div class="loop-toggle">
          <span>🔁</span> Loop: <b>OFF</b>
        </div>
        <div class="vol-box">
          <span style="font-size:0.8rem">🔈</span>
          <input type="range" min="0" max="100" value="85">
        </div>
      </div>
    </div>

    <!-- CARD 2 -->
    <div class="card">
      <div class="ws-header">
        <div class="ws-title">WEBSOCKET VIDEO</div>
        <div class="status-badge" id="status-badge">DOWNLOADING</div>
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

      <div class="console-window" id="console-log"></div>
    </div>
  </div>

  <script>
    // Signals for headless recorder
    window.__playerReady = false;
    window.__videoEnded = false;

    const TOKEN = "${id}";
    const API = location.origin;
    const WS_PROTO = location.protocol === "https:" ? "wss://" : "ws://";
    const WS_URL = WS_PROTO + location.host + "/ws/pv/" + TOKEN;

    const player = document.getElementById("player");
    const songTitle = document.getElementById("song-title");
    const marquee = document.getElementById("marquee");
    const tFill = document.getElementById("t-fill");
    const tKnob = document.getElementById("t-knob");
    const curTime = document.getElementById("cur-time");
    const durTime = document.getElementById("dur-time");
    const btnPlay = document.getElementById("btn-play");

    const statusBadge = document.getElementById("status-badge");
    const mDown = document.getElementById("m-down");
    const mTotal = document.getElementById("m-total");
    const mProg = document.getElementById("m-prog");
    const mChunks = document.getElementById("m-chunks");
    const wsProgBar = document.getElementById("ws-prog-bar");
    const consoleLog = document.getElementById("console-log");

    let chunks = [];
    let downloadedBytes = 0;
    let totalBytesExpected = 0;
    let chunkCount = 0;

    function log(msg, cls = "") {
      const line = document.createElement("div");
      line.className = "console-line " + cls;
      line.textContent = msg;
      consoleLog.appendChild(line);
      while (consoleLog.children.length > 7) {
        consoleLog.removeChild(consoleLog.firstChild);
      }
    }

    function fmt(sec) {
      if (!sec || isNaN(sec)) return "0:00";
      const m = Math.floor(sec / 60);
      const s = Math.floor(sec % 60);
      return m + ":" + String(s).padStart(2, "0");
    }

    player.ontimeupdate = () => {
      if (!player.duration) return;
      const pct = (player.currentTime / player.duration) * 100;
      tFill.style.width = pct + "%";
      tKnob.style.left = pct + "%";
      curTime.textContent = fmt(player.currentTime);
      durTime.textContent = fmt(player.duration);
    };

    player.onended = () => {
      window.__videoEnded = true;
      btnPlay.textContent = "▶";
    };

    async function init() {
      try {
        const res = await fetch(API + "/api/pv/info/" + TOKEN);
        const data = await res.json();
        if (data.title) {
          songTitle.textContent = data.title;
          marquee.textContent = data.title + " • " + (data.channel || "YouTube");
          durTime.textContent = fmt(data.duration);
        }
      } catch {}

      startWebSocket();
    }

    function startWebSocket() {
      let ws;
      try {
        ws = new WebSocket(WS_URL);
        ws.binaryType = "arraybuffer";
      } catch (err) {
        log("WebSocket creation failed", "dim");
        return;
      }

      ws.onmessage = (event) => {
        if (typeof event.data === "string") {
          if (event.data === "END") {
            log("END", "dim");
            log("Download complete", "success");
            finishBlob();
            ws.close();
          } else if (event.data.startsWith("TOTAL:")) {
            totalBytesExpected = Number(event.data.split(":")[1]) || 0;
            mTotal.textContent = (totalBytesExpected / 1024 / 1024).toFixed(2) + " MB";
          }
          return;
        }

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
        }
      };

      ws.onerror = () => {
        log("WebSocket error", "dim");
      };
    }

    function finishBlob() {
      const blob = new Blob(chunks, { type: "video/mp4" });
      const sizeMb = (blob.size / 1024 / 1024).toFixed(2);
      mTotal.textContent = sizeMb + " MB";
      mDown.textContent = sizeMb + " MB";
      mProg.textContent = "100.0%";
      wsProgBar.style.width = "100%";
      statusBadge.textContent = "COMPLETE";
      statusBadge.className = "status-badge complete";

      log("Blob created (" + sizeMb + " MB)", "success");
      log("Video source attached", "success");
      log("Player ready", "success");

      const videoUrl = URL.createObjectURL(blob);
      player.src = videoUrl;
      player.muted = true; // Muted for autoplay
      player.play().then(() => {
        window.__playerReady = true;
        btnPlay.textContent = "❚❚";
      }).catch(() => {
        window.__playerReady = true;
      });
    }

    init();
  </script>
</body>
</html>`;
}
