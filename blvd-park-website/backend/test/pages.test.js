// Pages CMS contract tests — spawns the real server on a random high port with a temp DB.
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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blvd-pages-'));
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

test('draft 404s publicly, publish flips live, html sanitized, json_ld preserved', async () => {
  const create = await fetch(`${BASE}/api/pages`, {
    method: 'POST', headers: auth, body: JSON.stringify({
      title: 'Pickleball Nights', slug: 'pickleball-nights',
      content_sections: [{ type: 'html', body: '<p>Hi</p><script>alert(1)</script>' }, { type: 'text', body: 'Plain' }],
      json_ld: '{"@context":"https://schema.org","@type":"Event","name":"Pickleball"}',
      seo_title: 'Pickleball Nights | BLVD Park'
    })
  });
  assert.strictEqual(create.status, 201);
  const page = await create.json();
  assert.strictEqual(page.status, 'draft');
  assert.strictEqual(page.robots, 'noindex, nofollow');
  assert.ok(!page.content_sections.includes('<script'), 'script tag must be stripped on save');
  assert.ok(page.content_sections.includes('<p>Hi</p>'), 'safe html preserved');

  const draft = await fetch(`${BASE}/api/pages/public/pickleball-nights`);
  assert.strictEqual(draft.status, 404);

  const listDraft = await fetch(`${BASE}/api/pages/public-list`);
  assert.deepStrictEqual(await listDraft.json(), []);

  const pub = await fetch(`${BASE}/api/pages/${page.id}`, {
    method: 'PUT', headers: auth,
    body: JSON.stringify({ ...page, status: 'published', content_sections: JSON.parse(page.content_sections) })
  });
  assert.strictEqual(pub.status, 200);

  const live = await fetch(`${BASE}/api/pages/public/pickleball-nights`);
  assert.strictEqual(live.status, 200);
  const liveJson = await live.json();
  assert.strictEqual(JSON.parse(liveJson.json_ld)['@type'], 'Event');
  assert.ok(!liveJson.content_sections.includes('<script'));

  const list = await fetch(`${BASE}/api/pages/public-list`);
  const rows = await list.json();
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].slug, 'pickleball-nights');
});

test('reserved/malformed slugs rejected, bad json_ld rejected, auth required, dup slug 409', async () => {
  const reserved = await fetch(`${BASE}/api/pages`, { method: 'POST', headers: auth, body: JSON.stringify({ title: 'X', slug: 'admin' }) });
  assert.strictEqual(reserved.status, 400);

  const bad = await fetch(`${BASE}/api/pages`, { method: 'POST', headers: auth, body: JSON.stringify({ title: 'X', slug: 'Bad_Slug' }) });
  assert.strictEqual(bad.status, 400);

  const badLd = await fetch(`${BASE}/api/pages`, { method: 'POST', headers: auth, body: JSON.stringify({ title: 'X', slug: 'ok-slug', json_ld: '{nope' }) });
  assert.strictEqual(badLd.status, 400);

  const noAuth = await fetch(`${BASE}/api/pages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'X', slug: 'ok2' }) });
  assert.strictEqual(noAuth.status, 401);

  const dup = await fetch(`${BASE}/api/pages`, { method: 'POST', headers: auth, body: JSON.stringify({ title: 'Dup', slug: 'pickleball-nights' }) });
  assert.strictEqual(dup.status, 409);

  const badRobots = await fetch(`${BASE}/api/pages`, { method: 'POST', headers: auth, body: JSON.stringify({ title: 'X', slug: 'robots-check', robots: 'index' }) });
  assert.strictEqual(badRobots.status, 400);
});
