'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../db');
const {
  normalizeEmail,
  isValidEmail,
  signToken,
  setAuthCookie,
  clearAuthCookie,
  loadUserFromRequest,
  requireAuth,
  publicUser
} = require('../auth');
const { AVATARS } = require('../games-config');

const router = express.Router();

router.get('/me', async (req, res, next) => {
  try {
    const user = await loadUserFromRequest(req);
    res.json({ user: publicUser(user), avatars: AVATARS });
  } catch (err) {
    next(err);
  }
});

router.post('/signup', async (req, res, next) => {
  try {
    const fullName = String(req.body?.fullName || '').trim().replace(/\s+/g, ' ');
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');
    const requestedAvatar = String(req.body?.avatar || '').trim();
    const avatar = AVATARS.includes(requestedAvatar) ? requestedAvatar : AVATARS[0];

    if (fullName.length < 2 || fullName.length > 80) {
      return res
        .status(400)
        .json({ error: 'Please enter your name (2–80 characters).' });
    }
    if (!isValidEmail(email)) {
      return res
        .status(400)
        .json({ error: 'Please enter a valid Gmail address (e.g. name@gmail.com).' });
    }
    if (password.length < 4 || password.length > 100) {
      return res
        .status(400)
        .json({ error: 'Password must be at least 4 characters long.' });
    }

    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({
        error: 'This Gmail is already registered! Switch to Log In instead.'
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const inserted = await query(
      `INSERT INTO users (full_name, email, password_hash, avatar, role)
       VALUES ($1, $2, $3, $4, 'student')
       RETURNING id, full_name, email, avatar, role, created_at`,
      [fullName, email, passwordHash, avatar]
    );

    const user = inserted.rows[0];
    setAuthCookie(res, signToken(user));
    res.status(201).json({ user: publicUser(user) });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({
        error: 'This Gmail is already registered! Switch to Log In instead.'
      });
    }
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');

    if (!isValidEmail(email) || !password) {
      return res
        .status(400)
        .json({ error: 'Enter your Gmail address and password.' });
    }

    const found = await query(
      'SELECT id, full_name, email, password_hash, avatar, role, created_at FROM users WHERE email = $1',
      [email]
    );

    if (found.rows.length === 0) {
      return res.status(401).json({
        error: 'No account found with that Gmail. First time here? Sign up!'
      });
    }

    const user = found.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Incorrect password. Try again!' });
    }

    setAuthCookie(res, signToken(user));
    res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.patch('/avatar', requireAuth, async (req, res, next) => {
  try {
    const avatar = String(req.body?.avatar || '').trim();
    if (!AVATARS.includes(avatar)) {
      return res.status(400).json({ error: 'Please select a valid avatar.' });
    }
    const updated = await query(
      `UPDATE users SET avatar = $1 WHERE id = $2
       RETURNING id, full_name, email, avatar, role, created_at`,
      [avatar, req.user.id]
    );
    res.json({ user: publicUser(updated.rows[0]) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
