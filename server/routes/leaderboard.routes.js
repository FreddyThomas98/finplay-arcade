'use strict';

const express = require('express');
const { query } = require('../db');
const { requireAuth } = require('../auth');
const { GAMES, GAME_SLUGS } = require('../games-config');

const router = express.Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const [studentsRes, progressRes, sessionsRes] = await Promise.all([
      query(
        `SELECT id, full_name, avatar, created_at
         FROM users
         WHERE role = 'student'
         ORDER BY id ASC`
      ),
      query(
        `SELECT gp.user_id, gp.game_slug, gp.best_score, gp.last_score,
                gp.attempts_used, gp.max_attempts, gp.updated_at
         FROM game_progress gp
         JOIN users u ON u.id = gp.user_id
         WHERE u.role = 'student'`
      ),
      query(
        `SELECT COUNT(*)::INT AS total_plays
         FROM game_sessions gs
         JOIN users u ON u.id = gs.user_id
         WHERE u.role = 'student'`
      )
    ]);

    const progressByUser = new Map();
    const byGame = Object.fromEntries(GAME_SLUGS.map(s => [s, []]));
    const studentMap = new Map();

    for (const s of studentsRes.rows) {
      studentMap.set(Number(s.id), {
        id: Number(s.id),
        fullName: s.full_name,
        avatar: s.avatar,
        createdAt: s.created_at
      });
      progressByUser.set(Number(s.id), {});
    }

    for (const row of progressRes.rows) {
      const uid = Number(row.user_id);
      const student = studentMap.get(uid);
      if (!student) continue;

      const bestScore = Number(row.best_score);
      const attemptsUsed = Number(row.attempts_used);
      const maxAttempts = Number(row.max_attempts);

      progressByUser.get(uid)[row.game_slug] = {
        bestScore,
        lastScore: Number(row.last_score),
        attemptsUsed,
        maxAttempts,
        updatedAt: row.updated_at
      };

      if (byGame[row.game_slug] && (attemptsUsed > 0 || bestScore > 0)) {
        byGame[row.game_slug].push({
          userId: uid,
          fullName: student.fullName,
          avatar: student.avatar,
          bestScore,
          attemptsUsed,
          maxAttempts,
          updatedAt: row.updated_at
        });
      }
    }

    for (const slug of GAME_SLUGS) {
      byGame[slug].sort((a, b) => {
        if (b.bestScore !== a.bestScore) return b.bestScore - a.bestScore;
        return new Date(a.updatedAt) - new Date(b.updatedAt);
      });
      byGame[slug] = byGame[slug].map((entry, idx) => ({
        rank: idx + 1,
        ...entry
      }));
    }

    const overall = Array.from(studentMap.values()).map(student => {
      const map = progressByUser.get(student.id) || {};
      const scores = {};
      let totalScore = 0;
      let gamesPlayed = 0;
      let totalAttemptsUsed = 0;
      let latestUpdate = 0;

      for (const slug of GAME_SLUGS) {
        const g = map[slug];
        const bs = g ? g.bestScore : 0;
        scores[slug] = bs;
        totalScore += bs;
        if (g && g.attemptsUsed > 0) {
          gamesPlayed++;
          totalAttemptsUsed += g.attemptsUsed;
          const ts = new Date(g.updatedAt).getTime();
          if (ts > latestUpdate) latestUpdate = ts;
        }
      }

      return {
        userId: student.id,
        fullName: student.fullName,
        avatar: student.avatar,
        totalScore,
        gamesPlayed,
        totalAttemptsUsed,
        scores,
        latestUpdate
      };
    });

    overall.sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      if (b.gamesPlayed !== a.gamesPlayed) return b.gamesPlayed - a.gamesPlayed;
      if (a.latestUpdate !== b.latestUpdate) {
        return (a.latestUpdate || Number.MAX_SAFE_INTEGER) - (b.latestUpdate || Number.MAX_SAFE_INTEGER);
      }
      return a.fullName.localeCompare(b.fullName);
    });

    const rankedOverall = overall.map((entry, idx) => ({
      rank: idx + 1,
      ...entry
    }));

    const highestTotalScore = rankedOverall[0]?.totalScore || 0;
    const totalPlays = Number(sessionsRes.rows[0]?.total_plays || 0);

    res.json({
      overall: rankedOverall,
      byGame,
      games: GAMES.map(g => ({
        slug: g.slug,
        title: g.title,
        shortTitle: g.shortTitle,
        icon: g.icon,
        accent: g.accent
      })),
      stats: {
        totalStudents: rankedOverall.length,
        totalPlays,
        highestTotalScore
      },
      currentUserId: Number(req.user.id)
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
