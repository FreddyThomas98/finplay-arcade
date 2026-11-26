(() => {
  'use strict';

  const state = {
    slug: null,
    user: null,
    game: null,
    isAdmin: false,
    attemptsUsed: 0,
    maxAttempts: 3,
    attemptsLeft: 3,
    bestScore: 0,
    sessionId: null,
    ready: false
  };

  function injectStyles() {
    if (document.getElementById('finplay-bridge-style')) return;
    const style = document.createElement('style');
    style.id = 'finplay-bridge-style';
    style.textContent = `
      .fp-topbar {
        position: sticky;
        top: 0;
        z-index: 900;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        flex-wrap: wrap;
        padding: 10px 18px;
        background: rgba(10, 15, 38, 0.92);
        backdrop-filter: blur(12px);
        border-bottom: 1px solid rgba(139, 172, 255, 0.25);
        font-family: 'Outfit', system-ui, -apple-system, sans-serif;
        color: #f3f7ff;
      }
      .fp-left, .fp-center, .fp-right {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .fp-link {
        text-decoration: none;
        color: #f3f7ff;
        background: rgba(255, 255, 255, 0.09);
        border: 1px solid rgba(139, 172, 255, 0.28);
        padding: 7px 13px;
        border-radius: 11px;
        font-weight: 700;
        font-size: 13px;
        transition: background 0.16s, border-color 0.16s;
      }
      .fp-link:hover {
        background: rgba(34, 229, 210, 0.18);
        border-color: #22e5d2;
      }
      .fp-pill {
        padding: 6px 12px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 800;
        border: 1px solid rgba(139, 172, 255, 0.28);
        background: rgba(21, 30, 68, 0.9);
      }
      .fp-pill.gold { color: #ffd147; border-color: rgba(255, 209, 71, 0.45); }
      .fp-pill.ok { color: #34d399; border-color: rgba(52, 211, 153, 0.45); }
      .fp-pill.low { color: #ffd147; border-color: rgba(255, 209, 71, 0.55); }
      .fp-pill.out { color: #ff5e8a; border-color: rgba(255, 94, 138, 0.55); }
      .fp-player {
        font-size: 13px;
        font-weight: 700;
        color: #c9d8f5;
      }
      .fp-lock-overlay {
        position: fixed;
        inset: 0;
        z-index: 950;
        background: rgba(7, 11, 28, 0.9);
        backdrop-filter: blur(8px);
        display: grid;
        place-items: center;
        padding: 18px;
        font-family: 'Outfit', system-ui, sans-serif;
        color: #f3f7ff;
      }
      .fp-lock-card {
        max-width: 440px;
        width: 100%;
        background: linear-gradient(155deg, #1b2859, #101738);
        border: 1px solid rgba(255, 94, 138, 0.55);
        border-radius: 24px;
        padding: 28px;
        text-align: center;
        box-shadow: 0 24px 70px rgba(0, 0, 0, 0.6);
      }
      .fp-lock-card h2 {
        margin: 8px 0;
        font-size: 26px;
        color: #ffd147;
      }
      .fp-lock-card p {
        color: #b8c9ea;
        font-size: 14px;
        line-height: 1.55;
      }
      .fp-lock-actions {
        display: flex;
        justify-content: center;
        gap: 10px;
        flex-wrap: wrap;
        margin-top: 18px;
      }
      .fp-btn {
        border: 0;
        border-radius: 12px;
        padding: 11px 18px;
        font-weight: 800;
        font-size: 14px;
        cursor: pointer;
        text-decoration: none;
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .fp-btn.cyan { background: linear-gradient(135deg, #22e5d2, #38bdf8); color: #061c28; }
      .fp-btn.gold { background: linear-gradient(135deg, #ffd147, #ff9f43); color: #1f1202; }
      .fp-confetti {
        position: fixed;
        inset: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 999;
      }
      .fp-toast {
        position: fixed;
        bottom: 18px;
        right: 18px;
        z-index: 980;
        background: #17214a;
        border: 1px solid #22e5d2;
        color: #fff;
        padding: 11px 16px;
        border-radius: 13px;
        font-family: 'Outfit', system-ui, sans-serif;
        font-weight: 700;
        font-size: 13px;
        box-shadow: 0 12px 28px rgba(0, 0, 0, 0.45);
      }
    `;
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

    const triesCls = state.isAdmin
      ? 'ok'
      : state.attemptsLeft <= 0
      ? 'out'
      : state.attemptsLeft === 1
      ? 'low'
      : 'ok';

    const triesLabel = state.isAdmin
      ? '👑 Admin Preview'
      : `🎮 ${state.attemptsLeft} / ${state.maxAttempts} tries left`;

    bar.innerHTML = `
      <div class="fp-left">
        <a class="fp-link" href="/">← Arcade Hub</a>
        <a class="fp-link" href="/#scorecard">🏆 Scorecard</a>
      </div>
      <div class="fp-center">
        <span class="fp-pill ${triesCls}" id="fpTriesPill">${triesLabel}</span>
        <span class="fp-pill gold" id="fpBestPill">⭐ Best: ${state.bestScore.toLocaleString()}</span>
      </div>
      <div class="fp-right">
        <span class="fp-player">${state.user ? state.user.avatar + ' ' + state.user.fullName : ''}</span>
      </div>
    `;
  }

  function showLockOverlay(customMsg) {
    let ov = document.getElementById('finplay-lock-overlay');
    if (ov) ov.remove();
    ov = document.createElement('div');
    ov.id = 'finplay-lock-overlay';
    ov.className = 'fp-lock-overlay';
    ov.innerHTML = `
      <div class="fp-lock-card">
        <div style="font-size:48px;">🔒</div>
        <h2>Out of Tries!</h2>
        <p>${customMsg || `You have used all ${state.maxAttempts} attempts for ${state.game?.title || 'this game'}. Ask your Admin to reset your attempts if you'd like another go!`}</p>
        <p style="color:#ffd147;font-weight:800;font-size:17px;">Your Best Score: ${state.bestScore.toLocaleString()}</p>
        <div class="fp-lock-actions">
          <a class="fp-btn cyan" href="/">🕹️ Back to Arcade</a>
          <a class="fp-btn gold" href="/#scorecard">🏆 View Toppers</a>
        </div>
      </div>
    `;
    document.body.appendChild(ov);
  }

  function toast(msg) {
    const el = document.createElement('div');
    el.className = 'fp-toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3500);
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
      w: 8,
      h: 5,
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
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.08;
        p.r += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.c;
        ctx.fillRect(-4, -2.5, p.w, p.h);
        ctx.restore();
      });
      if (++f < 95) requestAnimationFrame(tick);
      else canvas.remove();
    }
    requestAnimationFrame(tick);
  }

  async function init(slug) {
    state.slug = slug;
    injectStyles();
    try {
      const res = await fetch(`/api/games/${encodeURIComponent(slug)}/status`, {
        credentials: 'same-origin'
      });
      if (res.status === 401) {
        location.href = '/';
        return false;
      }
      const data = await res.json();
      state.user = data.user;
      state.game = data.game;
      state.isAdmin = Boolean(data.isAdmin);
      state.attemptsUsed = data.attemptsUsed;
      state.maxAttempts = data.maxAttempts;
      state.attemptsLeft = data.attemptsLeft;
      state.bestScore = data.bestScore;
      state.ready = true;
      renderBar();

      if (!state.isAdmin && state.attemptsLeft <= 0) {
        showLockOverlay();
      }
      return true;
    } catch (_) {
      toast('Connection hiccup — please refresh if score sync fails.');
      return false;
    }
  }

  async function beginAttempt() {
    if (!state.slug) return { ok: true };
    try {
      const res = await fetch(`/api/games/${encodeURIComponent(state.slug)}/start`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
      });
      if (res.status === 401) {
        location.href = '/';
        return { ok: false };
      }
      const data = await res.json();
      if (!res.ok) {
        state.attemptsLeft = 0;
        renderBar();
        showLockOverlay(data.error);
        return { ok: false, error: data.error };
      }
      state.sessionId = data.sessionId;
      state.attemptsUsed = data.attemptsUsed;
      state.maxAttempts = data.maxAttempts;
      state.attemptsLeft = data.attemptsLeft;
      renderBar();
      return { ok: true, ...data };
    } catch (_) {
      toast('Network error starting game. Please try again!');
      return { ok: false };
    }
  }

  async function finishAttempt(score) {
    if (!state.slug || !state.sessionId) {
      return { ok: false, attemptsLeft: state.attemptsLeft, bestScore: state.bestScore };
    }
    const sid = state.sessionId;
    state.sessionId = null;
    try {
      const res = await fetch(`/api/games/${encodeURIComponent(state.slug)}/submit`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sid, score: Math.max(0, Math.round(Number(score) || 0)) })
      });
      const data = await res.json();
      if (res.ok) {
        state.bestScore = data.bestScore ?? state.bestScore;
        state.attemptsUsed = data.attemptsUsed ?? state.attemptsUsed;
        state.maxAttempts = data.maxAttempts ?? state.maxAttempts;
        state.attemptsLeft = data.attemptsLeft ?? state.attemptsLeft;
        renderBar();
        if (data.isNewBest && score > 0) {
          celebrate();
          toast(`🎉 New Personal Best: ${data.bestScore.toLocaleString()}!`);
        } else if (!data.isAdmin) {
          toast(`Score saved! Best: ${state.bestScore.toLocaleString()}`);
        }
        return { ok: true, ...data };
      }
    } catch (_) {
      toast('Could not save score due to network issue.');
    }
    return { ok: false, attemptsLeft: state.attemptsLeft, bestScore: state.bestScore };
  }

  window.FinPlayBridge = {
    init,
    beginAttempt,
    finishAttempt,
    showLockOverlay,
    getState: () => ({ ...state })
  };
})();
