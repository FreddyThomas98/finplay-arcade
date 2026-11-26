'use strict';

require('dotenv').config();

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const { initDb, query, getDbMode } = require('./db');
const authRoutes = require('./routes/auth.routes');
const gamesRoutes = require('./routes/games.routes');
const leaderboardRoutes = require('./routes/leaderboard.routes');
const adminRoutes = require('./routes/admin.routes');

const app = express();
const PORT = Number(process.env.PORT || 3000);

// Required behind Render's TLS proxy for secure cookies & accurate IP detection
app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  })
);
app.use(compression());
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

// Classroom-friendly rate limits (30-60 students often share one school Wi-Fi IP)
const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts from this network. Please wait a minute and try again.' }
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 800,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Server is busy — please try again in a few seconds.' }
});

app.get('/api/health', async (req, res) => {
  try {
    await query('SELECT 1');
    res.json({
      ok: true,
      app: 'FinPlay Arcade',
      db: getDbMode(),
      uptimeSeconds: Math.round(process.uptime())
    });
  } catch (err) {
    res.status(503).json({ ok: false, error: 'Database unavailable' });
  }
});

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/games', apiLimiter, gamesRoutes);
app.use('/api/leaderboard', apiLimiter, leaderboardRoutes);
app.use('/api/admin', apiLimiter, adminRoutes);

const publicDir = path.join(__dirname, '..', 'public');
app.use(
  express.static(publicDir, {
    etag: true,
    setHeaders(res, filePath) {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=300');
      }
    }
  })
);

// Catch-all for unknown API routes
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found.' });
});

// Fallback to main portal page
app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Global error handler — keeps the server alive for all 30+ concurrent students
app.use((err, req, res, next) => {
  console.error('[Server Error]', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Something went wrong on the server. Please try again.' });
});

async function start() {
  try {
    await initDb();
    const server = app.listen(PORT, () => {
      console.log(`🎮 FinPlay Arcade running on http://localhost:${PORT}`);
    });
    server.keepAliveTimeout = 65000;
    server.headersTimeout = 66000;
  } catch (err) {
    console.error('[Startup Failed]', err);
    process.exit(1);
  }
}

process.on('unhandledRejection', err => {
  console.error('[UnhandledRejection]', err);
});

if (require.main === module) {
  start();
}

module.exports = { app, start };
