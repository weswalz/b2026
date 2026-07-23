// SEO-ops platform (Wave-2) contract tests — spawns the real server on a
// random high port with a temp DB. Covers: redirect CSV import/apply/rollback
// round-trip, internal-link migration round-trip, editorial signoff
// append-only behavior + checklist toggle, entity reference create/attach/
// delete, master entity slug uniqueness + stable @id build, taxonomy
// duplicate-term detection, robots.txt validator + tester, sitemap XML
// well-formedness checker. Matches this backend's existing test convention
// (backend/test/redirects.test.js, backend/test/pages.test.js — both read in
// full before writing this): spawn the real server process, temp DB, random
// high port, x-auth-key header auth.
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
let dbPath;

before(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blvd-seo-backend-'));
  dbPath = path.join(tmp, 'test.db');
  proc = spawn('node', [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(PORT), DB_PATH: dbPath, ADMIN_API_KEY: KEY, UPLOADS_DIR: path.join(tmp, 'uploads') },
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

// Note on resolving seo_resources.id in tests below: no GET /api/seo/resources
// listing route is in this port's ownership (that belongs to the coordinator's
// already-built backend/lib/seo-resources.js and whichever agent wires its
// routes) — this port's own entity-reference/taxonomy-assignment endpoints are
// keyed by the raw INTEGER seo_resources.id. Editorial endpoints (checklist,
// signoffs) are keyed by (resourceType, resourceId) instead and don't need
// this. To get the integer id for entity/taxonomy tests, this suite opens a
// second, read-only connection to the exact same DB file the live server has
// open (module-scope `dbPath`, captured in the top-level before() hook) — the
// same direct-DB-alongside-the-live-server technique this codebase's own
// backend/test/users.test.js already uses in its createSessionUser() helper.

// ---------------------------------------------------------------------------
// robots.txt: default text, validator, tester
// ---------------------------------------------------------------------------

test('GET /api/seo/robots serves the real live-seeded robots.txt (public, no auth)', async () => {
  // seo_site_settings.robotsText is seeded with the EXACT content of the
  // pre-existing public/robots.txt (deleted in the same Wave-2 commit that
  // added this seed — see backend/lib/seo-schema.js's INSERT OR IGNORE INTO
  // seo_site_settings) so an admin's first edit starts from what was
  // actually live on blvdpark.com, not backend/lib/robots.js's fuller
  // DEFAULT_ROBOTS_TEXT fallback (which only applies to a row where this
  // column is genuinely NULL).
  const res = await fetch(`${BASE}/api/seo/robots`);
  assert.strictEqual(res.status, 200);
  const text = await res.text();
  assert.ok(text.includes('Sitemap: https://blvdpark.com/sitemap.xml'), 'must advertise the real single sitemap.xml URL');
  assert.ok(text.includes('Disallow: /admin/'));
  assert.ok(text.includes('User-agent: *'));
  assert.ok(text.includes('Allow: /'));
});

test('robots.txt validator accepts the real default text and rejects malformed text', async () => {
  const okRes = await fetch(`${BASE}/api/seo/robots/default`, { headers: auth });
  const { robotsText } = await okRes.json();
  const valid = await fetch(`${BASE}/api/seo/robots/validate`, { method: 'POST', headers: auth, body: JSON.stringify({ robotsText }) });
  const validBody = await valid.json();
  assert.strictEqual(validBody.valid, true, JSON.stringify(validBody.errors));

  const bad = await fetch(`${BASE}/api/seo/robots/validate`, { method: 'POST', headers: auth, body: JSON.stringify({ robotsText: 'This is not a robots file at all, just prose.' }) });
  const badBody = await bad.json();
  assert.strictEqual(badBody.valid, false);
  assert.ok(badBody.errors.length > 0);
});

test('robots.txt tester: Googlebot disallowed under /admin/, allowed under /', async () => {
  const okRes = await fetch(`${BASE}/api/seo/robots/default`, { headers: auth });
  const { robotsText } = await okRes.json();

  const disallowed = await fetch(`${BASE}/api/seo/robots/test`, { method: 'POST', headers: auth, body: JSON.stringify({ robotsText, userAgent: 'Googlebot', path: '/admin/dashboard' }) });
  const disallowedBody = await disallowed.json();
  assert.strictEqual(disallowedBody.allowed, false);

  const allowed = await fetch(`${BASE}/api/seo/robots/test`, { method: 'POST', headers: auth, body: JSON.stringify({ robotsText, userAgent: 'Googlebot', path: '/menu' }) });
  const allowedBody = await allowed.json();
  assert.strictEqual(allowedBody.allowed, true);
});

test('PUT /api/seo/robots persists custom text, which GET then serves publicly', async () => {
  const customText = 'User-agent: *\nDisallow: /private\nSitemap: https://blvdpark.com/sitemap.xml\n';
  const put = await fetch(`${BASE}/api/seo/robots`, { method: 'PUT', headers: auth, body: JSON.stringify({ robotsText: customText }) });
  assert.strictEqual(put.status, 200);

  const publicGet = await fetch(`${BASE}/api/seo/robots`);
  const text = await publicGet.text();
  assert.strictEqual(text, customText);

  // Restore default for subsequent tests' expectations elsewhere in the suite.
  const defaultRes = await fetch(`${BASE}/api/seo/robots/default`, { headers: auth });
  const { robotsText } = await defaultRes.json();
  await fetch(`${BASE}/api/seo/robots`, { method: 'PUT', headers: auth, body: JSON.stringify({ robotsText }) });
});

test('PUT /api/seo/robots rejects invalid robots.txt with 400', async () => {
  const res = await fetch(`${BASE}/api/seo/robots`, { method: 'PUT', headers: auth, body: JSON.stringify({ robotsText: 'nonsense text with no directives' }) });
  assert.strictEqual(res.status, 400);
});

test('robots endpoints require auth except public GET', async () => {
  const noAuth = await fetch(`${BASE}/api/seo/robots/default`);
  assert.strictEqual(noAuth.status, 401);
  const publicOk = await fetch(`${BASE}/api/seo/robots`);
  assert.strictEqual(publicOk.status, 200);
});

// ---------------------------------------------------------------------------
// Sitemap XML well-formedness checker (pure logic, exercised via the module directly)
// ---------------------------------------------------------------------------

test('sitemap validator: balanced valid urlset XML is well-formed with correct url count', () => {
  const { validateSitemapXml } = require('../lib/sitemap-validation');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>https://blvdpark.com/</loc></url>\n  <url><loc>https://blvdpark.com/menu</loc></url>\n</urlset>\n`;
  const result = validateSitemapXml(xml, 'urlset');
  assert.strictEqual(result.wellFormed, true, JSON.stringify(result.errors));
  assert.strictEqual(result.urlCount, 2);
  assert.deepStrictEqual(result.invalidUrls, []);
});

test('sitemap validator: unclosed tag (truncated response) is flagged not well-formed', () => {
  const { validateSitemapXml } = require('../lib/sitemap-validation');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset>\n  <url><loc>https://blvdpark.com/</loc></url>\n  <url><loc>https://blvdpark.com/truncated`;
  const result = validateSitemapXml(xml, 'urlset');
  assert.strictEqual(result.wellFormed, false);
  assert.ok(result.errors.some((e) => /Unclosed tag/.test(e)));
});

test('sitemap validator: mismatched closing tag is flagged not well-formed', () => {
  const { validateSitemapXml } = require('../lib/sitemap-validation');
  const xml = `<?xml version="1.0"?>\n<urlset>\n  <url><loc>https://blvdpark.com/</loc></urlx>\n</urlset>\n`;
  const result = validateSitemapXml(xml, 'urlset');
  assert.strictEqual(result.wellFormed, false);
});

test('sitemap validator: invalid <loc> URL is reported', () => {
  const { validateSitemapXml } = require('../lib/sitemap-validation');
  const xml = `<?xml version="1.0"?>\n<urlset>\n  <url><loc>not-a-valid-url</loc></url>\n</urlset>\n`;
  const result = validateSitemapXml(xml, 'urlset');
  assert.strictEqual(result.wellFormed, false);
  assert.strictEqual(result.invalidUrls.length, 1);
});

test('sitemap validator: missing XML declaration and empty urlset are both flagged', () => {
  const { validateSitemapXml } = require('../lib/sitemap-validation');
  const missingDecl = validateSitemapXml('<urlset><url><loc>https://blvdpark.com/</loc></url></urlset>', 'urlset');
  assert.strictEqual(missingDecl.wellFormed, false);
  assert.ok(missingDecl.errors.some((e) => /XML declaration/.test(e)));

  const empty = validateSitemapXml('', 'urlset');
  assert.strictEqual(empty.wellFormed, false);
  assert.ok(empty.errors.some((e) => /empty/i.test(e)));
});

test('SITEMAP_FILES lists exactly BLVD\'s one real sitemap document', () => {
  const { SITEMAP_FILES } = require('../lib/sitemap-validation');
  assert.strictEqual(SITEMAP_FILES.length, 1);
  assert.strictEqual(SITEMAP_FILES[0].path, '/sitemap.xml');
  assert.strictEqual(SITEMAP_FILES[0].kind, 'urlset');
});

test('POST /api/seo/sitemap/validate runs a real check and records history visible via GET', async () => {
  const run = await fetch(`${BASE}/api/seo/sitemap/validate`, { method: 'POST', headers: auth });
  assert.strictEqual(run.status, 201);
  const result = await run.json();
  assert.strictEqual(typeof result.overallValid, 'boolean');
  assert.strictEqual(result.fileCount, 1);
  assert.strictEqual(result.files.length, 1);
  assert.strictEqual(result.files[0].key, 'sitemap.xml');

  const history = await fetch(`${BASE}/api/seo/sitemap/validations`, { headers: auth });
  assert.strictEqual(history.status, 200);
  const runs = await history.json();
  assert.ok(runs.length >= 1);
  assert.ok(runs[0].files.length === 1);
});

// ---------------------------------------------------------------------------
// Redirects: CSV import preview -> apply -> rollback round-trip
// ---------------------------------------------------------------------------

test('redirect CSV import: preview validates rows, apply creates redirects, rollback deactivates them', async () => {
  const csv = 'fromPath,toPath,statusCode,matchType,notes\n/csv-old-a,/csv-new-a,301,exact,imported row A\n/csv-old-b,/csv-new-b,302,exact,imported row B\n';
  const preview = await fetch(`${BASE}/api/redirects/import/preview`, { method: 'POST', headers: auth, body: JSON.stringify({ csv }) });
  assert.strictEqual(preview.status, 201);
  const job = await preview.json();
  assert.strictEqual(job.status, 'preview');
  assert.strictEqual(job.preview.length, 2);
  assert.ok(job.preview.every((r) => r.valid), JSON.stringify(job.preview));

  const apply = await fetch(`${BASE}/api/redirects/import/${job.id}/apply`, { method: 'POST', headers: auth });
  assert.strictEqual(apply.status, 200);
  const applied = await apply.json();
  assert.strictEqual(applied.status, 'applied');
  assert.strictEqual(applied.createdCount, 2);

  const resolveA = await fetch(`${BASE}/api/redirects/resolve?path=${encodeURIComponent('/csv-old-a')}`);
  assert.strictEqual(resolveA.status, 200);
  const resolvedA = await resolveA.json();
  assert.strictEqual(resolvedA.toPath, '/csv-new-a');

  const rollback = await fetch(`${BASE}/api/redirects/import/${job.id}/rollback`, { method: 'POST', headers: auth });
  assert.strictEqual(rollback.status, 200);
  const rolledBack = await rollback.json();
  assert.strictEqual(rolledBack.status, 'rolled_back');

  const resolveAfterRollback = await fetch(`${BASE}/api/redirects/resolve?path=${encodeURIComponent('/csv-old-a')}`);
  assert.strictEqual(resolveAfterRollback.status, 404, 'deactivated redirect must no longer resolve');
});

test('redirect CSV import: invalid row (reserved prefix) is rejected in preview, apply refuses to run', async () => {
  const csv = 'fromPath,toPath,statusCode,matchType,notes\n/admin/whatever,/somewhere,301,exact,bad row\n';
  const preview = await fetch(`${BASE}/api/redirects/import/preview`, { method: 'POST', headers: auth, body: JSON.stringify({ csv }) });
  const job = await preview.json();
  assert.strictEqual(job.preview[0].valid, false);
  assert.ok(job.preview[0].errors.length > 0);

  const apply = await fetch(`${BASE}/api/redirects/import/${job.id}/apply`, { method: 'POST', headers: auth });
  assert.strictEqual(apply.status, 400, 'apply must refuse a job with any invalid row');
});

test('GET /api/redirects/export.csv returns a real CSV with header row', async () => {
  const res = await fetch(`${BASE}/api/redirects/export.csv`, { headers: auth });
  assert.strictEqual(res.status, 200);
  const text = await res.text();
  assert.ok(text.startsWith('fromPath,toPath,statusCode,matchType,notes'));
});

test('redirect import endpoints require auth', async () => {
  const res = await fetch(`${BASE}/api/redirects/import/preview`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ csv: 'fromPath,toPath\n/a,/b\n' }) });
  assert.strictEqual(res.status, 401);
});

