'use strict';

const express = require('express');
const { query, withTransaction, getDefaultMaxAttempts, getLockedGames, setLockedGames } = require('../db');
const { requireAuth, requireAdmin } = require('../auth');
const { GAMES, GAME_SLUGS, GAME_MAP } = require('../games-config');

const router = express.Router();
router.use(requireAuth, requireAdmin);

async function buildAdminOverview() {
  const [defaultMax, lockedGames, studentsRes, progressRes, sessionsRes] = await Promise.all([
    getDefaultMaxAttempts(),
    getLockedGames(),
    query(
      `SELECT id, full_name, email, avatar, created_at
       FROM users
       WHERE role = 'student'
       ORDER BY created_at DESC`
    ),
    query(
      `SELECT gp.user_id, gp.game_slug, gp.attempts_used, gp.max_attempts,
              gp.best_score, gp.last_score, gp.updated_at
       FROM game_progress gp
       JOIN users u ON u.id = gp.user_id
       WHERE u.role = 'student'`
    ),
    query(
      `SELECT COUNT(*)::INT AS total_plays,
              COUNT(CASE WHEN status = 'started' AND started_at > NOW() - INTERVAL '15 minutes' THEN 1 END)::INT AS active_now
       FROM game_sessions gs
       JOIN users u ON u.id = gs.user_id
       WHERE u.role = 'student'`
    )
  ]);

  const progressMap = new Map();
  for (const row of progressRes.rows) {
    const uid = Number(row.user_id);
    if (!progressMap.has(uid)) progressMap.set(uid, {});
    progressMap.get(uid)[row.game_slug] = {
      attemptsUsed: Number(row.attempts_used),
      maxAttempts: Number(row.max_attempts),
      bestScore: Number(row.best_score),
      lastScore: Number(row.last_score),
      updatedAt: row.updated_at
    };
  }

  let sumTotals = 0;
  const students = studentsRes.rows.map(s => {
    const uid = Number(s.id);
    const pMap = progressMap.get(uid) || {};
    const games = {};
    let totalScore = 0;
    let totalAttemptsUsed = 0;

    for (const slug of GAME_SLUGS) {
      const p = pMap[slug];
      const attemptsUsed = p ? p.attemptsUsed : 0;
      const maxAttempts = p ? p.maxAttempts : defaultMax;
      const bestScore = p ? p.bestScore : 0;
      const lastScore = p ? p.lastScore : 0;
      games[slug] = {
        attemptsUsed,
        maxAttempts,
        attemptsLeft: Math.max(0, maxAttempts - attemptsUsed),
        bestScore,
        lastScore
      };
      totalScore += bestScore;
      totalAttemptsUsed += attemptsUsed;
    }

    sumTotals += totalScore;
    return {
      id: uid,
      fullName: s.full_name,
      email: s.email,
      avatar: s.avatar,
      createdAt: s.created_at,
      totalScore,
      totalAttemptsUsed,
      games
    };
  });

  students.sort((a, b) => b.totalScore - a.totalScore || a.fullName.localeCompare(b.fullName));

  const lockedSet = new Set(lockedGames);
  return {
    defaultMaxAttempts: defaultMax,
    lockedGames,
    games: GAMES.map(g => ({
      slug: g.slug,
      title: g.title,
      shortTitle: g.shortTitle,
      icon: g.icon,
      isLocked: lockedSet.has(g.slug)
    })),
    stats: {
      totalStudents: students.length,
      totalPlays: Number(sessionsRes.rows[0]?.total_plays || 0),
      activeNow: Number(sessionsRes.rows[0]?.active_now || 0),
      averageScore: students.length ? Math.round(sumTotals / students.length) : 0
    },
    students
  };
}

