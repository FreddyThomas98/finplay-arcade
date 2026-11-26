'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const gamesDir = path.join(root, 'public', 'games');
const audioPath = path.join(root, 'public', 'js', 'arcade-audio.js');
const outDir = path.join(root, 'standalone-games');

const GAME_FILES = [
  { src: 'flappy-finance.html', out: '1-flappy-finance.html', title: '🐤 Flappy Finance' },
  { src: 'finance-hangman.html', out: '2-finance-hangman.html', title: '🔤 Finance Hangman' },
  { src: 'finance-blaster.html', out: '3-finance-blaster.html', title: '🔫 Finance Blaster' },
  { src: 'cash-collector.html', out: '4-cash-collector.html', title: '🪙 Cash Collector' },
  { src: 'accounting-crossword.html', out: '5-accounting-crossword.html', title: '🧩 Accounting Crossword' }
];

function buildOfflineBridgeScript(gameTitle) {
  return `(() => {
  'use strict';
  const state = {
    slug: 'offline',
    isAdmin: true,
    isLocked: false,
    attemptsUsed: 0,
    maxAttempts: 999,
    attemptsLeft: 999,
    bestScore: 0
  };

  function storageKey() {
    return 'finplay_offline_best_' + state.slug;
  }

  function loadBest() {
    try {
      const v = Number(localStorage.getItem(storageKey()) || 0);
      return Number.isFinite(v) && v > 0 ? v : 0;
    } catch (_) {
      return 0;
    }
  }

  function saveBest(val) {
    try {
      localStorage.setItem(storageKey(), String(val));
    } catch (_) {}
  }

  function injectStyles() {
    if (document.getElementById('finplay-offline-style')) return;
    const style = document.createElement('style');
    style.id = 'finplay-offline-style';
    style.textContent = \`
      .fp-topbar {
        position: sticky; top: 0; z-index: 900; flex-shrink: 0;
        display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;
        padding: 7px 16px;
        background: rgba(10, 15, 38, 0.94);
        border-bottom: 1px solid rgba(139, 172, 255, 0.25);
        font-family: 'Outfit', system-ui, -apple-system, sans-serif;
        color: #f3f7ff;
      }
      .fp-brand { font-weight: 800; font-size: 14px; letter-spacing: 0.02em; color: #22e5d2; }
      .fp-brand span { color: #ffd147; }
      .fp-pills { display: flex; align-items: center; gap: 8px; }
      .fp-pill {
        padding: 5px 12px; border-radius: 999px; font-size: 12px; font-weight: 800;
        border: 1px solid rgba(139, 172, 255, 0.3); background: rgba(21, 30, 68, 0.9);
      }
      .fp-pill.gold { color: #ffd147; border-color: rgba(255, 209, 71, 0.45); }
      .fp-pill.ok { color: #34d399; border-color: rgba(52, 211, 153, 0.45); }
      .fp-confetti { position: fixed; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 999; }
      .fp-toast {
        position: fixed; bottom: 18px; right: 18px; z-index: 980;
        background: #17214a; border: 1px solid #22e5d2; color: #fff;
        padding: 10px 16px; border-radius: 13px;
        font-family: 'Outfit', system-ui, sans-serif; font-weight: 700; font-size: 13px;
        box-shadow: 0 12px 28px rgba(0, 0, 0, 0.45);
      }
    \`;
    document.head.appendChild(style);
  }

  function renderBar() {
    let bar = document.getElementById('finplay-topbar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'finplay-topbar';
      bar.className = 'fp-topbar';
      document.body.prepend(bar);
    }
    bar.innerHTML = \`
      <div class="fp-brand">🎮 FinPlay <span>Arcade</span> · ${gameTitle}</div>
      <div class="fp-pills">
        <span class="fp-pill ok">⚡ Local Edition</span>
        <span class="fp-pill gold" id="fpBestPill">⭐ Best: \${state.bestScore.toLocaleString()}</span>
      </div>
    \`;
  }

  function toast(msg) {
    const el = document.createElement('div');
    el.className = 'fp-toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  function celebrate() {
    const canvas = document.createElement('canvas');
    canvas.className = 'fp-confetti';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    const colors = ['#ffd147', '#22e5d2', '#ff5e8a', '#a78bfa', '#34d399'];
    const parts = Array.from({ length: 70 }, () => ({
      x: Math.random() * canvas.width,
      y: -15 - Math.random() * 100,
      w: 8, h: 5,
      vx: (Math.random() - 0.5) * 5,
      vy: 3 + Math.random() * 5,
      r: Math.random() * 6,
      vr: (Math.random() - 0.5) * 0.25,
      c: colors[Math.floor(Math.random() * colors.length)]
    }));
    let f = 0;
    function tick() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      parts.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.vy += 0.08; p.r += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.fillStyle = p.c; ctx.fillRect(-4, -2.5, p.w, p.h);
        ctx.restore();
      });
      if (++f < 95) requestAnimationFrame(tick);
      else canvas.remove();
    }
    requestAnimationFrame(tick);
  }

  window.FinPlayBridge = {
    async init(slug) {
      state.slug = slug;
      state.bestScore = loadBest();
      injectStyles();
      renderBar();
      return true;
    },
    async beginAttempt() {
      return { ok: true, attemptsLeft: 999, bestScore: state.bestScore, isAdmin: true };
    },
    async finishAttempt(score) {
      const s = Math.max(0, Math.round(Number(score) || 0));
      const isNewBest = s > state.bestScore;
      if (isNewBest) {
        state.bestScore = s;
        saveBest(s);
        renderBar();
        if (s > 0) {
          celebrate();
          toast('🎉 New Personal Best: ' + s.toLocaleString() + '!');
        }
      }
      return { ok: true, score: s, bestScore: state.bestScore, isNewBest, attemptsLeft: 999, isAdmin: true };
    },
    showLockOverlay() {},
    getState: () => ({ ...state })
  };
})();`;
}

