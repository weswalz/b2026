// Redirects manager contract tests — spawns the real server on a random high port with a temp DB.
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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blvd-redirects-'));
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

test('exact match wins over prefix and regex for the same path', async () => {
  await fetch(`${BASE}/api/redirects`, { method: 'POST', headers: auth, body: JSON.stringify({ fromPath: '/old-menu', toPath: '/menu-exact', matchType: 'exact' }) });
  await fetch(`${BASE}/api/redirects`, { method: 'POST', headers: auth, body: JSON.stringify({ fromPath: '/old', toPath: '/prefix-target', matchType: 'prefix' }) });
  await fetch(`${BASE}/api/redirects`, { method: 'POST', headers: auth, body: JSON.stringify({ fromPath: '^/old-.*$', toPath: '/regex-target', matchType: 'regex' }) });

  const res = await fetch(`${BASE}/api/redirects/resolve?path=${encodeURIComponent('/old-menu')}`);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.toPath, '/menu-exact', 'exact match must win over prefix and regex');
});

test('prefix match wins over regex when no exact match exists (respects / boundary: /old/events, not /old-events)', async () => {
  const res = await fetch(`${BASE}/api/redirects/resolve?path=${encodeURIComponent('/old/events')}`);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.toPath, '/prefix-target', 'prefix match must win over regex when no exact match');
});

test('prefix match respects a boundary — /oldstuff does not match prefix /old (no exact, no regex hit either)', async () => {
  const res = await fetch(`${BASE}/api/redirects/resolve?path=${encodeURIComponent('/oldstuff')}`);
  // "/oldstuff" fails the "/old" + "/" boundary (not "/old" itself, not "/old/...").
  // ^/old-.*$ also does not match "/oldstuff" (no literal hyphen after "old"), so no match at all.
  assert.strictEqual(res.status, 404);
});

test('regex match applies when no exact/prefix match exists (/old-gallery has a hyphen, fails the / boundary, falls to regex)', async () => {
  const res = await fetch(`${BASE}/api/redirects/resolve?path=${encodeURIComponent('/old-gallery')}`);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.toPath, '/regex-target');
});

test('no match returns 404', async () => {
  const res = await fetch(`${BASE}/api/redirects/resolve?path=${encodeURIComponent('/totally-unmapped')}`);
  assert.strictEqual(res.status, 404);
});

test('reserved prefixes rejected on create', async () => {
  for (const from of ['/admin', '/admin/events', '/api', '/api/events', '/uploads', '/uploads/x.png', '/assets']) {
    const res = await fetch(`${BASE}/api/redirects`, { method: 'POST', headers: auth, body: JSON.stringify({ fromPath: from, toPath: '/somewhere', matchType: 'exact' }) });
    assert.strictEqual(res.status, 400, `expected 400 for reserved fromPath ${from}`);
  }
});

test('unsafe schemes and protocol-relative targets rejected', async () => {
  const cases = ['javascript:alert(1)', 'data:text/html,x', 'vbscript:msgbox(1)', '//evil.example.com/phish'];
  for (const to of cases) {
    const res = await fetch(`${BASE}/api/redirects`, { method: 'POST', headers: auth, body: JSON.stringify({ fromPath: `/unsafe-${cases.indexOf(to)}`, toPath: to, matchType: 'exact' }) });
    assert.strictEqual(res.status, 400, `expected 400 for unsafe toPath ${to}`);
  }
});

test('redirect loop (self-referencing chain) rejected at write time', async () => {
  const a = await fetch(`${BASE}/api/redirects`, { method: 'POST', headers: auth, body: JSON.stringify({ fromPath: '/loop-a', toPath: '/loop-b', matchType: 'exact' }) });
  assert.strictEqual(a.status, 201);
  const b = await fetch(`${BASE}/api/redirects`, { method: 'POST', headers: auth, body: JSON.stringify({ fromPath: '/loop-b', toPath: '/loop-a', matchType: 'exact' }) });
  assert.strictEqual(b.status, 400, 'creating /loop-b -> /loop-a must be rejected: it closes a cycle with /loop-a -> /loop-b');
});

