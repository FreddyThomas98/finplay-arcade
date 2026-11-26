'use strict';

const crypto = require('crypto');
const express = require('express');
const { query, withTransaction, getDefaultMaxAttempts, getLockedGames } = require('../db');
const { requireAuth, publicUser } = require('../auth');
const { GAMES, GAME_MAP } = require('../games-config');

const router = express.Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const [defaultMax, lockedList, progRes] = await Promise.all([
      getDefaultMaxAttempts(),
      getLockedGames(),
      query(
        `SELECT game_slug, attempts_used, max_attempts, best_score, last_score, updated_at
         FROM game_progress
         WHERE user_id = $1`,
        [req.user.id]
      )
    ]);
    const lockedSet = new Set(lockedList);
    const progMap = Object.fromEntries(progRes.rows.map(r => [r.game_slug, r]));

    const isAdmin = req.user.role === 'admin';
    let totalScore = 0;
    let totalAttemptsUsed = 0;
    let totalAttemptsMax = 0;
    let gamesCompleted = 0;

    const games = GAMES.map(g => {
      const p = progMap[g.slug];
      const attemptsUsed = p ? Number(p.attempts_used) : 0;
      const maxAttempts = p ? Number(p.max_attempts) : defaultMax;
      const bestScore = p ? Number(p.best_score) : 0;
      const lastScore = p ? Number(p.last_score) : 0;
      const attemptsLeft = isAdmin ? 99 : Math.max(0, maxAttempts - attemptsUsed);

      totalScore += bestScore;
      totalAttemptsUsed += attemptsUsed;
      totalAttemptsMax += maxAttempts;
      if (attemptsUsed > 0) gamesCompleted++;

      return {
        ...g,
        attemptsUsed,
        maxAttempts,
        attemptsLeft,
        bestScore,
        lastScore,
        isLocked: lockedSet.has(g.slug),
        isAdminPreview: isAdmin
      };
    });

    // Compute current student rank among all students
    let rank = null;
    let totalStudents = 0;
    if (!isAdmin) {
      const rankRes = await query(
        `SELECT u.id, COALESCE(SUM(gp.best_score), 0)::INT AS total_score,
                COUNT(CASE WHEN gp.attempts_used > 0 THEN 1 END)::INT AS games_played
         FROM users u
         LEFT JOIN game_progress gp ON gp.user_id = u.id
         WHERE u.role = 'student'
         GROUP BY u.id
         ORDER BY total_score DESC, games_played DESC, u.id ASC`
      );
      totalStudents = rankRes.rows.length;
      const idx = rankRes.rows.findIndex(r => Number(r.id) === Number(req.user.id));
      rank = idx >= 0 ? idx + 1 : null;
    }

    res.json({
      games,
      defaultMaxAttempts: defaultMax,
      summary: {
        totalScore,
        rank,
        totalStudents,
        gamesCompleted,
        totalAttemptsUsed,
        totalAttemptsMax
      }
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:slug/status', requireAuth, async (req, res, next) => {
  try {
    const game = GAME_MAP[req.params.slug];
    if (!game) {
      return res.status(404).json({ error: 'Game not found.' });
    }
    const [defaultMax, lockedList, progRes] = await Promise.all([
      getDefaultMaxAttempts(),
      getLockedGames(),
      query(
        `SELECT attempts_used, max_attempts, best_score, last_score
         FROM game_progress
         WHERE user_id = $1 AND game_slug = $2`,
        [req.user.id, game.slug]
      )
    ]);
    const p = progRes.rows[0];
    const isAdmin = req.user.role === 'admin';
    const isLocked = lockedList.includes(game.slug);
    const attemptsUsed = p ? Number(p.attempts_used) : 0;
    const maxAttempts = p ? Number(p.max_attempts) : defaultMax;
    const bestScore = p ? Number(p.best_score) : 0;
    const lastScore = p ? Number(p.last_score) : 0;

    res.json({
      user: publicUser(req.user),
      game,
      isAdmin,
      isLocked,
      attemptsUsed,
      maxAttempts,
      attemptsLeft: isAdmin ? 99 : Math.max(0, maxAttempts - attemptsUsed),
      bestScore,
      lastScore
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:slug/start', requireAuth, async (req, res, next) => {
  try {
    const game = GAME_MAP[req.params.slug];
    if (!game) {
      return res.status(404).json({ error: 'Game not found.' });
    }

    if (req.user.role !== 'admin') {
      const lockedList = await getLockedGames();
      if (lockedList.includes(game.slug)) {
        return res.status(403).json({
          error: `${game.title} is currently locked by Admin. Please wait until Admin unlocks it!`,
          isLocked: true
        });
      }
    }

    const sessionId = crypto.randomUUID();

    if (req.user.role === 'admin') {
      await query(
        `INSERT INTO game_sessions (id, user_id, game_slug, status)
         VALUES ($1, $2, $3, 'preview')`,
        [sessionId, req.user.id, game.slug]
      );
      return res.json({
        sessionId,
        isAdmin: true,
        attemptsUsed: 0,
        maxAttempts: 99,
        attemptsLeft: 99,
        bestScore: 0
      });
    }

    const result = await withTransaction(async db => {
      const defaultMax = await getDefaultMaxAttempts(db);

      await db.query(
        `INSERT INTO game_progress (user_id, game_slug, attempts_used, max_attempts)
         VALUES ($1, $2, 0, $3)
         ON CONFLICT (user_id, game_slug) DO NOTHING`,
        [req.user.id, game.slug, defaultMax]
      );

      const updated = await db.query(
        `UPDATE game_progress
         SET attempts_used = attempts_used + 1, updated_at = NOW()
         WHERE user_id = $1 AND game_slug = $2 AND attempts_used < max_attempts
         RETURNING attempts_used, max_attempts, best_score, last_score`,
        [req.user.id, game.slug]
      );

      if (updated.rows.length === 0) {
        const current = await db.query(
          `SELECT attempts_used, max_attempts, best_score
           FROM game_progress WHERE user_id = $1 AND game_slug = $2`,
          [req.user.id, game.slug]
        );
        return {
          allowed: false,
          row: current.rows[0]
        };
      }

      await db.query(
        `INSERT INTO game_sessions (id, user_id, game_slug, status)
         VALUES ($1, $2, $3, 'started')`,
        [sessionId, req.user.id, game.slug]
      );

      return {
        allowed: true,
        row: updated.rows[0]
      };
    });

    if (!result.allowed) {
      const maxAttempts = Number(result.row?.max_attempts ?? 3);
      return res.status(403).json({
        error: `You have used all ${maxAttempts} tries for ${game.title}. Ask your admin to reset your attempts!`,
        attemptsUsed: Number(result.row?.attempts_used ?? maxAttempts),
        maxAttempts,
        attemptsLeft: 0,
        bestScore: Number(result.row?.best_score ?? 0)
      });
    }

    const row = result.row;
    const attemptsUsed = Number(row.attempts_used);
    const maxAttempts = Number(row.max_attempts);
    res.json({
      sessionId,
      isAdmin: false,
      attemptsUsed,
      maxAttempts,
      attemptsLeft: Math.max(0, maxAttempts - attemptsUsed),
      bestScore: Number(row.best_score)
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:slug/submit', requireAuth, async (req, res, next) => {
  try {
    const game = GAME_MAP[req.params.slug];
    if (!game) {
      return res.status(404).json({ error: 'Game not found.' });
    }

    const sessionId = String(req.body?.sessionId || '').trim();
    const rawScore = Number(req.body?.score);
    const score = Number.isFinite(rawScore)
      ? Math.max(0, Math.min(100000, Math.round(rawScore)))
      : 0;

    if (!sessionId) {
      return res.status(400).json({ error: 'Missing game session token.' });
    }

    if (req.user.role === 'admin') {
      await query(
        `UPDATE game_sessions
         SET score = $1, status = 'preview_completed', completed_at = NOW()
         WHERE id = $2 AND user_id = $3`,
        [score, sessionId, req.user.id]
      );
      return res.json({
        isAdmin: true,
        score,
        bestScore: score,
        isNewBest: false,
        attemptsUsed: 0,
        maxAttempts: 99,
        attemptsLeft: 99
      });
    }

    const result = await withTransaction(async db => {
      const sess = await db.query(
        `UPDATE game_sessions
         SET score = $1, status = 'completed', completed_at = NOW()
         WHERE id = $2 AND user_id = $3 AND game_slug = $4 AND status = 'started'
         RETURNING id`,
        [score, sessionId, req.user.id, game.slug]
      );

      if (sess.rows.length === 0) {
        const current = await db.query(
          `SELECT attempts_used, max_attempts, best_score, last_score
           FROM game_progress WHERE user_id = $1 AND game_slug = $2`,
          [req.user.id, game.slug]
        );
        return { duplicate: true, row: current.rows[0] };
      }

      const prevRes = await db.query(
        `SELECT best_score FROM game_progress WHERE user_id = $1 AND game_slug = $2`,
        [req.user.id, game.slug]
      );
      const prevBest = Number(prevRes.rows[0]?.best_score ?? 0);

      const updated = await db.query(
        `UPDATE game_progress
         SET last_score = $1,
             best_score = GREATEST(best_score, $1),
             updated_at = NOW()
         WHERE user_id = $2 AND game_slug = $3
         RETURNING attempts_used, max_attempts, best_score, last_score`,
        [score, req.user.id, game.slug]
      );

      return {
        duplicate: false,
        isNewBest: score > prevBest,
        row: updated.rows[0]
      };
    });

    if (result.duplicate) {
      const r = result.row;
      const attemptsUsed = Number(r?.attempts_used ?? 0);
      const maxAttempts = Number(r?.max_attempts ?? 3);
      return res.json({
        alreadySubmitted: true,
        score,
        bestScore: Number(r?.best_score ?? 0),
        lastScore: Number(r?.last_score ?? 0),
        isNewBest: false,
        attemptsUsed,
        maxAttempts,
        attemptsLeft: Math.max(0, maxAttempts - attemptsUsed)
      });
    }

    const row = result.row;
    const attemptsUsed = Number(row.attempts_used);
    const maxAttempts = Number(row.max_attempts);
    res.json({
      score,
      bestScore: Number(row.best_score),
      lastScore: Number(row.last_score),
      isNewBest: result.isNewBest,
      attemptsUsed,
      maxAttempts,
      attemptsLeft: Math.max(0, maxAttempts - attemptsUsed)
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