// ---------------------------------------------------------------------------
// Internal-link migration: preview -> apply -> rollback round-trip
// ---------------------------------------------------------------------------

test('link migration: stale href in an html content_section is found, rewritten on apply, restored on rollback', async () => {
  // Real redirect this page's content will reference.
  await fetch(`${BASE}/api/redirects`, { method: 'POST', headers: auth, body: JSON.stringify({ fromPath: '/link-mig-old', toPath: '/link-mig-new', matchType: 'exact' }) });

  const createPage = await fetch(`${BASE}/api/pages`, {
    method: 'POST', headers: auth, body: JSON.stringify({
      title: 'Link Migration Test Page', slug: 'link-migration-test',
      content_sections: [{ type: 'html', body: '<p>See our <a href="/link-mig-old">old page</a> for details.</p>' }],
    })
  });
  assert.strictEqual(createPage.status, 201);
  const page = await createPage.json();

  const preview = await fetch(`${BASE}/api/redirects/link-migration/preview`, { method: 'POST', headers: auth });
  assert.strictEqual(preview.status, 201);
  const job = await preview.json();
  const finding = job.preview.findings.find((f) => f.pageId === page.id);
  assert.ok(finding, 'expected a finding for the newly created page');
  assert.strictEqual(finding.currentPath, '/link-mig-old');
  assert.strictEqual(finding.redirectTarget, '/link-mig-new');

  const apply = await fetch(`${BASE}/api/redirects/link-migration/${job.id}/apply`, { method: 'POST', headers: auth });
  assert.strictEqual(apply.status, 200);
  const applied = await apply.json();
  assert.strictEqual(applied.pagesChangedCount, 1);

  const afterApply = await fetch(`${BASE}/api/pages/${page.id}`, { headers: auth });
  const pageAfter = await afterApply.json();
  const sectionsAfter = JSON.parse(pageAfter.content_sections);
  assert.ok(sectionsAfter[0].body.includes('href="/link-mig-new"'), 'href must be rewritten to the redirect target');
  assert.ok(!sectionsAfter[0].body.includes('href="/link-mig-old"'));

  const rollback = await fetch(`${BASE}/api/redirects/link-migration/${job.id}/rollback`, { method: 'POST', headers: auth });
  assert.strictEqual(rollback.status, 200);

  const afterRollback = await fetch(`${BASE}/api/pages/${page.id}`, { headers: auth });
  const pageAfterRollback = await afterRollback.json();
  const sectionsAfterRollback = JSON.parse(pageAfterRollback.content_sections);
  assert.ok(sectionsAfterRollback[0].body.includes('href="/link-mig-old"'), 'rollback must restore the original href');
});

