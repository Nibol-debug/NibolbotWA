export function renderGamePage(gameName: string): string {
  const game = (gameName || "dino").toLowerCase();

  if (game === "dino") {
    return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <title>🦖 Dino Runner - Nibolbot Arcade</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; user-select:none; -webkit-user-select:none; }
    body {
      background: #0f172a;
      color: #f8fafc;
      font-family: system-ui, -apple-system, sans-serif;
      height: 100vh;
      height: 100dvh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      overflow: hidden;
    }
    header {
      width: 100%;
      padding: 12px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: rgba(15, 23, 42, 0.9);
      border-bottom: 1px solid #1e293b;
    }
    .badge {
      background: #10b981;
      color: #0f172a;
      font-weight: 800;
      font-size: 0.75rem;
      padding: 4px 8px;
      border-radius: 4px;
      letter-spacing: 0.05em;
    }
    .score-board {
      font-size: 1rem;
      font-weight: 700;
      font-family: monospace;
      color: #38bdf8;
    }
    #game-container {
      position: relative;
      width: 100%;
      max-width: 600px;
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    canvas {
      width: 100%;
      max-width: 600px;
      height: auto;
      aspect-ratio: 16/9;
      background: #1e293b;
      border-radius: 12px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.5);
    }
    #overlay {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: rgba(15, 23, 42, 0.75);
      backdrop-filter: blur(4px);
      border-radius: 12px;
    }
    .btn {
      background: #10b981;
      color: #042f2e;
      font-weight: 800;
      font-size: 1.1rem;
      border: none;
      padding: 12px 28px;
      border-radius: 9999px;
      cursor: pointer;
      box-shadow: 0 4px 15px rgba(16, 185, 129, 0.4);
      transition: transform 0.1s;
    }
    .btn:active { transform: scale(0.95); }
    footer {
      width: 100%;
      padding: 16px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      background: #0f172a;
    }
    .touch-btn {
      width: 100%;
      max-width: 400px;
      height: 60px;
      background: #334155;
      color: #fff;
      font-weight: 700;
      border: 2px solid #475569;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.2rem;
      cursor: pointer;
    }
    .touch-btn:active { background: #10b981; color: #042f2e; border-color: #10b981; }
  </style>
</head>
<body>
  <header>
    <span class="badge">NIBOL ARCADE</span>
    <div class="score-board">SCORE: <span id="score">0</span> | HI: <span id="hi">0</span></div>
  </header>

  <div id="game-container">
    <canvas id="c" width="600" height="300"></canvas>
    <div id="overlay">
      <h2 id="ov-title" style="margin-bottom:12px;font-size:1.6rem">🦖 Dino Runner</h2>
      <p id="ov-desc" style="margin-bottom:20px;color:#94a3b8;font-size:0.9rem">Ketuk layar atau tombol LOMPAT untuk mulai</p>
      <button class="btn" id="start-btn">MAIN SEKARANG</button>
    </div>
  </div>

  <footer>
    <button class="touch-btn" id="jump-btn">TAP TO JUMP 🦘</button>
    <div style="font-size:0.75rem;color:#64748b">WhatsApp In-App WebView • Nibolbot</div>
  </footer>

  <script>
    const canvas = document.getElementById("c");
    const ctx = canvas.getContext("2d");
    const scoreEl = document.getElementById("score");
    const hiEl = document.getElementById("hi");
    const overlay = document.getElementById("overlay");
    const startBtn = document.getElementById("start-btn");
    const jumpBtn = document.getElementById("jump-btn");
    const ovTitle = document.getElementById("ov-title");

    let hiScore = Number(localStorage.getItem("dino_hi") || 0);
    hiEl.textContent = hiScore;

    let playing = false;
    let score = 0;
    let speed = 6;
    let dino = { x: 50, y: 220, w: 30, h: 40, vy: 0, grounded: true };
    let obstacles = [];
    let frame = 0;

    function jump() {
      if (!playing) {
        startGame();
        return;
      }
      if (dino.grounded) {
        dino.vy = -12;
        dino.grounded = false;
      }
    }

    window.addEventListener("keydown", (e) => {
      if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        jump();
      }
    });

    canvas.addEventListener("touchstart", (e) => { e.preventDefault(); jump(); });
    jumpBtn.addEventListener("touchstart", (e) => { e.preventDefault(); jump(); });
    jumpBtn.addEventListener("click", jump);
    startBtn.addEventListener("click", startGame);

    function startGame() {
      playing = true;
      score = 0;
      speed = 6;
      obstacles = [];
      dino.y = 220;
      dino.vy = 0;
      dino.grounded = true;
      overlay.style.display = "none";
      loop();
    }

    function gameOver() {
      playing = false;
      if (score > hiScore) {
        hiScore = score;
        localStorage.setItem("dino_hi", hiScore);
        hiEl.textContent = hiScore;
      }
      ovTitle.textContent = "💥 GAME OVER!";
      document.getElementById("ov-desc").textContent = "Skor Anda: " + score + " (Tertinggi: " + hiScore + ")";
      startBtn.textContent = "MAIN LAGI";
      overlay.style.display = "flex";
    }

    function loop() {
      if (!playing) return;
      frame++;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Floor
      ctx.strokeStyle = "#475569";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, 260);
      ctx.lineTo(canvas.width, 260);
      ctx.stroke();

      // Dino physics
      dino.vy += 0.65;
      dino.y += dino.vy;
      if (dino.y >= 220) {
        dino.y = 220;
        dino.vy = 0;
        dino.grounded = true;
      }

      // Draw Dino (Green neon block style)
      ctx.fillStyle = "#10b981";
      ctx.fillRect(dino.x, dino.y, dino.w, dino.h);
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(dino.x + 20, dino.y + 6, 4, 4); // Eye

      // Obstacles
      if (frame % Math.max(50, Math.floor(110 - speed * 4)) === 0) {
        const h = 25 + Math.random() * 30;
        obstacles.push({ x: canvas.width, y: 260 - h, w: 20, h: h });
      }

      for (let i = obstacles.length - 1; i >= 0; i--) {
        const obs = obstacles[i];
        obs.x -= speed;

        // Draw Cactus / Obstacle
        ctx.fillStyle = "#f43f5e";
        ctx.fillRect(obs.x, obs.y, obs.w, obs.h);

        // Collision check
        if (
          dino.x < obs.x + obs.w &&
          dino.x + dino.w > obs.x &&
          dino.y < obs.y + obs.h &&
          dino.y + dino.h > obs.y
        ) {
          gameOver();
          return;
        }

        if (obs.x + obs.w < 0) {
          obstacles.splice(i, 1);
          score += 10;
          scoreEl.textContent = score;
          if (score % 100 === 0) speed += 0.5;
        }
      }

      requestAnimationFrame(loop);
    }
  </script>