router.get('/overview', async (req, res, next) => {
  try {
    const data = await buildAdminOverview();
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.post('/reset-student', async (req, res, next) => {
  try {
    const userId = Number(req.body?.userId);
    const gameSlug = String(req.body?.gameSlug || 'all');
    const clearScores = Boolean(req.body?.clearScores);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: 'Valid student ID is required.' });
    }
    if (gameSlug !== 'all' && !GAME_MAP[gameSlug]) {
      return res.status(400).json({ error: 'Invalid game selected.' });
    }

    const studentRes = await query(
      "SELECT id, full_name FROM users WHERE id = $1 AND role = 'student'",
      [userId]
    );
    if (studentRes.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found.' });
    }

    const slugsToReset = gameSlug === 'all' ? GAME_SLUGS : [gameSlug];

    await withTransaction(async db => {
      const defaultMax = await getDefaultMaxAttempts(db);

      for (const slug of slugsToReset) {
        if (clearScores) {
          await db.query(
            `INSERT INTO game_progress (user_id, game_slug, attempts_used, max_attempts, best_score, last_score, updated_at)
             VALUES ($1, $2, 0, $3, 0, 0, NOW())
             ON CONFLICT (user_id, game_slug)
             DO UPDATE SET attempts_used = 0, max_attempts = $3, best_score = 0, last_score = 0, updated_at = NOW()`,
            [userId, slug, defaultMax]
          );
        } else {
          await db.query(
            `INSERT INTO game_progress (user_id, game_slug, attempts_used, max_attempts, best_score, last_score, updated_at)
             VALUES ($1, $2, 0, $3, 0, 0, NOW())
             ON CONFLICT (user_id, game_slug)
             DO UPDATE SET attempts_used = 0, max_attempts = $3, updated_at = NOW()`,
            [userId, slug, defaultMax]
          );
        }
      }

      if (gameSlug === 'all') {
        await db.query(
          `UPDATE game_sessions SET status = 'reset'
           WHERE user_id = $1 AND status = 'started'`,
          [userId]
        );
      } else {
        await db.query(
          `UPDATE game_sessions SET status = 'reset'
           WHERE user_id = $1 AND game_slug = $2 AND status = 'started'`,
          [userId, gameSlug]
        );
      }
    });

    const scopeLabel = gameSlug === 'all' ? 'all 5 games' : GAME_MAP[gameSlug].title;
    res.json({
      ok: true,
      message: `Reset attempts for ${studentRes.rows[0].full_name} (${scopeLabel})${clearScores ? ' and cleared scores' : ''}.`
    });
  } catch (err) {
    next(err);
  }
});

router.post('/reset-all', async (req, res, next) => {
  try {
    const gameSlug = String(req.body?.gameSlug || 'all');
    const clearScores = Boolean(req.body?.clearScores);

    if (gameSlug !== 'all' && !GAME_MAP[gameSlug]) {
      return res.status(400).json({ error: 'Invalid game selected.' });
    }

    await withTransaction(async db => {
      const defaultMax = await getDefaultMaxAttempts(db);

      if (gameSlug === 'all') {
        if (clearScores) {
          await db.query(
            `UPDATE game_progress
             SET attempts_used = 0, max_attempts = $1, best_score = 0, last_score = 0, updated_at = NOW()
             WHERE user_id IN (SELECT id FROM users WHERE role = 'student')`,
            [defaultMax]
          );
        } else {
          await db.query(
            `UPDATE game_progress
             SET attempts_used = 0, max_attempts = $1, updated_at = NOW()
             WHERE user_id IN (SELECT id FROM users WHERE role = 'student')`,
            [defaultMax]
          );
        }
        await db.query(
          `UPDATE game_sessions SET status = 'reset'
           WHERE status = 'started' AND user_id IN (SELECT id FROM users WHERE role = 'student')`
        );
      } else {
        if (clearScores) {
          await db.query(
            `UPDATE game_progress
             SET attempts_used = 0, max_attempts = $1, best_score = 0, last_score = 0, updated_at = NOW()
             WHERE game_slug = $2 AND user_id IN (SELECT id FROM users WHERE role = 'student')`,
            [defaultMax, gameSlug]
          );
        } else {
          await db.query(
            `UPDATE game_progress
             SET attempts_used = 0, max_attempts = $1, updated_at = NOW()
             WHERE game_slug = $2 AND user_id IN (SELECT id FROM users WHERE role = 'student')`,
            [defaultMax, gameSlug]
          );
        }
        await db.query(
          `UPDATE game_sessions SET status = 'reset'
           WHERE game_slug = $1 AND status = 'started' AND user_id IN (SELECT id FROM users WHERE role = 'student')`,
          [gameSlug]
        );
      }
    });

    const scopeLabel = gameSlug === 'all' ? 'all 5 games' : GAME_MAP[gameSlug].title;
    res.json({
      ok: true,
      message: `Reset attempts for ALL students (${scopeLabel})${clearScores ? ' and cleared scores' : ''}.`
    });
  } catch (err) {
    next(err);
  }
});

