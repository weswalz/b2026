// Pages editor upgrades (B6) — FAQ builder validation + roundtrip contract tests.
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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blvd-pages-faq-'));
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

test('faq_items roundtrips through create and update, HTML in answers sanitized', async () => {
  const create = await fetch(`${BASE}/api/pages`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({
      title: 'FAQ Test Page', slug: 'faq-test-page',
      faq_items: [
        { question: 'What are your hours?', answer: '<p>We are open <strong>daily</strong>.</p><script>alert(1)</script>' },
        { question: 'Do you take reservations?', answer: '<p>Yes, call us.</p>' },
      ],
    })
  });
  assert.strictEqual(create.status, 201);
  const page = await create.json();
  const items = JSON.parse(page.faq_items);
  assert.strictEqual(items.length, 2);
  assert.strictEqual(items[0].question, 'What are your hours?');
  assert.ok(items[0].answer.includes('<strong>daily</strong>'));
  assert.ok(!items[0].answer.includes('<script'), 'script tag must be stripped from FAQ answers');

  const update = await fetch(`${BASE}/api/pages/${page.id}`, {
    method: 'PUT', headers: auth,
    body: JSON.stringify({ ...page, faq_items: [{ question: 'Updated Q', answer: '<p>Updated A</p>' }] })
  });
  assert.strictEqual(update.status, 200);
  const updated = await update.json();
  const updatedItems = JSON.parse(updated.faq_items);
  assert.strictEqual(updatedItems.length, 1);
  assert.strictEqual(updatedItems[0].question, 'Updated Q');
});

test('faq_items rejects more than 50 items', async () => {
  const tooMany = Array.from({ length: 51 }, (_, i) => ({ question: `Q${i}`, answer: `A${i}` }));
  const res = await fetch(`${BASE}/api/pages`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({ title: 'Too Many FAQs', slug: 'too-many-faqs', faq_items: tooMany })
  });
  assert.strictEqual(res.status, 400);
});

test('faq_items rejects an item with an empty question', async () => {
  const res = await fetch(`${BASE}/api/pages`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({ title: 'Empty Q FAQ', slug: 'empty-q-faq', faq_items: [{ question: '', answer: 'Some answer' }] })
  });
  assert.strictEqual(res.status, 400);
});

test('pages created without faq_items default to an empty array', async () => {
  const res = await fetch(`${BASE}/api/pages`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({ title: 'No FAQ Page', slug: 'no-faq-page' })
  });
  assert.strictEqual(res.status, 201);
  const page = await res.json();
  assert.deepStrictEqual(JSON.parse(page.faq_items), []);
});

test('published page with FAQ items is reachable publicly with faq_items intact', async () => {
  const create = await fetch(`${BASE}/api/pages`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({
      title: 'Public FAQ Page', slug: 'public-faq-page', status: 'published',
      faq_items: [{ question: 'Is this public?', answer: '<p>Yes.</p>' }],
    })
  });
  const page = await create.json();
  const pub = await fetch(`${BASE}/api/pages/public/${page.slug}`);
  assert.strictEqual(pub.status, 200);
  const pubBody = await pub.json();
  const items = JSON.parse(pubBody.faq_items);
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].question, 'Is this public?');
});