test('ReDoS-shaped regex pattern rejected', async () => {
  const res = await fetch(`${BASE}/api/redirects`, { method: 'POST', headers: auth, body: JSON.stringify({ fromPath: '^(a+)+$', toPath: '/somewhere', matchType: 'regex' }) });
  assert.strictEqual(res.status, 400);
});

test('CRUD: create, list, update, deactivate, delete', async () => {
  const create = await fetch(`${BASE}/api/redirects`, { method: 'POST', headers: auth, body: JSON.stringify({ fromPath: '/crud-test', toPath: '/crud-target', matchType: 'exact', notes: 'test note' }) });
  assert.strictEqual(create.status, 201);
  const created = await create.json();
  assert.strictEqual(created.statusCode, 301, 'default status code is 301');
  assert.strictEqual(created.isActive, 1);

  const list = await fetch(`${BASE}/api/redirects`, { headers: auth });
  assert.strictEqual(list.status, 200);
  const rows = await list.json();
  assert.ok(rows.some((r) => r.id === created.id));

  const update = await fetch(`${BASE}/api/redirects/${created.id}`, { method: 'PUT', headers: auth, body: JSON.stringify({ toPath: '/crud-target-2', isActive: false }) });
  assert.strictEqual(update.status, 200);
  const updated = await update.json();
  assert.strictEqual(updated.toPath, '/crud-target-2');
  assert.strictEqual(updated.isActive, 0);

  // Deactivated redirect must not resolve
  const resolveInactive = await fetch(`${BASE}/api/redirects/resolve?path=${encodeURIComponent('/crud-test')}`);
  assert.strictEqual(resolveInactive.status, 404);

  const del = await fetch(`${BASE}/api/redirects/${created.id}`, { method: 'DELETE', headers: auth });
  assert.strictEqual(del.status, 200);
  const listAfter = await fetch(`${BASE}/api/redirects`, { headers: auth });
  const rowsAfter = await listAfter.json();
  assert.ok(!rowsAfter.some((r) => r.id === created.id));
});

test('hit count increments on successful resolve', async () => {
  const create = await fetch(`${BASE}/api/redirects`, { method: 'POST', headers: auth, body: JSON.stringify({ fromPath: '/hit-count-test', toPath: '/hit-target', matchType: 'exact' }) });
  const created = await create.json();
  assert.strictEqual(created.hitCount, 0);

  await fetch(`${BASE}/api/redirects/resolve?path=${encodeURIComponent('/hit-count-test')}`);
  await fetch(`${BASE}/api/redirects/resolve?path=${encodeURIComponent('/hit-count-test')}`);

  const list = await fetch(`${BASE}/api/redirects`, { headers: auth });
  const rows = await list.json();
  const row = rows.find((r) => r.id === created.id);
  assert.strictEqual(row.hitCount, 2);
  assert.ok(row.lastHitAt, 'lastHitAt must be set after a hit');
});

test('endpoints require auth except public resolve', async () => {
  const noAuthList = await fetch(`${BASE}/api/redirects`);
  assert.strictEqual(noAuthList.status, 401);
  const noAuthCreate = await fetch(`${BASE}/api/redirects`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fromPath: '/x', toPath: '/y', matchType: 'exact' }) });
  assert.strictEqual(noAuthCreate.status, 401);
  const publicResolve = await fetch(`${BASE}/api/redirects/resolve?path=/does-not-exist`);
  assert.strictEqual(publicResolve.status, 404, 'resolve is public — 404, not 401');
});

test('duplicate fromPath rejected with 409', async () => {
  await fetch(`${BASE}/api/redirects`, { method: 'POST', headers: auth, body: JSON.stringify({ fromPath: '/dup-source', toPath: '/dup-target-1', matchType: 'exact' }) });
  const dup = await fetch(`${BASE}/api/redirects`, { method: 'POST', headers: auth, body: JSON.stringify({ fromPath: '/dup-source', toPath: '/dup-target-2', matchType: 'exact' }) });
  assert.strictEqual(dup.status, 409);
});