router.post('/toggle-lock', async (req, res, next) => {
  try {
    const gameSlug = String(req.body?.gameSlug || '');
    const locked = Boolean(req.body?.locked);

    if (gameSlug !== 'all' && !GAME_MAP[gameSlug]) {
      return res.status(400).json({ error: 'Invalid game selected.' });
    }

    let nextLocked;
    if (gameSlug === 'all') {
      nextLocked = locked ? [...GAME_SLUGS] : [];
    } else {
      const current = new Set(await getLockedGames());
      if (locked) current.add(gameSlug);
      else current.delete(gameSlug);
      nextLocked = [...current];
    }

    const saved = await setLockedGames(nextLocked);
    const label = gameSlug === 'all' ? 'All 5 games' : GAME_MAP[gameSlug].title;
    res.json({
      ok: true,
      lockedGames: saved,
      message: `${label} ${locked ? 'locked 🔒' : 'unlocked 🔓'}!`
    });
  } catch (err) {
    next(err);
  }
});

router.post('/settings', async (req, res, next) => {
  try {
    const defaultMaxAttempts = Number(req.body?.defaultMaxAttempts);
    const applyToExisting = req.body?.applyToExisting !== false;

    if (
      !Number.isInteger(defaultMaxAttempts) ||
      defaultMaxAttempts < 1 ||
      defaultMaxAttempts > 20
    ) {
      return res
        .status(400)
        .json({ error: 'Retry limit must be a whole number between 1 and 20.' });
    }

    await withTransaction(async db => {
      await db.query(
        `INSERT INTO portal_settings (key, value, updated_at)
         VALUES ('default_max_attempts', $1, NOW())
         ON CONFLICT (key)
         DO UPDATE SET value = $1, updated_at = NOW()`,
        [String(defaultMaxAttempts)]
      );

      if (applyToExisting) {
        await db.query(
          `UPDATE game_progress
           SET max_attempts = $1, updated_at = NOW()
           WHERE user_id IN (SELECT id FROM users WHERE role = 'student')`,
          [defaultMaxAttempts]
        );
      }
    });

    res.json({
      ok: true,
      defaultMaxAttempts,
      message: `Default retry limit updated to ${defaultMaxAttempts} attempts per game.`
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/students/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid student ID.' });
    }
    const del = await query(
      "DELETE FROM users WHERE id = $1 AND role = 'student' RETURNING full_name",
      [id]
    );
    if (del.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found.' });
    }
    res.json({ ok: true, message: `Removed ${del.rows[0].full_name}.` });
  } catch (err) {
    next(err);
  }
});

function csvCell(val) {
  let s = String(val ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

router.get('/export-csv', async (req, res, next) => {
  try {
    const overview = await buildAdminOverview();
    const header = [
      'Rank',
      'Student Name',
      'Gmail',
      'Total Best Score',
      ...GAMES.flatMap(g => [`${g.title} Best`, `${g.title} Tries`])
    ];

    const lines = [header.map(csvCell).join(',')];
    overview.students.forEach((st, idx) => {
      const row = [
        idx + 1,
        st.fullName,
        st.email,
        st.totalScore,
        ...GAMES.flatMap(g => {
          const gp = st.games[g.slug];
          return [gp.bestScore, `${gp.attemptsUsed}/${gp.maxAttempts}`];
        })
      ];
      lines.push(row.map(csvCell).join(','));
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="finplay-arcade-scorecard.csv"'
    );
    res.send(lines.join('\r\n'));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