function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const audioCode = fs.readFileSync(audioPath, 'utf8');

  for (const item of GAME_FILES) {
    let html = fs.readFileSync(path.join(gamesDir, item.src), 'utf8');
    const bridgeCode = buildOfflineBridgeScript(item.title);

    // Inline game-bridge.js and arcade-audio.js directly into the HTML
    if (!html.includes('<script src="/js/game-bridge.js"></script>')) {
      throw new Error(`${item.src} missing game-bridge.js tag`);
    }
    if (!html.includes('<script src="/js/arcade-audio.js"></script>')) {
      throw new Error(`${item.src} missing arcade-audio.js tag`);
    }

    html = html
      .replace('<script src="/js/game-bridge.js"></script>', `<script>\n${bridgeCode}\n</script>`)
      .replace('<script src="/js/arcade-audio.js"></script>', `<script>\n${audioCode}\n</script>`)
      // Clean up portal-only labels for offline standalone experience
      .replace(/ \(Preview\)/g, '')
      .replace(/ \(PREVIEW\)/g, '')
      .replace(/ \(uses 1 try\)/gi, '');

    // Verify no leftover /js/ script links and valid JS in all inline scripts
    if (/src="\/js\//.test(html)) {
      throw new Error(`${item.out} still contains /js/ reference!`);
    }
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    if (scripts.length < 3) {
      throw new Error(`${item.out} expected at least 3 inline scripts, found ${scripts.length}`);
    }
    scripts.forEach((m, i) => {
      new vm.Script(m[1], { filename: `${item.out}#script${i}` });
    });

    const outPath = path.join(outDir, item.out);
    fs.writeFileSync(outPath, html, 'utf8');
    console.log(`✅ Exported ${item.out} (${(html.length / 1024).toFixed(1)} KB, ${scripts.length} scripts verified)`);
  }

  console.log(`\n🎉 All 5 standalone offline games saved to: ${outDir}`);
}

main();
