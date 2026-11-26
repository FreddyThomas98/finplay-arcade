'use strict';

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

let pool = null;
let pglite = null;
let dbMode = 'uninitialized';

// Serialize PGlite calls so local concurrency stress tests never collide on WASM transactions.
let localQueue = Promise.resolve();
function enqueueLocal(fn) {
  const next = localQueue.then(fn, fn);
  localQueue = next.catch(() => {});
  return next;
}

function shouldUseSsl(connectionString) {
  if (process.env.PGSSLMODE === 'disable') return false;
  if (!connectionString) return false;
  const lower = connectionString.toLowerCase();
  if (lower.includes('localhost') || lower.includes('127.0.0.1')) return false;
  return true;
}

async function ensureConnected() {
  if (pool || pglite) return;

  if (process.env.DATABASE_URL) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.PG_POOL_MAX || 10),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 8000,
      ssl: shouldUseSsl(process.env.DATABASE_URL)
        ? { rejectUnauthorized: false }
        : false
    });
    pool.on('error', err => {
      console.error('[DB] Unexpected idle client error:', err.message);
    });
    dbMode = 'postgres';
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    const dataDir =
      process.env.LOCAL_DB_DIR ||
      path.join(__dirname, '..', 'data', 'local-pg');
    fs.mkdirSync(dataDir, { recursive: true });
    pglite = new PGlite(dataDir);
    await pglite.waitReady;
    dbMode = 'pglite-local';
  }
}

async function query(text, params = []) {
  await ensureConnected();
  if (pool) {
    return pool.query(text, params);
  }
  return enqueueLocal(() => pglite.query(text, params));
}

async function withTransaction(fn) {
  await ensureConnected();
  if (pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn({
        query: (text, params = []) => client.query(text, params)
      });
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch (_) {}
      throw err;
    } finally {
      client.release();
    }
  }

  return enqueueLocal(async () => {
    await pglite.query('BEGIN');
    try {
      const result = await fn({
        query: (text, params = []) => pglite.query(text, params)
      });
      await pglite.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await pglite.query('ROLLBACK');
      } catch (_) {}
      throw err;
    }
  });
}

async function getDefaultMaxAttempts(db = { query }) {
  const res = await db.query(
    "SELECT value FROM portal_settings WHERE key = 'default_max_attempts'"
  );
  const parsed = Number(res.rows[0]?.value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 20 ? parsed : 3;
}

async function initDb() {
  await ensureConnected();

  const schemaStatements = [
    `CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      full_name VARCHAR(120) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      avatar VARCHAR(16) NOT NULL DEFAULT '🦊',
      role VARCHAR(20) NOT NULL DEFAULT 'student',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS portal_settings (
      key VARCHAR(64) PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS game_progress (
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      game_slug VARCHAR(64) NOT NULL,
      attempts_used INT NOT NULL DEFAULT 0,
      max_attempts INT NOT NULL DEFAULT 3,
      best_score INT NOT NULL DEFAULT 0,
      last_score INT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, game_slug)
    )`,
    `CREATE TABLE IF NOT EXISTS game_sessions (
      id VARCHAR(64) PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      game_slug VARCHAR(64) NOT NULL,
      score INT,
      status VARCHAR(20) NOT NULL DEFAULT 'started',
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    )`,
    `CREATE INDEX IF NOT EXISTS idx_game_progress_slug_score
      ON game_progress (game_slug, best_score DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_game_sessions_user_slug
      ON game_sessions (user_id, game_slug, started_at DESC)`
  ];

  for (const sql of schemaStatements) {
    await query(sql);
  }

  const defaultAttempts = Math.min(
    20,
    Math.max(1, Number(process.env.DEFAULT_MAX_ATTEMPTS || 3) || 3)
  );
  await query(
    `INSERT INTO portal_settings (key, value)
     VALUES ('default_max_attempts', $1)
     ON CONFLICT (key) DO NOTHING`,
    [String(defaultAttempts)]
  );

  // Seed or ensure admin user
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@gmail.com')
    .trim()
    .toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123';
  const adminName = (process.env.ADMIN_NAME || 'FinPlay Admin').trim();

  const existingAdmin = await query(
    'SELECT id, role FROM users WHERE email = $1',
    [adminEmail]
  );

  if (existingAdmin.rows.length === 0) {
    const hash = await bcrypt.hash(adminPassword, 10);
    await query(
      `INSERT INTO users (full_name, email, password_hash, avatar, role)
       VALUES ($1, $2, $3, '👑', 'admin')`,
      [adminName, adminEmail, hash]
    );
    console.log(`[DB] Seeded admin account: ${adminEmail}`);
  } else if (existingAdmin.rows[0].role !== 'admin') {
    await query("UPDATE users SET role = 'admin', avatar = '👑' WHERE id = $1", [
      existingAdmin.rows[0].id
    ]);
  }

  console.log(`[DB] Connected (${dbMode}) and schema verified.`);
}

function getDbMode() {
  return dbMode;
}

async function closeDb() {
  if (pool) {
    await pool.end();
    pool = null;
  }
  if (pglite) {
    await pglite.close();
    pglite = null;
  }
}

module.exports = {
  query,
  withTransaction,
  initDb,
  getDefaultMaxAttempts,
  getDbMode,
  closeDb
};