test('link migration: a page whose links point to healthy (non-redirected) paths produces no finding for it', async () => {
  const createPage = await fetch(`${BASE}/api/pages`, {
    method: 'POST', headers: auth, body: JSON.stringify({
      title: 'Healthy Links Test Page', slug: 'healthy-links-test',
      content_sections: [{ type: 'html', body: '<p>See our <a href="/menu">menu</a> for details.</p>' }],
    })
  });
  const page = await createPage.json();

  const preview = await fetch(`${BASE}/api/redirects/link-migration/preview`, { method: 'POST', headers: auth });
  const job = await preview.json();
  assert.ok(Array.isArray(job.preview.findings));
  assert.ok(!job.preview.findings.some((f) => f.pageId === page.id), 'a link to /menu (no redirect exists for it) must not be reported as stale');
});

// ---------------------------------------------------------------------------
// Editorial: checklist definitions, per-resource checklist toggle, append-only signoffs
// ---------------------------------------------------------------------------

let editorialPageId;

test('editorial setup: create a page for editorial workflow tests', async () => {
  const res = await fetch(`${BASE}/api/pages`, { method: 'POST', headers: auth, body: JSON.stringify({ title: 'Editorial Test Page', slug: 'editorial-test-page' }) });
  assert.strictEqual(res.status, 201);
  const page = await res.json();
  editorialPageId = page.id;
});

