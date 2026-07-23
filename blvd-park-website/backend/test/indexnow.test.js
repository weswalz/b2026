// IndexNow client (B7) — unit tests against backend/lib/indexnow.js directly (fetch mocked),
// plus an integration check that page/event mutations never fail when INDEXNOW_KEY is unset.
const { test, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

test('pingIndexNow resolves false and makes no request when INDEXNOW_KEY is unset', async () => {
  const originalKey = process.env.INDEXNOW_KEY;
  const originalFetch = global.fetch;
  delete process.env.INDEXNOW_KEY;
  let called = false;
  global.fetch = async () => { called = true; return { ok: true }; };
  try {
    delete require.cache[require.resolve('../lib/indexnow')];
    const { pingIndexNow } = require('../lib/indexnow');
    const result = await pingIndexNow('https://blvdpark.com/some-page');
    assert.strictEqual(result, false);
    assert.strictEqual(called, false, 'fetch must not be called when INDEXNOW_KEY is unset');
  } finally {
    if (originalKey !== undefined) process.env.INDEXNOW_KEY = originalKey; else delete process.env.INDEXNOW_KEY;
    global.fetch = originalFetch;
    delete require.cache[require.resolve('../lib/indexnow')];
  }
});

test('pingIndexNow posts the correct IndexNow payload shape and never throws on success', async () => {
  const originalKey = process.env.INDEXNOW_KEY;
  const originalFetch = global.fetch;
  process.env.INDEXNOW_KEY = 'abc123def456';
  let capturedUrl, capturedInit;
  global.fetch = async (url, init) => { capturedUrl = url; capturedInit = init; return { ok: true, status: 200 }; };
  try {
    delete require.cache[require.resolve('../lib/indexnow')];
    const { pingIndexNow, INDEXNOW_ENDPOINT } = require('../lib/indexnow');
    const result = await pingIndexNow('https://blvdpark.com/faq-test-page');
    assert.strictEqual(result, true);
    assert.strictEqual(capturedUrl, INDEXNOW_ENDPOINT);
    const body = JSON.parse(capturedInit.body);
    assert.strictEqual(body.host, 'blvdpark.com');
    assert.strictEqual(body.key, 'abc123def456');
    assert.strictEqual(body.keyLocation, 'https://blvdpark.com/abc123def456.txt');
    assert.deepStrictEqual(body.urlList, ['https://blvdpark.com/faq-test-page']);
  } finally {
    if (originalKey !== undefined) process.env.INDEXNOW_KEY = originalKey; else delete process.env.INDEXNOW_KEY;
    global.fetch = originalFetch;
    delete require.cache[require.resolve('../lib/indexnow')];
  }
});

test('pingIndexNow swallows network failures and resolves false (never throws)', async () => {
  const originalKey = process.env.INDEXNOW_KEY;
  const originalFetch = global.fetch;
  process.env.INDEXNOW_KEY = 'abc123def456';
  global.fetch = async () => { throw new Error('ECONNREFUSED'); };
  try {
    delete require.cache[require.resolve('../lib/indexnow')];
    const { pingIndexNow } = require('../lib/indexnow');
    const result = await pingIndexNow('https://blvdpark.com/some-page');
    assert.strictEqual(result, false);
  } finally {
    if (originalKey !== undefined) process.env.INDEXNOW_KEY = originalKey; else delete process.env.INDEXNOW_KEY;
    global.fetch = originalFetch;
    delete require.cache[require.resolve('../lib/indexnow')];
  }
});

test('pingIndexNow swallows non-2xx HTTP responses and resolves false (never throws)', async () => {
  const originalKey = process.env.INDEXNOW_KEY;
  const originalFetch = global.fetch;
  process.env.INDEXNOW_KEY = 'abc123def456';
  global.fetch = async () => ({ ok: false, status: 403 });
  try {
    delete require.cache[require.resolve('../lib/indexnow')];
    const { pingIndexNow } = require('../lib/indexnow');
    const result = await pingIndexNow('https://blvdpark.com/some-page');
    assert.strictEqual(result, false);
  } finally {
    if (originalKey !== undefined) process.env.INDEXNOW_KEY = originalKey; else delete process.env.INDEXNOW_KEY;
    global.fetch = originalFetch;
    delete require.cache[require.resolve('../lib/indexnow')];
  }
});

test('pingIndexNow dedups a URL pinged twice within the 1-hour window (second call is a no-op)', async () => {
  const originalKey = process.env.INDEXNOW_KEY;
  const originalFetch = global.fetch;
  process.env.INDEXNOW_KEY = 'abc123def456';
  let callCount = 0;
  global.fetch = async () => { callCount += 1; return { ok: true, status: 200 }; };
  try {
    delete require.cache[require.resolve('../lib/indexnow')];
    const { pingIndexNow } = require('../lib/indexnow');
    const first = await pingIndexNow('https://blvdpark.com/dedup-page');
    const second = await pingIndexNow('https://blvdpark.com/dedup-page');
    assert.strictEqual(first, true);
    assert.strictEqual(second, false, 'second ping of the same URL within the dedup window must be a no-op');
    assert.strictEqual(callCount, 1);
  } finally {
    if (originalKey !== undefined) process.env.INDEXNOW_KEY = originalKey; else delete process.env.INDEXNOW_KEY;
    global.fetch = originalFetch;
    delete require.cache[require.resolve('../lib/indexnow')];
  }
});

// Integration: with INDEXNOW_KEY left unset in the spawned server's env, page and event
// mutations that would otherwise trigger a ping must still succeed normally (silent no-op).
test('page publish and event create succeed normally when INDEXNOW_KEY is unset on the server', async () => {
  const PORT = 40000 + Math.floor(Math.random() * 20000);
  const BASE = `http://127.0.0.1:${PORT}`;
  const KEY = 'test-admin-key';
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blvd-indexnow-'));
  const env = { ...process.env, PORT: String(PORT), DB_PATH: path.join(tmp, 'test.db'), ADMIN_API_KEY: KEY, UPLOADS_DIR: path.join(tmp, 'uploads') };
  delete env.INDEXNOW_KEY;
  const proc = spawn('node', [path.join(__dirname, '..', 'server.js')], { env, stdio: 'ignore' });
  try {
    let up = false;
    for (let i = 0; i < 50; i++) {
      try { const r = await fetch(`${BASE}/api/health`); if (r.ok) { up = true; break; } } catch (_e) {}
      await new Promise((r) => setTimeout(r, 200));
    }
    assert.ok(up, 'server did not start');

    const auth = { 'x-auth-key': KEY, 'Content-Type': 'application/json' };
    const pageRes = await fetch(`${BASE}/api/pages`, {
      method: 'POST', headers: auth,
      body: JSON.stringify({ title: 'IndexNow Test Page', slug: 'indexnow-test-page', status: 'published', robots: 'index, follow' }),
    });
    assert.strictEqual(pageRes.status, 201);

    const eventRes = await fetch(`${BASE}/api/events`, {
      method: 'POST', headers: auth,
      body: JSON.stringify({ title: 'IndexNow Test Event', date: '2026-12-01', time: '19:00', category: 'special', slug: 'indexnow-test-event' }),
    });
    assert.strictEqual(eventRes.status, 200);
  } finally {
    proc.kill();
  }
});
