// Events-at-Heights-level contract tests — spawns the real server on a random high port with a temp DB.
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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blvd-events-'));
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
const future = () => {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
};
const past = () => {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
};

test('slug auto-generated on create, uniqueness enforced with 409 on explicit dup', async () => {
  const create = await fetch(`${BASE}/api/events`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({ title: 'Steak Night Special', date: future(), time: '18:00', category: 'steak-night' })
  });
  assert.strictEqual(create.status, 200);
  const event = await create.json();
  assert.strictEqual(event.slug, 'steak-night-special');

  const dup = await fetch(`${BASE}/api/events`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({ title: 'Some Other Title', date: future(), time: '19:00', slug: 'steak-night-special' })
  });
  assert.strictEqual(dup.status, 409);
  const dupBody = await dup.json();
  assert.strictEqual(dupBody.code, 'SLUG_TAKEN');
});

test('invalid explicit slug rejected with SLUG_INVALID', async () => {
  const res = await fetch(`${BASE}/api/events`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({ title: 'Bad Slug Event', date: future(), time: '20:00', slug: 'Not A Valid Slug!' })
  });
  assert.strictEqual(res.status, 400);
  const body = await res.json();
  assert.strictEqual(body.code, 'SLUG_INVALID');
});

test('soft delete: row preserved, excluded from public list, restore brings it back', async () => {
  const create = await fetch(`${BASE}/api/events`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({ title: 'Watch Party Soft Delete', date: future(), time: '17:00', category: 'watch-party' })
  });
  const event = await create.json();

  const del = await fetch(`${BASE}/api/events/${event.id}`, { method: 'DELETE', headers: auth });
  assert.strictEqual(del.status, 200);

  const publicList = await fetch(`${BASE}/api/events?all=true`);
  const publicRows = await publicList.json();
  assert.ok(!publicRows.some((e) => e.id === event.id), 'deleted event must not appear in default admin list');

  const withDeleted = await fetch(`${BASE}/api/events?all=true&deleted=true`);
  const deletedRows = await withDeleted.json();
  const found = deletedRows.find((e) => e.id === event.id);
  assert.ok(found, 'deleted event must appear when ?deleted=true');
  assert.ok(found.deleted_at, 'deleted_at must be set');

  const restore = await fetch(`${BASE}/api/events/${event.id}/restore`, { method: 'POST', headers: auth });
  assert.strictEqual(restore.status, 200);
  const restored = await restore.json();
  assert.strictEqual(restored.deleted_at, null);

  const backInList = await fetch(`${BASE}/api/events?all=true`);
  const rows2 = await backInList.json();
  assert.ok(rows2.some((e) => e.id === event.id), 'restored event must reappear in default list');
});

test('auto-status: past non-recurring active event flips to completed on public read', async () => {
  const create = await fetch(`${BASE}/api/events`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({ title: 'Old Live Music Night', date: past(), time: '21:00', category: 'live-music' })
  });
  const event = await create.json();
  assert.strictEqual(event.status, 'active');

  // Hit a public read path to trigger the write-time sync
  await fetch(`${BASE}/api/events`);

  const check = await fetch(`${BASE}/api/events/${event.id}`);
  const updated = await check.json();
  assert.strictEqual(updated.status, 'completed');
});

test('per-event SEO fields roundtrip on create and update', async () => {
  const create = await fetch(`${BASE}/api/events`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({
      title: 'SEO Roundtrip Event', date: future(), time: '19:30', category: 'special',
      seoTitle: 'Custom SEO Title', seoDescription: 'Custom SEO Description',
      seoKeywords: 'kw1, kw2', ogTitle: 'OG Title', ogDescription: 'OG Description', ogImage: '/uploads/og.jpg'
    })
  });
  const event = await create.json();
  assert.strictEqual(event.seoTitle, 'Custom SEO Title');
  assert.strictEqual(event.ogImage, '/uploads/og.jpg');

  const update = await fetch(`${BASE}/api/events/${event.id}`, {
    method: 'PUT', headers: auth,
    body: JSON.stringify({ seoTitle: 'Updated SEO Title' })
  });
  assert.strictEqual(update.status, 200);
  const updated = await update.json();
  assert.strictEqual(updated.seoTitle, 'Updated SEO Title');
  assert.strictEqual(updated.seoDescription, 'Custom SEO Description', 'other SEO fields preserved via COALESCE');
});

test('public /api/events/public/:slug returns active event, 404s for missing/deleted', async () => {
  const create = await fetch(`${BASE}/api/events`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({ title: 'Public Slug Lookup Event', date: future(), time: '20:00', category: 'special' })
  });
  const event = await create.json();

  const found = await fetch(`${BASE}/api/events/public/${event.slug}`);
  assert.strictEqual(found.status, 200);
  const foundBody = await found.json();
  assert.strictEqual(foundBody.id, event.id);

  const missing = await fetch(`${BASE}/api/events/public/does-not-exist-slug`);
  assert.strictEqual(missing.status, 404);

  await fetch(`${BASE}/api/events/${event.id}`, { method: 'DELETE', headers: auth });
  const afterDelete = await fetch(`${BASE}/api/events/public/${event.slug}`);
  assert.strictEqual(afterDelete.status, 404);
});