</body>
</html>`;
  }

  if (game === "flappy") {
    return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <title>🐦 Flappy Nibol - Nibolbot Arcade</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; user-select:none; }
    body { background: #030712; color: #fff; font-family: system-ui; height: 100vh; height:100dvh; display: flex; flex-direction: column; align-items: center; overflow: hidden; }
    header { width: 100%; padding: 12px; display: flex; justify-content: space-between; border-bottom: 1px solid #1f2937; }
    canvas { width: 100%; max-width: 480px; flex: 1; background: #0f172a; }
    .footer { width: 100%; padding: 12px; text-align: center; font-size: 0.8rem; color: #9ca3af; }
  </style>
</head>
<body>
  <header>
    <span style="font-weight:700;color:#10b981">🐦 FLAPPY NIBOL</span>
    <span style="font-weight:700" id="sc">SKOR: 0</span>
  </header>
  <canvas id="c" width="400" height="600"></canvas>
  <div class="footer">Ketuk layar untuk mengepakkan sayap • WhatsApp WebView</div>

  <script>
    const c = document.getElementById("c"), ctx = c.getContext("2d"), sc = document.getElementById("sc");
    let bird = { x: 50, y: 250, vy: 0 }, pipes = [], score = 0, playing = false, frame = 0;

    function flap() {
      if (!playing) { playing = true; score = 0; pipes = []; bird.y = 250; bird.vy = -6; loop(); return; }
      bird.vy = -7;
    }
    c.addEventListener("touchstart", (e) => { e.preventDefault(); flap(); });
    window.addEventListener("keydown", (e) => { if (e.code === "Space") flap(); });

    function loop() {
      if (!playing) return;
      frame++;
      ctx.clearRect(0, 0, 400, 600);

      bird.vy += 0.38;
      bird.y += bird.vy;

      // Draw Bird
      ctx.fillStyle = "#fbbf24";
      ctx.beginPath();
      ctx.arc(bird.x, bird.y, 14, 0, Math.PI * 2);
      ctx.fill();

      if (bird.y > 585 || bird.y < 0) { playing = false; alert("Game Over! Skor: " + score); return; }

      if (frame % 90 === 0) {
        let gap = 140, top = 50 + Math.random() * 250;
        pipes.push({ x: 400, top, bottom: top + gap });
      }

      for (let i = pipes.length - 1; i >= 0; i--) {
        let p = pipes[i];
        p.x -= 3;
        ctx.fillStyle = "#10b981";
        ctx.fillRect(p.x, 0, 45, p.top);
        ctx.fillRect(p.x, p.bottom, 45, 600 - p.bottom);

        if (bird.x + 14 > p.x && bird.x - 14 < p.x + 45 && (bird.y - 14 < p.top || bird.y + 14 > p.bottom)) {
          playing = false;
          alert("💥 Menabrak Pipa! Skor: " + score);
          return;
        }

        if (p.x + 45 < 0) {
          pipes.splice(i, 1);
          score++;
          sc.textContent = "SKOR: " + score;
        }
      }
      requestAnimationFrame(loop);
    }
    // initial paint
    ctx.fillStyle = "#94a3b8";
    ctx.font = "20px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("Ketuk Layar Untuk Mulai", 200, 300);
  </script>
</body>
</html>`;
  }

  // Games Arcade Menu Default
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <title>🎮 Nibolbot Arcade Hub</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { background: #090d0b; color: #f0fdf4; font-family: system-ui, sans-serif; min-height: 100vh; padding: 20px 16px; }
    .header { text-align: center; margin-bottom: 24px; }
    .title { font-size: 1.6rem; font-weight: 800; color: #10b981; }
    .desc { font-size: 0.85rem; color: #86a393; margin-top: 4px; }
    .grid { display: flex; flex-direction: column; gap: 14px; max-width: 500px; margin: 0 auto; }
    .card { background: #131b16; border: 1.5px solid #1f2e25; border-radius: 14px; padding: 18px; display: flex; align-items: center; justify-content: space-between; text-decoration: none; color: inherit; transition: border-color 0.2s; }
    .card:active { border-color: #10b981; }
    .card-info { display: flex; align-items: center; gap: 14px; }
    .icon { font-size: 2rem; background: #1c2720; padding: 10px; border-radius: 10px; }
    .g-title { font-weight: 700; font-size: 1.05rem; }
    .g-desc { font-size: 0.75rem; color: #86a393; margin-top: 2px; }
    .btn-play { background: #10b981; color: #000; font-weight: 800; padding: 8px 16px; border-radius: 9999px; font-size: 0.8rem; }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">🎮 NIBOL ARCADE</div>
    <div class="desc">Mainkan game langsung di In-App WebView WhatsApp</div>
  </div>

  <div class="grid">
    <a href="/games/dino" class="card">
      <div class="card-info">
        <div class="icon">🦖</div>
        <div>
          <div class="g-title">Dino Runner</div>
          <div class="g-desc">Lari dan lompati rintangan kaktus</div>
        </div>
      </div>
      <div class="btn-play">MAIN</div>
    </a>

    <a href="/games/flappy" class="card">
      <div class="card-info">
        <div class="icon">🐦</div>
        <div>
          <div class="g-title">Flappy Nibol</div>
          <div class="g-desc">Lewati celah pipa dengan ketukan sayap</div>
        </div>
      </div>
      <div class="btn-play">MAIN</div>
    </a>
  </div>
</body>
</html>`;
}
