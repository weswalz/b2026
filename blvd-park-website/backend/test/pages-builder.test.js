// Page-builder contract tests — hero_json + module sections (content-section/component).
// Same harness as pages.test.js: spawns the real server on a random high port with a temp DB.
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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blvd-pages-builder-'));
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

test('hero_json roundtrips and is served publicly on a published page', async () => {
  const hero = {
    title: 'Pickleball League',
    subtitle: 'Competitive play every Thursday',
    eyebrow: 'BLVD PARK',
    image: '/uploads/hero.jpg',
    video: '',
    showLogo: true,
    ctas: [
      { label: 'Join', href: '/contact', style: 'primary' },
      { label: 'Rules', href: 'https://example.com/rules', style: 'secondary' },
    ],
  };
  const create = await fetch(`${BASE}/api/pages`, {
    method: 'POST', headers: auth, body: JSON.stringify({
      title: 'League Night', slug: 'league-night', status: 'published',
      hero_json: hero,
    })
  });
  assert.strictEqual(create.status, 201);
  const page = await create.json();
  assert.deepStrictEqual(JSON.parse(page.hero_json), hero);

  const pub = await fetch(`${BASE}/api/pages/public/league-night`);
  assert.strictEqual(pub.status, 200);
  const pubBody = await pub.json();
  assert.strictEqual(JSON.parse(pubBody.hero_json).title, 'Pickleball League');
  assert.strictEqual(JSON.parse(pubBody.hero_json).ctas.length, 2);
});

test('hero_json rejects unsafe hrefs and oversized ctas arrays', async () => {
  const bad = await fetch(`${BASE}/api/pages`, {
    method: 'POST', headers: auth, body: JSON.stringify({
      title: 'Bad Hero', slug: 'bad-hero',
      hero_json: { title: 'X', ctas: [{ label: 'Go', href: 'javascript:alert(1)' }] },
    })
  });
  assert.strictEqual(bad.status, 400);
  const body = await bad.json();
  assert.ok(body.details.some((d) => /href/.test(d)));

  const tooMany = await fetch(`${BASE}/api/pages`, {
    method: 'POST', headers: auth, body: JSON.stringify({
      title: 'Bad Hero 2', slug: 'bad-hero-2',
      hero_json: { ctas: [{ label: 'A', href: '/a' }, { label: 'B', href: '/b' }, { label: 'C', href: '/c' }] },
    })
  });
  assert.strictEqual(tooMany.status, 400);
});

test('content-section module roundtrips; html inside is sanitized', async () => {
  const section = {
    type: 'content-section',
    title: 'The Space',
    subtitle: '50+ screens',
    contentHtml: '<p>Great <strong>vibes</strong></p><script>alert(1)</script>',
    imageSrc: '/uploads/space.jpg',
    imageAlt: 'The main room',
    imagePosition: 'right',
    headingLevel: 'h2',
  };
  const create = await fetch(`${BASE}/api/pages`, {
    method: 'POST', headers: auth, body: JSON.stringify({
      title: 'The Space Page', slug: 'the-space', status: 'published',
      content_sections: [section],
    })
  });
  assert.strictEqual(create.status, 201);
  const page = await create.json();
  const sections = JSON.parse(page.content_sections);
  assert.strictEqual(sections[0].type, 'content-section');
  assert.strictEqual(sections[0].imagePosition, 'right');
  assert.ok(!page.content_sections.includes('<script'), 'script tag must be stripped inside content-section html');
  assert.ok(sections[0].contentHtml.includes('<strong>vibes</strong>'));

  const pub = await fetch(`${BASE}/api/pages/public/the-space`);
  const pubBody = await pub.json();
  assert.deepStrictEqual(JSON.parse(pubBody.content_sections)[0].title, 'The Space');
});

test('component sections validate against the allowlist and typed props', async () => {
  const good = await fetch(`${BASE}/api/pages`, {
    method: 'POST', headers: auth, body: JSON.stringify({
      title: 'Gallery Page', slug: 'gallery-page', status: 'published',
      content_sections: [
        { type: 'component', name: 'GalleryGrid', props: { title: 'Venue', category: 'venue', limit: 12, ctaHref: '/gallery' } },
      ],
    })
  });
  assert.strictEqual(good.status, 201);
  const page = await good.json();
  const sections = JSON.parse(page.content_sections);
  assert.strictEqual(sections[0].name, 'GalleryGrid');
  assert.strictEqual(sections[0].props.limit, 12);

  const unknown = await fetch(`${BASE}/api/pages`, {
    method: 'POST', headers: auth, body: JSON.stringify({
      title: 'Bad Component', slug: 'bad-component',
      content_sections: [{ type: 'component', name: 'NotReal', props: {} }],
    })
  });
  assert.strictEqual(unknown.status, 400);

  const badSelect = await fetch(`${BASE}/api/pages`, {
    method: 'POST', headers: auth, body: JSON.stringify({
      title: 'Bad Select', slug: 'bad-select',
      content_sections: [{ type: 'component', name: 'GalleryGrid', props: { category: 'not-a-category' } }],
    })
  });
  assert.strictEqual(badSelect.status, 400);

  const badNumber = await fetch(`${BASE}/api/pages`, {
    method: 'POST', headers: auth, body: JSON.stringify({
      title: 'Bad Number', slug: 'bad-number',
      content_sections: [{ type: 'component', name: 'GalleryGrid', props: { limit: 'lots' } }],
    })
  });
  assert.strictEqual(badNumber.status, 400);

  const badHref = await fetch(`${BASE}/api/pages`, {
    method: 'POST', headers: auth, body: JSON.stringify({
      title: 'Bad Href', slug: 'bad-href-prop',
      content_sections: [{ type: 'component', name: 'CallToAction', props: { primaryHref: 'javascript:alert(1)' } }],
    })
  });
  assert.strictEqual(badHref.status, 400);
});

test('legacy text/html-only payloads still save unchanged (backward compat)', async () => {
  const create = await fetch(`${BASE}/api/pages`, {
    method: 'POST', headers: auth, body: JSON.stringify({
      title: 'Legacy Page', slug: 'legacy-page', status: 'draft',
      content_sections: [{ type: 'text', body: 'Just text' }],
    })
  });
  assert.strictEqual(create.status, 201);
  const page = await create.json();
  assert.deepStrictEqual(JSON.parse(page.content_sections), [{ type: 'text', body: 'Just text' }]);
  assert.deepStrictEqual(JSON.parse(page.hero_json), { title: '', subtitle: '', eyebrow: '', image: '', video: '', showLogo: false, ctas: [] });
});

test('update replaces hero_json and preserves untouched fields', async () => {
  const create = await fetch(`${BASE}/api/pages`, {
    method: 'POST', headers: auth, body: JSON.stringify({
      title: 'Update Me', slug: 'update-me', status: 'draft',
      hero_json: { title: 'Before' },
    })
  });
  const page = await create.json();
  const update = await fetch(`${BASE}/api/pages/${page.id}`, {
    method: 'PUT', headers: auth, body: JSON.stringify({
      ...page,
      hero_json: { title: 'After', subtitle: 'Updated', ctas: [{ label: 'Go', href: '/book', style: 'primary' }] },
    })
  });
  assert.strictEqual(update.status, 200);
  const updated = await update.json();
  const hero = JSON.parse(updated.hero_json);
  assert.strictEqual(hero.title, 'After');
  assert.strictEqual(hero.subtitle, 'Updated');
  assert.strictEqual(hero.ctas[0].href, '/book');
});