test('checklist definition CRUD: create, list, update, deactivate', async () => {
  const create = await fetch(`${BASE}/api/seo/checklist-definitions`, { method: 'POST', headers: auth, body: JSON.stringify({ itemKey: 'has-meta-description', label: 'Meta description is set' }) });
  assert.strictEqual(create.status, 201);
  const def = await create.json();
  assert.strictEqual(def.itemKey, 'has-meta-description');
  assert.strictEqual(def.isActive, 1);

  const list = await fetch(`${BASE}/api/seo/checklist-definitions`, { headers: auth });
  const defs = await list.json();
  assert.ok(defs.some((d) => d.id === def.id));

  const update = await fetch(`${BASE}/api/seo/checklist-definitions/${def.id}`, { method: 'PUT', headers: auth, body: JSON.stringify({ label: 'Meta description is set and unique' }) });
  assert.strictEqual(update.status, 200);
  const updated = await update.json();
  assert.strictEqual(updated.label, 'Meta description is set and unique');

  const deactivate = await fetch(`${BASE}/api/seo/checklist-definitions/${def.id}`, { method: 'DELETE', headers: auth });
  assert.strictEqual(deactivate.status, 200);
  const deactivated = await deactivate.json();
  assert.strictEqual(deactivated.isActive, 0);

  const listAfter = await fetch(`${BASE}/api/seo/checklist-definitions`, { headers: auth });
  const defsAfter = await listAfter.json();
  assert.ok(!defsAfter.some((d) => d.id === def.id), 'deactivated definition must not appear in default list');
});

test('duplicate checklist itemKey rejected with 409', async () => {
  await fetch(`${BASE}/api/seo/checklist-definitions`, { method: 'POST', headers: auth, body: JSON.stringify({ itemKey: 'dup-key-test', label: 'First' }) });
  const dup = await fetch(`${BASE}/api/seo/checklist-definitions`, { method: 'POST', headers: auth, body: JSON.stringify({ itemKey: 'dup-key-test', label: 'Second' }) });
  assert.strictEqual(dup.status, 409);
});

test('per-resource checklist: toggle completed on/off is a real logged state change, not silently lost', async () => {
  const create = await fetch(`${BASE}/api/seo/checklist-definitions`, { method: 'POST', headers: auth, body: JSON.stringify({ itemKey: 'toggle-test-item', label: 'Toggle test' }) });
  const def = await create.json();

  const checklist = await fetch(`${BASE}/api/seo/resources/page/${editorialPageId}/checklist`, { headers: auth });
  assert.strictEqual(checklist.status, 200);
  const items = await checklist.json();
  const item = items.find((i) => i.definitionId === def.id);
  assert.ok(item, 'checklist item must appear for a page resource even before any status row exists');
  assert.strictEqual(item.completed, false);

  const complete = await fetch(`${BASE}/api/seo/resources/page/${editorialPageId}/checklist/${def.id}`, { method: 'PUT', headers: auth, body: JSON.stringify({ completed: true, notes: 'done' }) });
  assert.strictEqual(complete.status, 200);
  const afterComplete = await complete.json();
  const completedItem = afterComplete.find((i) => i.definitionId === def.id);
  assert.strictEqual(completedItem.completed, true);
  assert.ok(completedItem.completedAt);
  assert.strictEqual(completedItem.notes, 'done');

  const uncomplete = await fetch(`${BASE}/api/seo/resources/page/${editorialPageId}/checklist/${def.id}`, { method: 'PUT', headers: auth, body: JSON.stringify({ completed: false }) });
  const afterUncomplete = await uncomplete.json();
  const uncompletedItem = afterUncomplete.find((i) => i.definitionId === def.id);
  assert.strictEqual(uncompletedItem.completed, false, 'un-checking must be a real, visible state change');
});

