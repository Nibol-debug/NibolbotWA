export function renderPlayerPage(id: string): string {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Nibolbot Web Player</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --green: #10b981;
      --green-dark: #064e3b;
      --green-light: #d1fae5;
      --green-hover: #059669;
      --border: #0d1f14;
      --bg: #f4fbf7;
      --shadow: 5px 5px 0px #0d1f14;
      --shadow-sm: 3px 3px 0px #0d1f14;
      --shadow-btn: 2px 2px 0px #0d1f14;
    }
    * { margin:0; padding:0; box-sizing:border-box; -webkit-tap-highlight-color: transparent; }
    body {
      font-family: 'Space Grotesk', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--border);
      min-height: 100vh;
      min-height: 100dvh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.25rem 1rem;
    }
    .player {
      background: #ffffff;
      border: 3px solid var(--border);
      border-radius: 16px;
      box-shadow: var(--shadow);
      max-width: 440px;
      width: 100%;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .cover-wrap {
      position: relative;
      width: 100%;
      aspect-ratio: 16/9;
      background: #000;
      border-bottom: 3px solid var(--border);
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    video {
      width: 100%;
      height: 100%;
      object-fit: contain;
      display: block;
      background: #000;
    }
    .cover-badge {
      position: absolute;
      top: 12px;
      left: 12px;
      font-size: 0.72rem;
      font-weight: 800;
      background: var(--green);
      color: #fff;
      border: 2px solid var(--border);
      padding: 4px 10px;
      border-radius: 6px;
      box-shadow: var(--shadow-sm);
      letter-spacing: 0.05em;
      z-index: 2;
    }
    .play-overlay {
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.45);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 3;
      cursor: pointer;
      transition: opacity 0.2s;
    }
    .play-overlay.hidden { display: none; }
    .overlay-circle {
      width: 70px;
      height: 70px;
      background: var(--green);
      color: #fff;
      border: 3px solid var(--border);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 2rem;
      box-shadow: var(--shadow);
      animation: pulse 1.8s infinite;
    }
    @keyframes pulse {
      0% { transform: scale(1); }
      50% { transform: scale(1.08); }
      100% { transform: scale(1); }
    }
    .info {
      padding: 1.25rem 1.5rem 0.85rem;
    }
    .song-title {
      font-size: 1.2rem;
      font-weight: 800;
      line-height: 1.35;
      margin-bottom: 0.35rem;
      color: var(--border);
      word-break: break-word;
    }
    .song-meta {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--green-dark);
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .controls {
      padding: 0 1.5rem 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    /* Progress bar */
    .progress-wrap {
      width: 100%;
    }
    .progress-bar {
      width: 100%;
      height: 12px;
      background: #e2e8f0;
      border: 2.5px solid var(--border);
      border-radius: 6px;
      overflow: hidden;
      cursor: pointer;
      position: relative;
    }
    .progress-fill {
      height: 100%;
      background: var(--green);
      width: 0%;
      border-radius: 3px;
    }
    .time-row {
      display: flex;
      justify-content: space-between;
      font-size: 0.78rem;
      font-weight: 700;
      color: var(--green-dark);
      margin-top: 5px;
      font-family: 'Space Grotesk', monospace;
    }
    /* Buttons */
    .btn-row {
      display: flex;
      gap: 1rem;
      align-items: center;
      justify-content: center;
      padding: 6px 0;
    }
    .play-btn {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: var(--green);
      color: #fff;
      border: 3px solid var(--border);
      box-shadow: var(--shadow-sm);
      font-size: 1.6rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.1s;
    }
    .play-btn:hover {
      background: var(--green-hover);
      transform: translate(-2px, -2px);
      box-shadow: var(--shadow);
    }
    .play-btn:active {
      transform: translate(2px, 2px);
      box-shadow: 1px 1px 0 var(--border);
    }
    .side-btn {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: #fff;
      color: var(--border);
      border: 2.5px solid var(--border);
      box-shadow: var(--shadow-btn);
      font-size: 1.1rem;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.1s;
    }
    .side-btn:hover {
      background: var(--green-light);
      transform: translate(-1px, -1px);
      box-shadow: var(--shadow-sm);
    }
    .side-btn:active {
      transform: translate(2px, 2px);
      box-shadow: 0 0 0 var(--border);
    }
    /* Sub controls */
    .sub-ctrl-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding-top: 6px;
    }
    .loop-btn {
      background: #fff;
      border: 2px solid var(--border);
      box-shadow: var(--shadow-btn);
      border-radius: 6px;
      padding: 5px 10px;
      font-size: 0.78rem;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 5px;
      color: var(--border);
    }
    .loop-btn.active {
      background: var(--green);
      color: #fff;
    }
    .volume-box {
      display: flex;
      align-items: center;
      gap: 6px;
      flex: 1;
      max-width: 140px;
    }
    .vol-icon { font-size: 1rem; }
    .vol-slider {
      width: 100%;
      accent-color: var(--green);
      cursor: pointer;
    }
    /* Footer */
    .footer {
      text-align: center;
      padding: 0.85rem 1rem;
      border-top: 2.5px solid var(--border);
      background: var(--green-light);
    }
    .footer a {
      display: inline-block;
      font-weight: 700;
      font-size: 0.88rem;
      text-decoration: none;
      color: var(--green-dark);
      background: #fff;
      border: 2px solid var(--border);
      border-radius: 8px;
      box-shadow: var(--shadow-btn);
      padding: 0.45rem 1.25rem;
      transition: all 0.1s;
    }
    .footer a:hover {
      transform: translate(-1px, -1px);
      box-shadow: var(--shadow-sm);
    }
    /* Loading & Error */
    .state-card {
      text-align: center;
      padding: 3rem 1.5rem;
      font-weight: 700;
      color: var(--green-dark);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
    }
    .spinner {
      width: 36px;
      height: 36px;
      border: 4px solid var(--green-light);
      border-top-color: var(--green);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .error-emoji { font-size: 3rem; }
  </style>
</head>
<body>
  <div class="player" id="app">
    <div class="state-card" id="loading-state">
      <div class="spinner"></div>
      <div>Memuat informasi lagu...</div>
    </div>
  </div>

  <script>
    const TOKEN = "${id}";
    const API = location.origin;
    const app = document.getElementById("app");

    function fmt(sec) {
      if (!sec || isNaN(sec)) return "0:00";
      const m = Math.floor(sec / 60);
      const s = Math.floor(sec % 60);
      return m + ":" + String(s).padStart(2, "0");
    }

    function esc(s) {
      if (!s) return "";
      const d = document.createElement("div");
      d.textContent = s;
      return d.innerHTML;
    }

    async function init() {
      let info;
      try {
        const res = await fetch(API + "/api/player/" + TOKEN);
        info = await res.json();
      } catch (e) {
        app.innerHTML = \`
          <div class="state-card">
            <div class="error-emoji">😵</div>
            <div style="font-size:1.1rem">Gagal Terhubung</div>
            <p style="font-size:0.85rem;color:#4b6354;font-weight:400">Server tidak merespons. Pastikan bot aktif dan coba lagi.</p>
          </div>
        \`;
        return;
      }

      if (info.error) {
        app.innerHTML = \`
          <div class="state-card">
            <div class="error-emoji">⏰</div>
            <div style="font-size:1.1rem">Link Kedaluwarsa</div>
            <p style="font-size:0.85rem;color:#4b6354;font-weight:400">Token pemutar ini sudah tidak berlaku. Minta link baru lewat WhatsApp.</p>
          </div>
        \`;
        return;
      }

      document.title = info.title + " - Nibolbot Player";

      const streamUrl = API + "/api/stream/" + TOKEN;

      app.innerHTML = \`
        <div class="cover-wrap" id="cover-wrap">
          <video id="player" playsinline preload="auto" poster="\${esc(info.thumbnail)}" src="\${streamUrl}"></video>
          <div class="cover-badge">🤖 NIBOLBOT PLAYER</div>
          <div class="play-overlay" id="play-overlay">
            <div class="overlay-circle">▶</div>
          </div>
        </div>
        <div class="info">
          <div class="song-title">\${esc(info.title)}</div>
          <div class="song-meta">👤 \${esc(info.channel || "YouTube")} · ⏱️ \${fmt(info.duration)}</div>
        </div>
        <div class="controls">
          <div class="progress-wrap">
            <div class="progress-bar" id="pbar">
              <div class="progress-fill" id="pfill"></div>
            </div>
            <div class="time-row">
              <span id="tcur">0:00</span>
              <span id="tdur">\${fmt(info.duration)}</span>
            </div>
          </div>
          <div class="btn-row">
            <button class="side-btn" id="rew" title="Mundur 10s">⏪</button>
            <button class="play-btn" id="pbtn" title="Play/Pause">▶</button>
            <button class="side-btn" id="fwd" title="Maju 10s">⏩</button>
          </div>
          <div class="sub-ctrl-row">
            <button class="loop-btn" id="loop-btn">🔁 Loop: <span id="loop-txt">OFF</span></button>
            <div class="volume-box">
              <span class="vol-icon">🔊</span>
              <input type="range" min="0" max="100" value="85" class="vol-slider" id="vol">
            </div>
          </div>
        </div>
        <div class="footer">
          <a href="https://wa.me" target="_blank">💬 Kembali ke WhatsApp</a>
        </div>
      \`;

      const player = document.getElementById("player");
      const pbtn = document.getElementById("pbtn");
      const pfill = document.getElementById("pfill");
      const tcur = document.getElementById("tcur");
      const tdur = document.getElementById("tdur");
      const pbar = document.getElementById("pbar");
      const vol = document.getElementById("vol");
      const loopBtn = document.getElementById("loop-btn");
      const loopTxt = document.getElementById("loop-txt");
      const playOverlay = document.getElementById("play-overlay");

      player.volume = 0.85;

      let isLoop = false;
      loopBtn.onclick = () => {
        isLoop = !isLoop;
        player.loop = isLoop;
        loopBtn.classList.toggle("active", isLoop);
        loopTxt.textContent = isLoop ? "ON" : "OFF";
      };

      function togglePlay() {
        if (player.paused) {
          player.play().then(() => {
            pbtn.textContent = "⏸";
            playOverlay.classList.add("hidden");
          }).catch(err => {
            console.warn("Autoplay blocked:", err);
          });
        } else {
          player.pause();
          pbtn.textContent = "▶";
          playOverlay.classList.remove("hidden");
        }
      }

      pbtn.onclick = togglePlay;
      playOverlay.onclick = togglePlay;

      document.getElementById("rew").onclick = () => {
        player.currentTime = Math.max(0, player.currentTime - 10);
      };

      document.getElementById("fwd").onclick = () => {
        player.currentTime = Math.min(player.duration || 9999, player.currentTime + 10);
      };

      vol.oninput = () => {
        player.volume = vol.value / 100;
      };

      player.ontimeupdate = () => {
        if (!player.duration) return;
        const pct = (player.currentTime / player.duration) * 100;
        pfill.style.width = pct + "%";
        tcur.textContent = fmt(player.currentTime);
        tdur.textContent = fmt(player.duration);
      };

      player.onplay = () => {
        pbtn.textContent = "⏸";
        playOverlay.classList.add("hidden");
      };

      player.onpause = () => {
        pbtn.textContent = "▶";
        playOverlay.classList.remove("hidden");
      };

      player.onended = () => {
        if (!isLoop) {
          pbtn.textContent = "▶";
          pfill.style.width = "0%";
          playOverlay.classList.remove("hidden");
        }
      };

      pbar.onclick = (e) => {
        if (!player.duration) return;
        const rect = pbar.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        player.currentTime = pct * player.duration;
      };

      player.onerror = () => {
        console.error("Player media error:", player.error);
        app.innerHTML = \`
          <div class="state-card">
            <div class="error-emoji">⚠️</div>
            <div style="font-size:1.1rem">Gagal Memutar Media</div>
            <p style="font-size:0.85rem;color:#4b6354;font-weight:400">Stream audio/video dari YouTube sedang tidak tersedia atau terblokir.</p>
          </div>
        \`;
      };

      // Coba auto-play langsung saat halaman dimuat
      player.play().then(() => {
        pbtn.textContent = "⏸";
        playOverlay.classList.add("hidden");
      }).catch(() => {
        // Autoplay terhalang browser policy: overlay play siap diklik
        playOverlay.classList.remove("hidden");
      });
    }

    init();
  </script>
</body>
</html>`;
}
