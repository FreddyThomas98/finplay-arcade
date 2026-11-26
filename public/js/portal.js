(() => {
  'use strict';

  const API = window.FinPlayAPI;
  const $ = id => document.getElementById(id);

  let currentUser = null;
  let avatars = ['🦊', '🚀', '🦁', '🐼', '⚡', '👾', '🦄', '🐯', '🐙', '🦅', '🐸', '🤖'];
  let selectedAvatar = avatars[0];
  let activeView = 'hub';
  let leaderboardData = null;
  let activeBoardFilter = 'overall';
  let adminData = null;
  let boardPollTimer = null;

  function esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showToast(msg, type = 'ok') {
    const el = document.createElement('div');
    el.className = 'toast' + (type === 'error' ? ' error' : '');
    el.textContent = msg;
    $('toastContainer').appendChild(el);
    setTimeout(() => el.remove(), 3600);
  }

  function launchConfetti() {
    const canvas = $('confettiCanvas');
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const colors = ['#ffd147', '#22e5d2', '#ff5e8a', '#a78bfa', '#34d399', '#38bdf8'];
    const pieces = Array.from({ length: 85 }, () => ({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * 140,
      w: 7 + Math.random() * 7,
      h: 5 + Math.random() * 5,
      vx: (Math.random() - 0.5) * 5,
      vy: 3 + Math.random() * 5,
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 0.25,
      color: colors[Math.floor(Math.random() * colors.length)]
    }));
    let frames = 0;
    function step() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pieces.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.08;
        p.rot += p.vrot;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });
      if (++frames < 110) requestAnimationFrame(step);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    requestAnimationFrame(step);
  }

  function getTitleBadge(score, isAdmin) {
    if (isAdmin) return '👑 Arcade Host & Admin';
    if (score >= 4500) return '🔥 Finance Legend';
    if (score >= 2800) return '💎 Balance Boss';
    if (score >= 1400) return '⚡ Cash Captain';
    if (score >= 400) return '📈 Ledger Explorer';
    return '⭐ Coin Rookie';
  }

  // Modal Helper
  function openModal({ title, message, extraHtml = '', actions = [] }) {
    $('modalTitle').textContent = title;
    $('modalMessage').textContent = message;
    $('modalBodyExtra').innerHTML = extraHtml;
    const act = $('modalActions');
    act.innerHTML = '';
    actions.forEach(a => {
      const btn = document.createElement('button');
      btn.className = a.className || 'btn btn-ghost';
      btn.textContent = a.label;
      btn.onclick = () => {
        closeModal();
        if (a.onClick) a.onClick();
      };
      act.appendChild(btn);
    });
    $('modalBackdrop').classList.remove('hidden');
  }

  function closeModal() {
    $('modalBackdrop').classList.add('hidden');
  }

  $('modalBackdrop').addEventListener('click', e => {
    if (e.target === $('modalBackdrop')) closeModal();
  });

  // Avatar Picker (Signup)
  function renderSignupAvatars() {
    const container = $('avatarPicker');
    container.innerHTML = '';
    avatars.forEach(av => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'avatar-opt' + (av === selectedAvatar ? ' selected' : '');
      btn.textContent = av;
      btn.onclick = () => {
        selectedAvatar = av;
        renderSignupAvatars();
      };
      container.appendChild(btn);
    });
  }

  // Auth Switch
  function setAuthMode(mode) {
    $('authError').classList.add('hidden');
    if (mode === 'login') {
      $('tabLogin').classList.add('active');
      $('tabSignup').classList.remove('active');
      $('loginForm').classList.remove('hidden');
      $('signupForm').classList.add('hidden');
    } else {
      $('tabSignup').classList.add('active');
      $('tabLogin').classList.remove('active');
      $('signupForm').classList.remove('hidden');
      $('loginForm').classList.add('hidden');
    }
  }

  $('tabLogin').onclick = () => setAuthMode('login');
  $('tabSignup').onclick = () => setAuthMode('signup');

  function showAuthError(msg) {
    const el = $('authError');
    el.textContent = msg;
    el.classList.remove('hidden');
  }

  $('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    $('authError').classList.add('hidden');
    const btn = $('loginSubmit');
    btn.disabled = true;
    btn.textContent = 'Logging in...';
    try {
      const res = await API.post('/api/auth/login', {
        email: $('loginEmail').value.trim(),
        password: $('loginPassword').value
      });
      currentUser = res.user;
      enterPortal();
      showToast(`Welcome back, ${currentUser.fullName}!`);
    } catch (err) {
      showAuthError(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '🚀 Enter FinPlay Arcade';
    }
  });

  $('signupForm').addEventListener('submit', async e => {
    e.preventDefault();
    $('authError').classList.add('hidden');
    const btn = $('signupSubmit');
    btn.disabled = true;
    btn.textContent = 'Creating account...';
    try {
      const res = await API.post('/api/auth/signup', {
        fullName: $('signupName').value.trim(),
        email: $('signupEmail').value.trim(),
        password: $('signupPassword').value,
        avatar: selectedAvatar
      });
      currentUser = res.user;
      enterPortal();
      launchConfetti();
      showToast(`Welcome to FinPlay Arcade, ${currentUser.fullName}! 🎉`);
    } catch (err) {
      showAuthError(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '✨ Create Account & Start Playing';
    }
  });

  $('logoutBtn').onclick = async () => {
    await API.post('/api/auth/logout', {}).catch(() => {});
    currentUser = null;
    clearInterval(boardPollTimer);
    $('appShell').classList.add('hidden');
    $('authView').classList.remove('hidden');
    $('loginPassword').value = '';
    setAuthMode('login');
    showToast('Logged out successfully.');
  };

  // Avatar switcher for logged-in user
  $('userPill').onclick = () => {
    if (!currentUser || currentUser.role === 'admin') return;
    const grid = `<div class="avatar-picker" id="modalAvatarPicker" style="margin:14px 0 18px;">${avatars
      .map(
        av =>
          `<button type="button" class="avatar-opt ${av === currentUser.avatar ? 'selected' : ''}" data-av="${av}">${av}</button>`
      )
      .join('')}</div>`;
    openModal({
      title: 'Switch Your Arcade Avatar',
      message: 'Pick your favorite mascot for the Toppers Podium!',
      extraHtml: grid,
      actions: [{ label: 'Close', className: 'btn btn-ghost' }]
    });
    document.querySelectorAll('#modalAvatarPicker .avatar-opt').forEach(btn => {
      btn.onclick = async () => {
        try {
          const res = await API.patch('/api/auth/avatar', { avatar: btn.dataset.av });
          currentUser = res.user;
          updateNavUser();
          closeModal();
          showToast('Avatar updated!');
          if (activeView === 'hub') loadHub();
          if (activeView === 'scorecard') loadLeaderboard();
        } catch (err) {
          showToast(err.message, 'error');
        }
      };
    });
  };

  function updateNavUser() {
    $('navAvatar').textContent = currentUser.avatar;
    $('navName').textContent = currentUser.fullName;
    $('navRole').textContent = currentUser.role === 'admin' ? 'Admin' : currentUser.email;
    $('bannerAvatar').textContent = currentUser.avatar;
    $('bannerGreeting').textContent = `Hey ${currentUser.fullName.split(' ')[0]}! Ready to play?`;
    if (currentUser.role === 'admin') {
      $('navAdminTab').classList.remove('hidden');
    } else {
      $('navAdminTab').classList.add('hidden');
    }
  }

  function switchView(view) {
    if (view === 'admin' && currentUser?.role !== 'admin') view = 'hub';
    activeView = view;

    document.querySelectorAll('.nav-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.view === view);
    });

    $('viewHub').classList.toggle('hidden', view !== 'hub');
    $('viewScorecard').classList.toggle('hidden', view !== 'scorecard');
    $('viewAdmin').classList.toggle('hidden', view !== 'admin');

    clearInterval(boardPollTimer);
    if (view === 'hub') {
      loadHub();
    } else if (view === 'scorecard') {
      loadLeaderboard();
      boardPollTimer = setInterval(() => {
        if (activeView === 'scorecard' && !document.hidden) loadLeaderboard(true);
      }, 20000);
    } else if (view === 'admin') {
      loadAdmin();
    }
  }

  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.onclick = () => switchView(tab.dataset.view);
  });
  $('brandHome').onclick = () => switchView('hub');

  // === HUB VIEW ===
  async function loadHub() {
    try {
      const data = await API.get('/api/games');
      const isAdmin = currentUser.role === 'admin';
      const s = data.summary;

      $('kpiTotalScore').textContent = s.totalScore.toLocaleString();
      $('kpiRank').textContent = isAdmin
        ? 'ADMIN'
        : s.rank
        ? `#${s.rank} / ${s.totalStudents}`
        : '—';
      $('kpiGames').textContent = `${s.gamesCompleted} / ${data.games.length}`;
      $('bannerBadge').textContent = getTitleBadge(s.totalScore, isAdmin);
      $('hubSubtitle').textContent = isAdmin
        ? 'Admin preview mode active — you can test all 5 games freely without affecting the student leaderboard.'
        : `Each game gives you ${data.defaultMaxAttempts} tries initially. Your best score counts toward the Champions Podium!`;

      const grid = $('gamesGrid');
      grid.innerHTML = '';

      data.games.forEach(g => {
        const adminLocked = Boolean(g.isLocked);
        const lockedByAdmin = !isAdmin && adminLocked;
        const outOfTries = !isAdmin && g.attemptsLeft <= 0;
        const triesClass = isAdmin
          ? 'tries-ok'
          : g.attemptsLeft === 0
          ? 'tries-out'
          : g.attemptsLeft === 1
          ? 'tries-low'
          : 'tries-ok';
        const triesText = isAdmin
          ? (adminLocked ? '🔒 Locked (Preview)' : 'Unlimited')
          : `${g.attemptsLeft} / ${g.maxAttempts} left`;

        const card = document.createElement('article');
        card.className = 'game-card' + (lockedByAdmin ? ' is-locked' : '');
        card.style.setProperty('--card-accent', g.accent);
        card.style.setProperty('--card-accent2', g.accent2);

        const playActionHtml = lockedByAdmin
          ? `<button class="btn btn-ghost play-btn" disabled>🔒 Locked by Admin — Coming Soon</button>`
          : outOfTries
          ? `<button class="btn btn-ghost play-btn" disabled>🔒 0 Tries Left — Ask Admin to Reset</button>`
          : `<a class="btn btn-primary play-btn" href="${g.url}">▶ Play ${esc(g.shortTitle)}${isAdmin && adminLocked ? ' (Locked)' : ''}</a>`;

        card.innerHTML = `
          <div>
            <div class="game-top">
              <div class="game-icon">${g.icon}</div>
              <span class="game-cat">${adminLocked ? '🔒 Locked' : esc(g.category)}</span>
            </div>
            <h3 class="game-title">${esc(g.title)}</h3>
            <p class="game-desc">${esc(g.description)}</p>
            <div class="game-rules">${esc(g.rules)}</div>
          </div>
          <div>
            <div class="game-metrics">
              <div class="metric-box">
                <small>Best Score</small>
                <b style="color:var(--gold)">${g.bestScore.toLocaleString()}</b>
              </div>
              <div class="metric-box">
                <small>Attempts Left</small>
                <b class="${triesClass}">${triesText}</b>
              </div>
            </div>
            <div style="margin-top:12px;">
              ${playActionHtml}
            </div>
          </div>
        `;
        grid.appendChild(card);
      });
    } catch (err) {
      if (err.status === 401) return location.reload();
      showToast(err.message, 'error');
    }
  }

  $('refreshHubBtn').onclick = () => {
    loadHub();
    showToast('Arcade hub refreshed!');
  };

  // === SCORECARD VIEW ===
  async function loadLeaderboard(silent = false) {
    try {
      leaderboardData = await API.get('/api/leaderboard');
      renderBoardFilters();
      renderScorecard();
    } catch (err) {
      if (!silent) showToast(err.message, 'error');
    }
  }

  function renderBoardFilters() {
    const wrap = $('boardFilters');
    wrap.innerHTML = '';
    const items = [
      { key: 'overall', label: '🏆 Overall Toppers' },
      ...leaderboardData.games.map(g => ({ key: g.slug, label: `${g.icon} ${g.shortTitle}` }))
    ];
    items.forEach(item => {
      const btn = document.createElement('button');
      btn.className = 'pill' + (activeBoardFilter === item.key ? ' active' : '');
      btn.textContent = item.label;
      btn.onclick = () => {
        activeBoardFilter = item.key;
        renderBoardFilters();
        renderScorecard();
      };
      wrap.appendChild(btn);
    });
  }

  function renderPodium(topThree, isOverall) {
    const wrap = $('podiumWrap');
    if (!topThree.length) {
      wrap.innerHTML = `<div class="card-panel empty-state" style="grid-column:1/-1;margin:0;">
        <div style="font-size:40px;margin-bottom:8px;">🏆</div>
        <b>No scores on the board yet!</b><br>Play any finance game to claim the #1 Champion spot.
      </div>`;
      return;
    }

    // Visual order: #2 left, #1 center, #3 right
    const order = [topThree[1], topThree[0], topThree[2]].filter(Boolean);
    const medals = { 1: '👑', 2: '🥈', 3: '🥉' };

    wrap.innerHTML = order
      .map(entry => {
        const scoreVal = isOverall ? entry.totalScore : entry.bestScore;
        const subText = isOverall
          ? `${entry.gamesPlayed} / 5 games played`
          : `${entry.attemptsUsed} / ${entry.maxAttempts} tries used`;
        return `
          <div class="podium-card rank-${entry.rank}">
            <div class="podium-medal">${medals[entry.rank] || '#' + entry.rank}</div>
            <div class="podium-avatar">${esc(entry.avatar)}</div>
            <h3 class="podium-name">${esc(entry.fullName)}</h3>
            <div class="podium-score">${scoreVal.toLocaleString()}</div>
            <div class="podium-sub">#${entry.rank} · ${subText}</div>
          </div>
        `;
      })
      .join('');
  }

  function renderScorecard() {
    if (!leaderboardData) return;
    const q = $('boardSearch').value.trim().toLowerCase();
    const isOverall = activeBoardFilter === 'overall';
    const meId = leaderboardData.currentUserId;

    if (isOverall) {
      const list = leaderboardData.overall;
      const topPlayed = list.filter(s => s.totalScore > 0 || s.gamesPlayed > 0).slice(0, 3);
      renderPodium(topPlayed, true);

      $('boardTableTitle').textContent = `Overall Champions (${list.length} students · ${leaderboardData.stats.totalPlays} total plays)`;
      $('boardHead').innerHTML = `
        <tr>
          <th>Rank</th>
          <th>Student</th>
          <th>Total Best</th>
          ${leaderboardData.games.map(g => `<th>${g.icon} ${esc(g.shortTitle)}</th>`).join('')}
        </tr>
      `;

      const filtered = list.filter(s => !q || s.fullName.toLowerCase().includes(q));
      if (!filtered.length) {
        $('boardBody').innerHTML = `<tr><td colspan="8" class="empty-state">No matching students found.</td></tr>`;
        return;
      }

      $('boardBody').innerHTML = filtered
        .map(
          s => `
          <tr class="${s.userId === meId ? 'me-row' : ''}">
            <td><span class="rank-num ${s.rank <= 3 ? 'r' + s.rank : ''}">${s.rank}</span></td>
            <td>
              <div class="player-cell">
                <span class="av">${esc(s.avatar)}</span>
                <b>${esc(s.fullName)}</b>
                ${s.userId === meId ? '<span class="you-tag">YOU</span>' : ''}
              </div>
            </td>
            <td><span class="score-strong">${s.totalScore.toLocaleString()}</span></td>
            ${leaderboardData.games.map(g => `<td>${(s.scores[g.slug] || 0).toLocaleString()}</td>`).join('')}
          </tr>
        `
        )
        .join('');
    } else {
      const gameInfo = leaderboardData.games.find(g => g.slug === activeBoardFilter);
      const list = leaderboardData.byGame[activeBoardFilter] || [];
      renderPodium(list.slice(0, 3), false);

      $('boardTableTitle').textContent = `${gameInfo.icon} ${gameInfo.title} — Toppers`;
      $('boardHead').innerHTML = `
        <tr>
          <th>Rank</th>
          <th>Student</th>
          <th>Best Score</th>
          <th>Attempts Used</th>
        </tr>
      `;

      const filtered = list.filter(s => !q || s.fullName.toLowerCase().includes(q));
      if (!filtered.length) {
        $('boardBody').innerHTML = `<tr><td colspan="4" class="empty-state">Nobody has played ${esc(gameInfo.title)} yet. Be the first!</td></tr>`;
        return;
      }

      $('boardBody').innerHTML = filtered
        .map(
          s => `
          <tr class="${s.userId === meId ? 'me-row' : ''}">
            <td><span class="rank-num ${s.rank <= 3 ? 'r' + s.rank : ''}">${s.rank}</span></td>
            <td>
              <div class="player-cell">
                <span class="av">${esc(s.avatar)}</span>
                <b>${esc(s.fullName)}</b>
                ${s.userId === meId ? '<span class="you-tag">YOU</span>' : ''}
              </div>
            </td>
            <td><span class="score-strong">${s.bestScore.toLocaleString()}</span></td>
            <td>${s.attemptsUsed} / ${s.maxAttempts}</td>
          </tr>
        `
        )
        .join('');
    }
  }

  $('boardSearch').addEventListener('input', renderScorecard);
  $('refreshBoardBtn').onclick = () => {
    loadLeaderboard();
    showToast('Scorecard refreshed!');
  };

  // === ADMIN PANEL ===
  async function loadAdmin() {
    try {
      adminData = await API.get('/api/admin/overview');
      $('admStudents').textContent = adminData.stats.totalStudents;
      $('admPlays').textContent = adminData.stats.totalPlays;
      $('admActive').textContent = adminData.stats.activeNow;
      $('admAvg').textContent = adminData.stats.averageScore.toLocaleString();
      $('maxAttemptsInput').value = adminData.defaultMaxAttempts;

      // Populate global reset select once
      const sel = $('resetAllGameSelect');
      const currentVal = sel.value || 'all';
      sel.innerHTML =
        '<option value="all">All 5 Games</option>' +
        adminData.games
          .map(g => `<option value="${g.slug}">${g.icon} ${esc(g.title)}</option>`)
          .join('');
      sel.value = currentVal;

      renderAdminLockGrid();
      renderAdminStudents();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  function renderAdminLockGrid() {
    if (!adminData) return;
    const grid = $('adminLockGrid');
    grid.innerHTML = '';
    adminData.games.forEach(g => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'lock-toggle-btn' + (g.isLocked ? ' locked' : '');
      btn.innerHTML = `
        <span>${g.icon} ${esc(g.shortTitle)}</span>
        <span class="lock-pill">${g.isLocked ? '🔒 Locked' : '🔓 Open'}</span>
      `;
      btn.onclick = async () => {
        try {
          const res = await API.post('/api/admin/toggle-lock', {
            gameSlug: g.slug,
            locked: !g.isLocked
          });
          showToast(res.message);
          loadAdmin();
        } catch (err) {
          showToast(err.message, 'error');
        }
      };
      grid.appendChild(btn);
    });
  }

  $('lockAllGamesBtn').onclick = async () => {
    try {
      const res = await API.post('/api/admin/toggle-lock', { gameSlug: 'all', locked: true });
      showToast(res.message);
      loadAdmin();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  $('unlockAllGamesBtn').onclick = async () => {
    try {
      const res = await API.post('/api/admin/toggle-lock', { gameSlug: 'all', locked: false });
      showToast(res.message);
      loadAdmin();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  function renderAdminStudents() {
    if (!adminData) return;
    const q = $('adminSearch').value.trim().toLowerCase();
    const list = adminData.students.filter(
      s => !q || s.fullName.toLowerCase().includes(q) || s.email.toLowerCase().includes(q)
    );

    const tbody = $('adminStudentsBody');
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="empty-state">No students registered yet. Share the FinPlay Arcade link so students can sign up!</td></tr>`;
      return;
    }

    tbody.innerHTML = '';
    list.forEach(st => {
      const tr = document.createElement('tr');
      const chipsHtml = adminData.games
        .map(g => {
          const gp = st.games[g.slug];
          const exhausted = gp.attemptsLeft <= 0;
          return `<button type="button" class="admin-game-chip ${exhausted ? 'exhausted' : ''}"
            data-uid="${st.id}" data-uname="${esc(st.fullName)}" data-slug="${g.slug}" data-gtitle="${esc(g.title)}"
            title="Click to reset ${esc(g.title)} for ${esc(st.fullName)}">
            ${g.icon} ${gp.bestScore} · <span>${gp.attemptsUsed}/${gp.maxAttempts}</span> ↻
          </button>`;
        })
        .join('');

      tr.innerHTML = `
        <td>
          <div class="player-cell">
            <span class="av">${esc(st.avatar)}</span>
            <div>
              <b>${esc(st.fullName)}</b>
              <div style="font-size:12px;color:var(--muted);">${esc(st.email)}</div>
            </div>
          </div>
        </td>
        <td><span class="score-strong">${st.totalScore.toLocaleString()}</span></td>
        <td><div class="game-chips-cell">${chipsHtml}</div></td>
        <td>
          <div class="inline-form">
            <button type="button" class="btn btn-primary btn-sm reset-student-all" data-uid="${st.id}" data-uname="${esc(st.fullName)}">Reset All 5</button>
            <button type="button" class="btn btn-ghost btn-sm delete-student" data-uid="${st.id}" data-uname="${esc(st.fullName)}" title="Delete student">✕</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });

    // Attach chip handlers (reset 1 game for 1 student)
    tbody.querySelectorAll('.admin-game-chip').forEach(btn => {
      btn.onclick = async () => {
        const clearScores = $('singleClearScores').checked;
        try {
          const res = await API.post('/api/admin/reset-student', {
            userId: Number(btn.dataset.uid),
            gameSlug: btn.dataset.slug,
            clearScores
          });
          showToast(res.message);
          loadAdmin();
        } catch (err) {
          showToast(err.message, 'error');
        }
      };
    });

    // Reset all 5 games for 1 student
    tbody.querySelectorAll('.reset-student-all').forEach(btn => {
      btn.onclick = async () => {
        const clearScores = $('singleClearScores').checked;
        try {
          const res = await API.post('/api/admin/reset-student', {
            userId: Number(btn.dataset.uid),
            gameSlug: 'all',
            clearScores
          });
          showToast(res.message);
          loadAdmin();
        } catch (err) {
          showToast(err.message, 'error');
        }
      };
    });

    // Delete student
    tbody.querySelectorAll('.delete-student').forEach(btn => {
      btn.onclick = () => {
        openModal({
          title: `Remove ${btn.dataset.uname}?`,
          message: 'This will permanently delete this student account and their scores.',
          actions: [
            { label: 'Cancel', className: 'btn btn-ghost' },
            {
              label: 'Yes, Remove',
              className: 'btn btn-coral',
              onClick: async () => {
                try {
                  const res = await API.del(`/api/admin/students/${btn.dataset.uid}`);
                  showToast(res.message);
                  loadAdmin();
                } catch (err) {
                  showToast(err.message, 'error');
                }
              }
            }
          ]
        });
      };
    });
  }

  $('adminSearch').addEventListener('input', renderAdminStudents);
  $('refreshAdminBtn').onclick = () => {
    loadAdmin();
    showToast('Admin dashboard refreshed!');
  };

  $('resetAllBtn').onclick = () => {
    const gameSlug = $('resetAllGameSelect').value;
    const clearScores = $('resetAllClearScores').checked;
    const label =
      gameSlug === 'all'
        ? 'ALL 5 games'
        : $('resetAllGameSelect').selectedOptions[0].textContent;

    openModal({
      title: 'Reset Attempts for ALL Students?',
      message: `This will reset attempts to 0 for every student on ${label}${
        clearScores ? ' AND wipe their saved scores' : ' (keeping their best scores intact)'
      }.`,
      actions: [
        { label: 'Cancel', className: 'btn btn-ghost' },
        {
          label: 'Confirm Reset All',
          className: 'btn btn-coral',
          onClick: async () => {
            try {
              const res = await API.post('/api/admin/reset-all', {
                gameSlug,
                clearScores
              });
              showToast(res.message);
              loadAdmin();
            } catch (err) {
              showToast(err.message, 'error');
            }
          }
        }
      ]
    });
  };

  $('saveLimitBtn').onclick = async () => {
    const val = Number($('maxAttemptsInput').value);
    try {
      const res = await API.post('/api/admin/settings', {
        defaultMaxAttempts: val,
        applyToExisting: true
      });
      showToast(res.message);
      loadAdmin();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  function enterPortal() {
    $('authView').classList.add('hidden');
    $('appShell').classList.remove('hidden');
    updateNavUser();
    const hash = location.hash.replace('#', '');
    if (hash === 'scorecard') switchView('scorecard');
    else if (hash === 'admin' && currentUser.role === 'admin') switchView('admin');
    else switchView('hub');
  }

  async function boot() {
    renderSignupAvatars();
    try {
      const data = await API.get('/api/auth/me');
      if (data.avatars) {
        avatars = data.avatars;
        selectedAvatar = avatars[0];
        renderSignupAvatars();
      }
      if (data.user) {
        currentUser = data.user;
        enterPortal();
      } else {
        $('authView').classList.remove('hidden');
      }
    } catch (_) {
      $('authView').classList.remove('hidden');
    }
  }

  boot();
})();
