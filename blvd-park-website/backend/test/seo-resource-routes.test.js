const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const PORT = 40000 + Math.floor(Math.random() * 20000);
const BASE = `http://127.0.0.1:${PORT}`;
const KEY = 'test-admin-key';
const auth = { 'x-auth-key': KEY, 'Content-Type': 'application/json' };
let proc;

before(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blvd-seo-resource-routes-'));
  proc = spawn('node', [path.join(__dirname, '..', 'server.js')], {
    env: {
      ...process.env,
      PORT: String(PORT),
      DB_PATH: path.join(tmp, 'test.db'),
      ADMIN_API_KEY: KEY,
      UPLOADS_DIR: path.join(tmp, 'uploads'),
    },
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try {
      const response = await fetch(`${BASE}/api/health`);
      if (response.ok) return;
    } catch (_error) {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('server did not start');
});

after(() => {
  proc.kill();
});

test('SEO resource routes require authentication', async () => {
  const resources = await fetch(`${BASE}/api/seo/resources`);
  const settings = await fetch(`${BASE}/api/seo/site-settings`);
  const bulk = await fetch(`${BASE}/api/seo/bulk`);
  assert.strictEqual(resources.status, 401);
  assert.strictEqual(settings.status, 401);
  assert.strictEqual(bulk.status, 401);
});

test('capability endpoint describes the durable IndexNow queue and credential state truthfully', async () => {
  const response = await fetch(`${BASE}/api/seo/capabilities`, { headers: auth });
  assert.strictEqual(response.status, 200);
  const indexNow = (await response.json()).capabilities.find((capability) => capability.key === 'indexNow');
  assert.strictEqual(indexNow.status, 'partial');
  assert.match(indexNow.label, /durable IndexNow queue/i);
  assert.match(indexNow.note, /credential.*required/i);
  assert.strictEqual(indexNow.available, true);
  assert.strictEqual(indexNow.configured, false);
});

test('SEO resource create, update, revision list, and rollback round-trip', async () => {
  const create = await fetch(`${BASE}/api/seo/resources`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      resourceType: 'route',
      resourceId: 'seo-route-test',
      path: '/seo-route-test',
    }),
  });
  assert.strictEqual(create.status, 201);

  const list = await fetch(`${BASE}/api/seo/resources`, { headers: auth });
  assert.strictEqual(list.status, 200);
  const resources = await list.json();
  assert.ok(resources.some((resource) => resource.resourceId === 'seo-route-test'));

  const initialUpdate = await fetch(`${BASE}/api/seo/resources/route/seo-route-test`, {
    method: 'PUT',
    headers: auth,
    body: JSON.stringify({ seoTitle: 'Original title', changeSummary: 'Initial title' }),
  });
  assert.strictEqual(initialUpdate.status, 200);

  const update = await fetch(`${BASE}/api/seo/resources/route/seo-route-test`, {
    method: 'PUT',
    headers: auth,
    body: JSON.stringify({ seoTitle: 'Updated title', changeSummary: 'Test update' }),
  });
  assert.strictEqual(update.status, 200);
  assert.strictEqual((await update.json()).seoTitle, 'Updated title');

  const revisionsResponse = await fetch(`${BASE}/api/seo/resources/route/seo-route-test/revisions`, { headers: auth });
  assert.strictEqual(revisionsResponse.status, 200);
  const revisions = await revisionsResponse.json();
  assert.strictEqual(revisions.length, 2);
  assert.strictEqual(revisions[0].changeSummary, 'Test update');

  const rollback = await fetch(`${BASE}/api/seo/revisions/${revisions[0].id}/rollback`, {
    method: 'POST',
    headers: auth,
  });
  assert.strictEqual(rollback.status, 200);
  assert.strictEqual((await rollback.json()).seoTitle, 'Original title');
});

test('SEO site settings read and validated update round-trip', async () => {
  const get = await fetch(`${BASE}/api/seo/site-settings`, { headers: auth });
  assert.strictEqual(get.status, 200);
  assert.strictEqual((await get.json()).id, 'default');

  const invalid = await fetch(`${BASE}/api/seo/site-settings`, {
    method: 'PUT',
    headers: auth,
    body: JSON.stringify({ canonicalOrigin: 'http://example.com' }),
  });
  assert.strictEqual(invalid.status, 400);

  const update = await fetch(`${BASE}/api/seo/site-settings`, {
    method: 'PUT',
    headers: auth,
    body: JSON.stringify({ canonicalOrigin: 'https://www.blvdpark.com/path', lowercasePaths: true }),
  });
  assert.strictEqual(update.status, 200);
  const settings = await update.json();
  assert.strictEqual(settings.canonicalOrigin, 'https://www.blvdpark.com');
  assert.strictEqual(settings.lowercasePaths, 1);
});

