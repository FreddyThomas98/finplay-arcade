'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

// Use an isolated temporary database directory for testing
const tmpDbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'finplay-test-'));
process.env.LOCAL_DB_DIR = tmpDbDir;
process.env.DATABASE_URL = '';
process.env.ADMIN_EMAIL = 'admin@gmail.com';
process.env.ADMIN_PASSWORD = 'Admin@123';
process.env.PORT = '0';

const { initDb, closeDb } = require('../server/db');
const { app } = require('../server/index');

async function req(baseUrl, pathname, { method = 'GET', body, cookie } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const setCookie = res.headers.get('set-cookie');
  const nextCookie = setCookie ? setCookie.split(';')[0] : cookie;
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json')
    ? await res.json()
    : await res.text();
  return { status: res.status, data, cookie: nextCookie };
}

async function run() {
  await initDb();
  const server = await new Promise(resolve => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`🧪 Running FinPlay Arcade verification suite against ${baseUrl}...`);

  try {
    // 1. Health check
    const health = await req(baseUrl, '/api/health');
    assert.strictEqual(health.status, 200);
    assert.strictEqual(health.data.ok, true);
    console.log('  ✅ 1. Health check passed');

    // 2. 35 concurrent student signups
    const N = 35;
    const t0 = Date.now();
    const signups = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        req(baseUrl, '/api/auth/signup', {
          method: 'POST',
          body: {
            fullName: `Student ${i + 1}`,
            email: `student${i + 1}@gmail.com`,
            password: `pass${i + 1}`,
            avatar: '🦊'
          }
        })
      )
    );
    signups.forEach((r, i) => {
      assert.strictEqual(r.status, 201, `Signup failed for student ${i + 1}: ${JSON.stringify(r.data)}`);
      assert.ok(r.cookie, `Missing auth cookie for student ${i + 1}`);
    });
    console.log(`  ✅ 2. ${N} concurrent student signups passed (${Date.now() - t0}ms)`);

    // 3. Duplicate email rejection
    const dup = await req(baseUrl, '/api/auth/signup', {
      method: 'POST',
      body: { fullName: 'Dup', email: 'student1@gmail.com', password: 'password1' }
    });
    assert.strictEqual(dup.status, 409);
    console.log('  ✅ 3. Duplicate Gmail rejection passed');

    // 4. All 35 students simultaneously start & submit Flappy Finance
    const t1 = Date.now();
    await Promise.all(
      signups.map(async (s, idx) => {
        const start = await req(baseUrl, '/api/games/flappy-finance/start', {
          method: 'POST',
          body: {},
          cookie: s.cookie
        });
        assert.strictEqual(start.status, 200);
        assert.strictEqual(start.data.attemptsLeft, 2);

        const score = (idx + 1) * 100;
        const submit = await req(baseUrl, '/api/games/flappy-finance/submit', {
          method: 'POST',
          body: { sessionId: start.data.sessionId, score },
          cookie: s.cookie
        });
        assert.strictEqual(submit.status, 200);
        assert.strictEqual(submit.data.bestScore, score);
      })
    );
    console.log(`  ✅ 4. ${N} concurrent game starts + score submissions passed (${Date.now() - t1}ms)`);

    // 5. Race-condition test: 5 simultaneous starts for Student 1 on Finance Blaster -> only 3 allowed!
    const s1 = signups[0];
    const burst = await Promise.all(
      Array.from({ length: 5 }, () =>
        req(baseUrl, '/api/games/finance-blaster/start', {
          method: 'POST',
          body: {},
          cookie: s1.cookie
        })
      )
    );
    const allowed = burst.filter(r => r.status === 200);
    const blocked = burst.filter(r => r.status === 403);
    assert.strictEqual(allowed.length, 3, `Expected 3 allowed starts, got ${allowed.length}`);
    assert.strictEqual(blocked.length, 2, `Expected 2 blocked starts, got ${blocked.length}`);

    // Submit 400, 900, 300 -> bestScore must stay 900
    await req(baseUrl, '/api/games/finance-blaster/submit', {
      method: 'POST',
      body: { sessionId: allowed[0].data.sessionId, score: 400 },
      cookie: s1.cookie
    });
    await req(baseUrl, '/api/games/finance-blaster/submit', {
      method: 'POST',
      body: { sessionId: allowed[1].data.sessionId, score: 900 },
      cookie: s1.cookie
    });
    const sub3 = await req(baseUrl, '/api/games/finance-blaster/submit', {
      method: 'POST',
      body: { sessionId: allowed[2].data.sessionId, score: 300 },
      cookie: s1.cookie
    });
    assert.strictEqual(sub3.data.bestScore, 900);
    assert.strictEqual(sub3.data.lastScore, 300);
    assert.strictEqual(sub3.data.attemptsLeft, 0);
    console.log('  ✅ 5. Atomic 3-attempt cap & best-score retention passed under parallel burst');

    // 6. Leaderboard accuracy + student blocked from admin routes
    const board = await req(baseUrl, '/api/leaderboard', { cookie: s1.cookie });
    assert.strictEqual(board.status, 200);
    assert.strictEqual(board.data.overall.length, N);
    assert.strictEqual(board.data.overall[0].fullName, 'Student 35'); // 3500 pts
    assert.strictEqual(board.data.overall[0].totalScore, 3500);

    const forbiddenAdmin = await req(baseUrl, '/api/admin/overview', { cookie: s1.cookie });
    assert.strictEqual(forbiddenAdmin.status, 403);
    console.log('  ✅ 6. Toppers leaderboard accuracy & student admin-block passed');

    // 7. Admin login, single-student reset, all-student reset, and CSV export
    const adminLogin = await req(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: 'admin@gmail.com', password: 'Admin@123' }
    });
    assert.strictEqual(adminLogin.status, 200);
    assert.strictEqual(adminLogin.data.user.role, 'admin');

    const overview = await req(baseUrl, '/api/admin/overview', { cookie: adminLogin.cookie });
    assert.strictEqual(overview.status, 200);
    assert.strictEqual(overview.data.students.length, N);

    // Reset Student 1 on finance-blaster (keep best score 900)
    const student1Id = s1.data.user.id;
    const resetOne = await req(baseUrl, '/api/admin/reset-student', {
      method: 'POST',
      body: { userId: student1Id, gameSlug: 'finance-blaster', clearScores: false },
      cookie: adminLogin.cookie
    });
    assert.strictEqual(resetOne.status, 200);

    const s1Status = await req(baseUrl, '/api/games/finance-blaster/status', { cookie: s1.cookie });
    assert.strictEqual(s1Status.data.attemptsLeft, 3);
    assert.strictEqual(s1Status.data.bestScore, 900);

    // Reset ALL students on flappy-finance
    const resetAll = await req(baseUrl, '/api/admin/reset-all', {
      method: 'POST',
      body: { gameSlug: 'flappy-finance', clearScores: false },
      cookie: adminLogin.cookie
    });
    assert.strictEqual(resetAll.status, 200);

    const s35Status = await req(baseUrl, '/api/games/flappy-finance/status', {
      cookie: signups[N - 1].cookie
    });
    assert.strictEqual(s35Status.data.attemptsLeft, 3);
    assert.strictEqual(s35Status.data.bestScore, 3500);

    // CSV export
    const csv = await req(baseUrl, '/api/admin/export-csv', { cookie: adminLogin.cookie });
    assert.strictEqual(csv.status, 200);
    assert.ok(csv.data.includes('Student 35'));
    assert.ok(csv.data.split('\r\n').length === N + 1);
    console.log('  ✅ 7. Admin single-student reset, reset-all, and CSV export passed');

    // 8. Admin Lock / Unlock game controls
    const lockRes = await req(baseUrl, '/api/admin/toggle-lock', {
      method: 'POST',
      body: { gameSlug: 'cash-collector', locked: true },
      cookie: adminLogin.cookie
    });
    assert.strictEqual(lockRes.status, 200);
    assert.ok(lockRes.data.lockedGames.includes('cash-collector'));

    const studentLockedStart = await req(baseUrl, '/api/games/cash-collector/start', {
      method: 'POST',
      body: {},
      cookie: s1.cookie
    });
    assert.strictEqual(studentLockedStart.status, 403);
    assert.strictEqual(studentLockedStart.data.isLocked, true);

    const adminPreviewLocked = await req(baseUrl, '/api/games/cash-collector/start', {
      method: 'POST',
      body: {},
      cookie: adminLogin.cookie
    });
    assert.strictEqual(adminPreviewLocked.status, 200);

    const unlockRes = await req(baseUrl, '/api/admin/toggle-lock', {
      method: 'POST',
      body: { gameSlug: 'cash-collector', locked: false },
      cookie: adminLogin.cookie
    });
    assert.strictEqual(unlockRes.status, 200);
    assert.ok(!unlockRes.data.lockedGames.includes('cash-collector'));

    const studentUnlockedStart = await req(baseUrl, '/api/games/cash-collector/start', {
      method: 'POST',
      body: {},
      cookie: s1.cookie
    });
    assert.strictEqual(studentUnlockedStart.status, 200);
    console.log('  ✅ 8. Admin game lock & unlock enforcement passed');

    console.log('\n🎉 ALL VERIFICATION TESTS PASSED (35 concurrent users, 0 failures)!');
  } finally {
    await new Promise(resolve => server.close(resolve));
    await closeDb();
    fs.rmSync(tmpDbDir, { recursive: true, force: true });
  }
}

run().catch(err => {
  console.error('❌ Load test failed:', err);
  process.exit(1);
});
