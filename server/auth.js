'use strict';

const jwt = require('jsonwebtoken');
const { query } = require('./db');

const COOKIE_NAME = 'finplay_token';
const JWT_SECRET =
  process.env.JWT_SECRET || 'finplay-arcade-dev-secret-change-in-production';
const IS_PROD = process.env.NODE_ENV === 'production';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(raw) {
  return String(raw || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return email.length <= 254 && EMAIL_RE.test(email);
}

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, {
    expiresIn: '7d'
  });
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PROD,
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PROD,
    path: '/'
  });
}

async function loadUserFromRequest(req) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const res = await query(
      'SELECT id, full_name, email, avatar, role, created_at FROM users WHERE id = $1',
      [payload.sub]
    );
    return res.rows[0] || null;
  } catch (_) {
    return null;
  }
}

async function requireAuth(req, res, next) {
  try {
    const user = await loadUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ error: 'Please log in to continue.' });
    }
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  next();
}

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    avatar: row.avatar,
    role: row.role,
    createdAt: row.created_at
  };
}

module.exports = {
  COOKIE_NAME,
  normalizeEmail,
  isValidEmail,
  signToken,
  setAuthCookie,
  clearAuthCookie,
  loadUserFromRequest,
  requireAuth,
  requireAdmin,
  publicUser
};