test('signoffs are append-only: recording a new signoff never overwrites history, only adds', async () => {
  const first = await fetch(`${BASE}/api/seo/resources/page/${editorialPageId}/signoffs`, { method: 'POST', headers: auth, body: JSON.stringify({ signoffType: 'fact_check', status: 'unverified', notes: 'initial check' }) });
  assert.strictEqual(first.status, 201);

  const second = await fetch(`${BASE}/api/seo/resources/page/${editorialPageId}/signoffs`, { method: 'POST', headers: auth, body: JSON.stringify({ signoffType: 'fact_check', status: 'verified', notes: 'confirmed by editor' }) });
  assert.strictEqual(second.status, 201);
  const afterSecond = await second.json();
  assert.ok(afterSecond.length >= 2, 'both signoff rows must exist — this is an append-only log, not an overwrite');
  assert.strictEqual(afterSecond[0].status, 'verified', 'most recent signoff sorts first');
  assert.strictEqual(afterSecond[1].status, 'unverified', 'the original signoff row must still be present, unmodified');

  const list = await fetch(`${BASE}/api/seo/resources/page/${editorialPageId}/signoffs`, { headers: auth });
  const allSignoffs = await list.json();
  assert.ok(allSignoffs.length >= 2);
});

test('recordSeoSignoff updates the denormalized current-status column on the resource', async () => {
  const summary = await fetch(`${BASE}/api/seo/resources/page/${editorialPageId}/editorial-summary`, { headers: auth });
  assert.strictEqual(summary.status, 200);
  const body = await summary.json();
  assert.strictEqual(body.factCheckStatus, 'verified', 'must reflect the most recent fact_check signoff');
});

test('invalid signoff type/status rejected with 400', async () => {
  const res = await fetch(`${BASE}/api/seo/resources/page/${editorialPageId}/signoffs`, { method: 'POST', headers: auth, body: JSON.stringify({ signoffType: 'not_a_real_type', status: 'verified' }) });
  assert.strictEqual(res.status, 400);
});

test('legal approval requirement toggle + editorial summary readyToPublish logic', async () => {
  const setRequired = await fetch(`${BASE}/api/seo/resources/page/${editorialPageId}/legal-required`, { method: 'PUT', headers: auth, body: JSON.stringify({ required: true }) });
  assert.strictEqual(setRequired.status, 200);

  const summaryBefore = await fetch(`${BASE}/api/seo/resources/page/${editorialPageId}/editorial-summary`, { headers: auth });
  const bodyBefore = await summaryBefore.json();
  assert.strictEqual(bodyBefore.legalApprovalRequired, true);
  assert.strictEqual(bodyBefore.legalSatisfied, false, 'legal is required but not yet approved');

  await fetch(`${BASE}/api/seo/resources/page/${editorialPageId}/signoffs`, { method: 'POST', headers: auth, body: JSON.stringify({ signoffType: 'legal_compliance', status: 'approved' }) });

  const summaryAfter = await fetch(`${BASE}/api/seo/resources/page/${editorialPageId}/editorial-summary`, { headers: auth });
  const bodyAfter = await summaryAfter.json();
  assert.strictEqual(bodyAfter.legalApprovalStatus, 'approved');
  assert.strictEqual(bodyAfter.legalSatisfied, true);
});

test('editorial-summary for a nonexistent resource returns 404', async () => {
  const res = await fetch(`${BASE}/api/seo/resources/page/999999999/editorial-summary`, { headers: auth });
  assert.strictEqual(res.status, 404);
});

// ---------------------------------------------------------------------------
// Entities: create/attach/delete + JSON-LD role mapping
// ---------------------------------------------------------------------------

let entitySeoResourceId;

test('entities setup: locate the seo_resources row id for the editorial test page', async () => {
  const Database = require('better-sqlite3');
  const conn = new Database(dbPath, { readonly: true });
  const row = conn.prepare("SELECT id FROM seo_resources WHERE resourceType = 'page' AND resourceId = ?").get(String(editorialPageId));
  conn.close();
  assert.ok(row, 'seo_resources row must have been synced for the editorial test page by an earlier signoff/checklist call');
  entitySeoResourceId = row.id;
});