test('SEO bulk preview, apply, and rollback round-trip', async () => {
  const create = await fetch(`${BASE}/api/seo/resources`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      resourceType: 'route',
      resourceId: 'seo-bulk-test',
      path: '/seo-bulk-test',
    }),
  });
  assert.strictEqual(create.status, 201);

  const seed = await fetch(`${BASE}/api/seo/resources/route/seo-bulk-test`, {
    method: 'PUT',
    headers: auth,
    body: JSON.stringify({ seoDescription: 'Before bulk', changeSummary: 'Initial description' }),
  });
  assert.strictEqual(seed.status, 200);

  const previewResponse = await fetch(`${BASE}/api/seo/bulk/preview`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      changes: [{
        resourceType: 'route',
        resourceId: 'seo-bulk-test',
        patch: { seoDescription: 'After bulk' },
      }],
    }),
  });
  assert.strictEqual(previewResponse.status, 201);
  const preview = await previewResponse.json();
  assert.strictEqual(preview.status, 'preview');
  assert.strictEqual(preview.preview[0].valid, true);

  const apply = await fetch(`${BASE}/api/seo/bulk/${preview.id}/apply`, { method: 'POST', headers: auth });
  assert.strictEqual(apply.status, 200);
  assert.strictEqual((await apply.json()).status, 'applied');

  const changed = await fetch(`${BASE}/api/seo/resources/route/seo-bulk-test`, { headers: auth });
  assert.strictEqual((await changed.json()).seoDescription, 'After bulk');

  const rollback = await fetch(`${BASE}/api/seo/bulk/${preview.id}/rollback`, { method: 'POST', headers: auth });
  assert.strictEqual(rollback.status, 200);
  assert.strictEqual((await rollback.json()).status, 'rolled_back');

  const restored = await fetch(`${BASE}/api/seo/resources/route/seo-bulk-test`, { headers: auth });
  assert.strictEqual((await restored.json()).seoDescription, 'Before bulk');
});

test('public page and event APIs expose saved resource OG metadata and schemaJson', async () => {
  const pageCreate = await fetch(`${BASE}/api/pages`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ title: 'Public SEO Page', slug: 'public-seo-page', status: 'published', robots: 'index, follow' }),
  });
  assert.strictEqual(pageCreate.status, 201);
  const page = await pageCreate.json();

  const eventCreate = await fetch(`${BASE}/api/events`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ title: 'Public SEO Event', slug: 'public-seo-event', date: '2030-01-02', time: '19:00', category: 'special' }),
  });
  assert.strictEqual(eventCreate.status, 200);
  const event = await eventCreate.json();

  const resources = await fetch(`${BASE}/api/seo/resources`, { headers: auth }).then((response) => response.json());
  assert.ok(resources.some((resource) => resource.resourceType === 'page' && resource.resourceId === String(page.id)));
  assert.ok(resources.some((resource) => resource.resourceType === 'event' && resource.resourceId === String(event.id)));

  const configured = {
    ogTitle: 'Resource OG title',
    ogDescription: 'Resource OG description',
    ogImage: '/uploads/resource-og.jpg',
    schemaJson: { '@context': 'https://schema.org', '@type': 'WebPage', identifier: 'resource-schema-public' },
    changeSummary: 'Configure public output regression',
  };
  const pageSave = await fetch(`${BASE}/api/seo/resources/page/${page.id}`, {
    method: 'PUT',
    headers: auth,
    body: JSON.stringify(configured),
  });
  assert.strictEqual(pageSave.status, 200);

  const eventSave = await fetch(`${BASE}/api/seo/resources/event/${event.id}`, {
    method: 'PUT',
    headers: auth,
    body: JSON.stringify({ ...configured, schemaJson: { ...configured.schemaJson, '@type': 'Event' } }),
  });
  assert.strictEqual(eventSave.status, 200);

  for (const pathName of [`pages/public/${page.slug}`, `events/public/${event.slug}`]) {
    const response = await fetch(`${BASE}/api/${pathName}`);
    assert.strictEqual(response.status, 200);
    const body = await response.json();
    assert.strictEqual(body._seo.resource.ogTitle, configured.ogTitle);
    assert.strictEqual(body._seo.resource.ogDescription, configured.ogDescription);
    assert.strictEqual(body._seo.resource.ogImage, configured.ogImage);
    assert.strictEqual(body._seo.resource.schemaJson.identifier, 'resource-schema-public');
  }
});
