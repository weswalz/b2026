// Activity + access log contract tests — spawns the real server on a random high port with a temp DB.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const PORT = 40000 + Math.floor(Math.random() * 20000);
const BASE = `http://127.0.0.1:${PORT}`;
const KEY = 'test-admin-key';
let proc;

before(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blvd-activity-'));
  proc = spawn('node', [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(PORT), DB_PATH: path.join(tmp, 'test.db'), ADMIN_API_KEY: KEY, UPLOADS_DIR: path.join(tmp, 'uploads') },
    stdio: 'ignore'
  });
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`${BASE}/api/health`); if (r.ok) return; } catch (_e) {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('server did not start');
});

after(() => { proc.kill(); });

const auth = { 'x-auth-key': KEY, 'Content-Type': 'application/json' };
const future = () => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().slice(0, 10); };

test('mutating route writes an activity_log row visible via GET /api/activity', async () => {
  const create = await fetch(`${BASE}/api/events`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({ title: 'Activity Log Event', date: future(), time: '18:00', category: 'special' })
  });
  assert.strictEqual(create.status, 200);
  const event = await create.json();

  const activity = await fetch(`${BASE}/api/activity`, { headers: auth });
  assert.strictEqual(activity.status, 200);
  const rows = await activity.json();
  const match = rows.find((r) => r.resourceType === 'event' && r.resourceId === String(event.id) && r.action === 'create');
  assert.ok(match, 'expected an activity_log row for the event create');
});

test('GET /api/activity requires auth', async () => {
  const res = await fetch(`${BASE}/api/activity`);
  assert.strictEqual(res.status, 401);
});

test('GET /api/access-log requires auth and returns rows after a login attempt', async () => {
  const noAuth = await fetch(`${BASE}/api/access-log`);
  assert.strictEqual(noAuth.status, 401);

  // A failed login attempt should still log to access_log (never throw).
  await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'nobody@example.com', password: 'wrong' })
  });

  const res = await fetch(`${BASE}/api/access-log`, { headers: auth });
  assert.strictEqual(res.status, 200);
  const rows = await res.json();
  assert.ok(Array.isArray(rows));
  const loginAttempt = rows.find((r) => r.route && r.route.includes('/api/auth/login'));
  assert.ok(loginAttempt, 'expected an access_log row for the login attempt');
});

test('activity list is capped and ordered desc (limit 200)', async () => {
  const res = await fetch(`${BASE}/api/activity`, { headers: auth });
  const rows = await res.json();
  assert.ok(rows.length <= 200);
  if (rows.length > 1) {
    const first = new Date(rows[0].createdAt).getTime();
    const second = new Date(rows[1].createdAt).getTime();
    assert.ok(first >= second, 'expected descending order by createdAt');
  }
});