test('entity CRUD: create, attach as a reference with a role, list, delete reference, delete entity', async () => {
  const create = await fetch(`${BASE}/api/seo/entities`, { method: 'POST', headers: auth, body: JSON.stringify({ entityType: 'Person', name: 'DJ Test Performer' }) });
  assert.strictEqual(create.status, 201);
  const entity = await create.json();
  assert.strictEqual(entity.entityType, 'Person');

  const attach = await fetch(`${BASE}/api/seo/entity-references`, { method: 'POST', headers: auth, body: JSON.stringify({ seoResourceId: entitySeoResourceId, seoEntityId: entity.id, role: 'performer' }) });
  assert.strictEqual(attach.status, 201);
  const ref = await attach.json();
  assert.strictEqual(ref.role, 'performer');

  const list = await fetch(`${BASE}/api/seo/resources/${entitySeoResourceId}/entity-references`, { headers: auth });
  assert.strictEqual(list.status, 200);
  const refs = await list.json();
  assert.ok(refs.some((r) => r.entityId === entity.id && r.role === 'performer'));

  const dup = await fetch(`${BASE}/api/seo/entity-references`, { method: 'POST', headers: auth, body: JSON.stringify({ seoResourceId: entitySeoResourceId, seoEntityId: entity.id, role: 'performer' }) });
  assert.strictEqual(dup.status, 409, 'the same entity in the same role on the same resource twice must be rejected');

  const deleteRef = await fetch(`${BASE}/api/seo/entity-references/${ref.id}`, { method: 'DELETE', headers: auth });
  assert.strictEqual(deleteRef.status, 200);

  const listAfter = await fetch(`${BASE}/api/seo/resources/${entitySeoResourceId}/entity-references`, { headers: auth });
  const refsAfter = await listAfter.json();
  assert.ok(!refsAfter.some((r) => r.entityId === entity.id));

  const deleteEntity = await fetch(`${BASE}/api/seo/entities/${entity.id}`, { method: 'DELETE', headers: auth });
  assert.strictEqual(deleteEntity.status, 200);

  const listEntities = await fetch(`${BASE}/api/seo/entities`, { headers: auth });
  const entities = await listEntities.json();
  assert.ok(!entities.some((e) => e.id === entity.id), 'soft-deleted entity must not appear in default list');
});

test('invalid entity type/role rejected with 400', async () => {
  const badType = await fetch(`${BASE}/api/seo/entities`, { method: 'POST', headers: auth, body: JSON.stringify({ entityType: 'NotARealType', name: 'X' }) });
  assert.strictEqual(badType.status, 400);

  const validEntity = await fetch(`${BASE}/api/seo/entities`, { method: 'POST', headers: auth, body: JSON.stringify({ entityType: 'Organization', name: 'Valid Org' }) });
  const entity = await validEntity.json();
  const badRole = await fetch(`${BASE}/api/seo/entity-references`, { method: 'POST', headers: auth, body: JSON.stringify({ seoResourceId: entitySeoResourceId, seoEntityId: entity.id, role: 'not-a-real-role' }) });
  assert.strictEqual(badRole.status, 400);
});

// ---------------------------------------------------------------------------
// Master entities: slug uniqueness + stable @id build
// ---------------------------------------------------------------------------

test('master entity: create derives a slug, duplicate slug rejected with 409', async () => {
  const create = await fetch(`${BASE}/api/seo/master-entities`, { method: 'POST', headers: auth, body: JSON.stringify({ entityTypes: ['NightClub', 'Organization'], name: 'BLVD Park', idSlug: 'organization' }) });
  assert.strictEqual(create.status, 201);
  const entity = await create.json();
  assert.strictEqual(entity.idSlug, 'organization');
  assert.deepStrictEqual(entity.entityTypes, ['NightClub', 'Organization']);

  const dup = await fetch(`${BASE}/api/seo/master-entities`, { method: 'POST', headers: auth, body: JSON.stringify({ entityTypes: ['Organization'], name: 'Different Name Same Slug', idSlug: 'organization' }) });
  assert.strictEqual(dup.status, 409);
});

test('master entity: property allowlist rejects an unrecognized schema.org property key', async () => {
  const res = await fetch(`${BASE}/api/seo/master-entities`, { method: 'POST', headers: auth, body: JSON.stringify({ entityTypes: ['Person'], name: 'Fake Performer', propertiesJson: { notARealProperty: 'x' } }) });
  assert.strictEqual(res.status, 400);
});

test('master entity: retrieve by id, update, soft-delete', async () => {
  const create = await fetch(`${BASE}/api/seo/master-entities`, { method: 'POST', headers: auth, body: JSON.stringify({ entityTypes: ['Person'], name: 'Resident DJ' }) });
  const entity = await create.json();

  const get = await fetch(`${BASE}/api/seo/master-entities/${entity.id}`, { headers: auth });
  assert.strictEqual(get.status, 200);

  const update = await fetch(`${BASE}/api/seo/master-entities/${entity.id}`, { method: 'PUT', headers: auth, body: JSON.stringify({ description: 'Resident DJ at BLVD Park' }) });
  assert.strictEqual(update.status, 200);
  const updated = await update.json();
  assert.strictEqual(updated.description, 'Resident DJ at BLVD Park');

  const del = await fetch(`${BASE}/api/seo/master-entities/${entity.id}`, { method: 'DELETE', headers: auth });
  assert.strictEqual(del.status, 200);

  const list = await fetch(`${BASE}/api/seo/master-entities`, { headers: auth });
  const entities = await list.json();
  assert.ok(!entities.some((e) => e.id === entity.id));
});

test('buildMasterEntityId produces the real stable @id URI shape', () => {
  const { buildMasterEntityId, buildMasterEntityJsonLd } = require('../lib/seo-master-entities');
  const entity = { idSlug: 'organization', entityTypes: ['NightClub'], name: 'BLVD Park', description: null, sameAs: [], properties: {} };
  assert.strictEqual(buildMasterEntityId('https://blvdpark.com', entity), 'https://blvdpark.com/#organization');
  const jsonld = buildMasterEntityJsonLd('https://blvdpark.com', entity);
  assert.strictEqual(jsonld['@id'], 'https://blvdpark.com/#organization');
  assert.strictEqual(jsonld['@type'], 'NightClub');
});

// ---------------------------------------------------------------------------
// Taxonomy: CRUD, pillar/cluster hierarchy, duplicate-term detection
// ---------------------------------------------------------------------------

test('taxonomy term CRUD: create, slug uniqueness, pillar/cluster parent, cycle guard', async () => {
  const pillar = await fetch(`${BASE}/api/seo/taxonomy/terms`, { method: 'POST', headers: auth, body: JSON.stringify({ name: 'Events', termType: 'category' }) });
  assert.strictEqual(pillar.status, 201);
  const pillarTerm = await pillar.json();

  const cluster = await fetch(`${BASE}/api/seo/taxonomy/terms`, { method: 'POST', headers: auth, body: JSON.stringify({ name: 'Live Music Nights', termType: 'category', parentTermId: pillarTerm.id }) });
  assert.strictEqual(cluster.status, 201);
  const clusterTerm = await cluster.json();
  assert.strictEqual(clusterTerm.parentTermId, pillarTerm.id);

  const cycleAttempt = await fetch(`${BASE}/api/seo/taxonomy/terms/${pillarTerm.id}`, { method: 'PUT', headers: auth, body: JSON.stringify({ parentTermId: clusterTerm.id }) });
  assert.strictEqual(cycleAttempt.status, 400, 'setting the pillar\'s parent to its own child must be rejected as a cycle');

  const dupSlug = await fetch(`${BASE}/api/seo/taxonomy/terms`, { method: 'POST', headers: auth, body: JSON.stringify({ name: 'Events', termType: 'tag' }) });
  assert.strictEqual(dupSlug.status, 409, 'same name derives the same slug regardless of termType');

  const tree = await fetch(`${BASE}/api/seo/taxonomy/tree`, { headers: auth });
  const treeBody = await tree.json();
  const pillarNode = treeBody.find((n) => n.id === pillarTerm.id);
  assert.ok(pillarNode, 'pillar must appear as a root node');
  assert.ok(pillarNode.children.some((c) => c.id === clusterTerm.id), 'cluster must appear nested under its pillar');

  const deleteWithChildren = await fetch(`${BASE}/api/seo/taxonomy/terms/${pillarTerm.id}`, { method: 'DELETE', headers: auth });
  assert.strictEqual(deleteWithChildren.status, 400, 'cannot delete a pillar with active children');

  await fetch(`${BASE}/api/seo/taxonomy/terms/${clusterTerm.id}`, { method: 'DELETE', headers: auth });
  const deleteAfterChildRemoved = await fetch(`${BASE}/api/seo/taxonomy/terms/${pillarTerm.id}`, { method: 'DELETE', headers: auth });
  assert.strictEqual(deleteAfterChildRemoved.status, 200);
});

test('taxonomy duplicate-term detection: deliberately-similar term names are flagged with shared-word evidence', async () => {
  await fetch(`${BASE}/api/seo/taxonomy/terms`, { method: 'POST', headers: auth, body: JSON.stringify({ name: 'VIP Table Service', termType: 'tag' }) });
  await fetch(`${BASE}/api/seo/taxonomy/terms`, { method: 'POST', headers: auth, body: JSON.stringify({ name: 'Table Service VIP', termType: 'tag' }) });

  const dupRes = await fetch(`${BASE}/api/seo/taxonomy/duplicates?termType=tag`, { headers: auth });
  assert.strictEqual(dupRes.status, 200);
  const pairs = await dupRes.json();
  const found = pairs.find((p) =>
    (p.termAName === 'VIP Table Service' && p.termBName === 'Table Service VIP') ||
    (p.termBName === 'VIP Table Service' && p.termAName === 'Table Service VIP')
  );
  assert.ok(found, `expected a near-duplicate pair for VIP Table Service / Table Service VIP, got: ${JSON.stringify(pairs)}`);
  assert.strictEqual(found.similarity, 1, 'identical word sets in different order must score similarity 1');
  assert.ok(found.sharedWords.includes('vip') && found.sharedWords.includes('table') && found.sharedWords.includes('service'));
});

test('taxonomy duplicate-term detection: genuinely different term names are not flagged', async () => {
  await fetch(`${BASE}/api/seo/taxonomy/terms`, { method: 'POST', headers: auth, body: JSON.stringify({ name: 'Weekend Brunch', termType: 'topic' }) });
  await fetch(`${BASE}/api/seo/taxonomy/terms`, { method: 'POST', headers: auth, body: JSON.stringify({ name: 'Private Event Hosting', termType: 'topic' }) });
  const dupRes = await fetch(`${BASE}/api/seo/taxonomy/duplicates?termType=topic`, { headers: auth });
  const pairs = await dupRes.json();
  assert.ok(!pairs.some((p) => (p.termAName === 'Weekend Brunch' && p.termBName === 'Private Event Hosting') || (p.termBName === 'Weekend Brunch' && p.termAName === 'Private Event Hosting')));
});

test('taxonomy term assignment: assign to resource, list, duplicate rejected, remove', async () => {
  const term = await fetch(`${BASE}/api/seo/taxonomy/terms`, { method: 'POST', headers: auth, body: JSON.stringify({ name: 'Assignment Test Term', termType: 'collection' }) });
  const termBody = await term.json();

  const assign = await fetch(`${BASE}/api/seo/resource-terms`, { method: 'POST', headers: auth, body: JSON.stringify({ seoResourceId: entitySeoResourceId, termId: termBody.id }) });
  assert.strictEqual(assign.status, 201);
  const assignment = await assign.json();

  const listForResource = await fetch(`${BASE}/api/seo/resources/${entitySeoResourceId}/terms`, { headers: auth });
  const termsForResource = await listForResource.json();
  assert.ok(termsForResource.some((t) => t.id === termBody.id));

  const listForTerm = await fetch(`${BASE}/api/seo/taxonomy/terms/${termBody.id}/resources`, { headers: auth });
  const resourcesForTerm = await listForTerm.json();
  assert.ok(resourcesForTerm.some((r) => r.id === entitySeoResourceId));

  const dupAssign = await fetch(`${BASE}/api/seo/resource-terms`, { method: 'POST', headers: auth, body: JSON.stringify({ seoResourceId: entitySeoResourceId, termId: termBody.id }) });
  assert.strictEqual(dupAssign.status, 409);

  const remove = await fetch(`${BASE}/api/seo/resource-terms/${assignment.id}`, { method: 'DELETE', headers: auth });
  assert.strictEqual(remove.status, 200);

  const listAfterRemove = await fetch(`${BASE}/api/seo/resources/${entitySeoResourceId}/terms`, { headers: auth });
  const termsAfterRemove = await listAfterRemove.json();
  assert.ok(!termsAfterRemove.some((t) => t.id === termBody.id));
});

// ---------------------------------------------------------------------------
// Robots directives builder (pure function, exposed via preview endpoint)
// ---------------------------------------------------------------------------

test('directives preview: legacy noindex option implies nofollow (options.noindex, not resource.indexState)', async () => {
  // buildRobotsDirectives' legacy-noindex-implies-nofollow contract applies
  // when noindex is forced via options.noindex/options.emergencyNoindex (the
  // old page-level noindex flag) — an "advanced" resource that owns
  // indexState==='noindex' directly is deliberately allowed the independent
  // noindex,follow combination instead (see backend/lib/seo-directives.js's
  // own comment on this exact branch, ported verbatim from Heights).
  const res = await fetch(`${BASE}/api/seo/directives/preview`, { method: 'POST', headers: auth, body: JSON.stringify({ resource: {}, options: { noindex: true } }) });
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.robots, 'noindex, nofollow');
});

test('directives preview: resource.indexState === noindex alone allows the independent noindex,follow combination', async () => {
  const res = await fetch(`${BASE}/api/seo/directives/preview`, { method: 'POST', headers: auth, body: JSON.stringify({ resource: { indexState: 'noindex' } }) });
  const body = await res.json();
  assert.strictEqual(body.robots, 'noindex, follow');
});

test('directives preview: expired resource is forced noindex even if indexState says index', async () => {
  const yesterday = new Date(Date.now() - 86400000).toISOString();
  const res = await fetch(`${BASE}/api/seo/directives/preview`, { method: 'POST', headers: auth, body: JSON.stringify({ resource: { indexState: 'index', expiresAt: yesterday } }) });
  const body = await res.json();
  assert.ok(body.isExpired);
  assert.ok(body.robots.startsWith('noindex'));
});

test('isRequestHostAuthorized: matches configured host, rejects mismatched host, allows loopback', () => {
  const { isRequestHostAuthorized } = require('../lib/seo-directives');
  assert.strictEqual(isRequestHostAuthorized('blvdpark.com', 'https://blvdpark.com'), true);
  assert.strictEqual(isRequestHostAuthorized('evil.example.com', 'https://blvdpark.com'), false);
  assert.strictEqual(isRequestHostAuthorized('127.0.0.1', 'https://blvdpark.com'), true);
  assert.strictEqual(isRequestHostAuthorized('localhost:4321', 'https://blvdpark.com'), true);
  assert.strictEqual(isRequestHostAuthorized(null, 'https://blvdpark.com'), true, 'no Host header fails open');
});
