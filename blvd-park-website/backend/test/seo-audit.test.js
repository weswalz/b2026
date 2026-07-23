// SEO crawler/audit engine contract tests — mirrors the exact pattern established
// by test/redirects.test.js and test/pages.test.js (read in full before writing
// this): spawn the real server on a random high port with a temp DB, drive it over
// real HTTP with fetch(), assert on real responses. Additionally includes pure
// unit tests against backend/lib/seo-audit.js's exported issue-detection
// functions directly (no server/HTTP needed for these — they take fixture HTML
// strings and assert on the returned evidence/evaluation shape), covering the
// required 8-10 pure functions: analyzeHtml (missing title/description/broken
// canonical/missing alt), evaluateHeadingOutline, evaluateBreadcrumbConsistency,
// evaluateSocialTags, evaluateImageAltQuality, evaluateLinkText, evaluateFormLabels,
// validateSchemaNodeForRichResults (schema validation failure), clusterByKey
// (duplicate title clustering), findNearDuplicateContentPairs (thin/near-dup
// content), jaccardSimilarity.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const {
  analyzeHtml,
  extractHeadings,
  evaluateHeadingOutline,
  evaluateBreadcrumbConsistency,
  evaluateSocialTags,
  evaluateImageAltQuality,
  evaluateLinkText,
  evaluateFormLabels,
  clusterByKey,
  normalizeVisibleText,
  shingleText,
  jaccardSimilarity,
  findNearDuplicateContentPairs,
  findCanonicalChain,
  computeCrawlDepths,
  evaluateUrlTrapRisk,
  evaluateReadability,
  validateSchemaNodeForRichResults,
  validateSchemaNodesForRichResults,
  classifySchemaRegression,
  validateLanguageTag,
  checkReciprocalHreflang,
  evaluateEventSchemaAgainstDatabase,
  getCrawlLockStatus,
  requestCrawlCancellation,
} = require('../lib/seo-audit');

// ---------------------------------------------------------------------------
// Pure unit tests — no server, no DB, no network. Fixture HTML in, evidence out.
// ---------------------------------------------------------------------------

test('analyzeHtml: missing title element is honestly reported as empty string', () => {
  const html = '<html><head><meta name="description" content="x"></head><body>hi</body></html>';
  const result = analyzeHtml(html, 'https://blvdpark.com/x');
  assert.strictEqual(result.title, '', 'missing <title> must yield an empty title, never a fabricated value');
});

test('analyzeHtml: missing meta description is honestly reported as empty string', () => {
  const html = '<html><head><title>A Page</title></head><body>hi</body></html>';
  const result = analyzeHtml(html, 'https://blvdpark.com/x');
  assert.strictEqual(result.description, '', 'missing meta description must yield an empty string');
});

test('analyzeHtml: broken/malformed canonical URL is flagged via canonicalIsMalformed', () => {
  // "http://[" is genuinely unparseable even against a base (WHATWG URL throws on a
  // truncated IPv6-bracket host) — verified directly against Node's URL parser before
  // choosing this fixture, since new URL(value, base) resolves almost any other string
  // as a relative path rather than throwing.
  const html = '<html><head><title>T</title><link rel="canonical" href="http://["></head><body>hi</body></html>';
  const result = analyzeHtml(html, 'https://blvdpark.com/x');
  assert.strictEqual(result.canonicalIsMalformed, true);
});

test('analyzeHtml: well-formed relative canonical resolves to an absolute canonicalUrl', () => {
  const html = '<html><head><title>T</title><link rel="canonical" href="/menu"></head><body>hi</body></html>';
  const result = analyzeHtml(html, 'https://blvdpark.com/x');
  assert.strictEqual(result.canonicalUrl, 'https://blvdpark.com/menu');
  assert.strictEqual(result.canonicalIsMalformed, false);
});

test('analyzeHtml: missing alt text is counted in imagesMissingAlt and imageAltEvidence', () => {
  const html = '<html><head><title>T</title></head><body><img src="/a.jpg"><img src="/b.jpg" alt="A real description"></body></html>';
  const result = analyzeHtml(html, 'https://blvdpark.com/x');
  assert.strictEqual(result.imageCount, 2);
  assert.strictEqual(result.imagesMissingAlt, 1, 'exactly one of the two images has no alt attribute');
  assert.strictEqual(result.imageAltEvidence[0].hasAlt, false);
  assert.strictEqual(result.imageAltEvidence[1].hasAlt, true);
});

test('analyzeHtml: parses valid JSON-LD into schemaNodes and reports zero schemaErrors', () => {
  const html = `<html><head><title>T</title><script type="application/ld+json">{"@type":"Event","name":"Trivia Night"}</script></head><body>hi</body></html>`;
  const result = analyzeHtml(html, 'https://blvdpark.com/x');
  assert.strictEqual(result.schemaErrors.length, 0);
  assert.strictEqual(result.schemaNodes.length, 1);
  assert.strictEqual(result.schemaNodes[0]['@type'], 'Event');
});

test('analyzeHtml: malformed JSON-LD is reported in schemaErrors, not silently dropped', () => {
  const html = `<html><head><title>T</title><script type="application/ld+json">{not valid json</script></head><body>hi</body></html>`;
  const result = analyzeHtml(html, 'https://blvdpark.com/x');
  assert.strictEqual(result.schemaNodes.length, 0);
  assert.strictEqual(result.schemaErrors.length, 1);
});

test('extractHeadings + evaluateHeadingOutline: detects a skipped heading level (H2 -> H4)', () => {
  const html = '<h1>Title</h1><h2>Section</h2><h4>Skipped to H4</h4>';
  const headings = extractHeadings(html);
  const outline = evaluateHeadingOutline(headings);
  assert.strictEqual(outline.skippedLevels.length, 1);
  assert.strictEqual(outline.skippedLevels[0].fromLevel, 2);
  assert.strictEqual(outline.skippedLevels[0].toLevel, 4);
});

test('extractHeadings + evaluateHeadingOutline: detects an empty heading', () => {
  const html = '<h1>Real Title</h1><h2></h2>';
  const headings = extractHeadings(html);
  const outline = evaluateHeadingOutline(headings);
  assert.strictEqual(outline.emptyHeadings.length, 1);
  assert.strictEqual(outline.emptyHeadings[0].level, 2);
});

test('evaluateBreadcrumbConsistency: schema present with no visible nav is flagged', () => {
  const evidence = { visible: [], hasVisibleNav: false, schemaItems: [{ position: 1, name: 'Home', item: 'https://blvdpark.com/' }], hasSchema: true };
  const result = evaluateBreadcrumbConsistency(evidence);
  assert.strictEqual(result.schemaWithoutVisible, true);
});

test('evaluateBreadcrumbConsistency: visible/schema count mismatch is flagged', () => {
  const evidence = {
    visible: [{ text: 'Home', href: '/' }, { text: 'Menu', href: '/menu' }],
    hasVisibleNav: true,
    schemaItems: [{ position: 1, name: 'Home', item: 'https://blvdpark.com/' }],
    hasSchema: true,
  };
  const result = evaluateBreadcrumbConsistency(evidence);
  assert.strictEqual(result.countMismatch, true);
});

test('evaluateBreadcrumbConsistency: matching visible + schema trail passes clean', () => {
  const evidence = {
    visible: [{ text: 'Home', href: '/' }, { text: 'Menu', href: '/menu' }],
    hasVisibleNav: true,
    schemaItems: [{ position: 1, name: 'Home', item: 'https://blvdpark.com/' }, { position: 2, name: 'Menu', item: 'https://blvdpark.com/menu' }],
    hasSchema: true,
  };
  const result = evaluateBreadcrumbConsistency(evidence);
  assert.strictEqual(result.schemaWithoutVisible, false);
  assert.strictEqual(result.visibleWithoutSchema, false);
  assert.strictEqual(result.countMismatch, false);
  assert.strictEqual(result.labelMismatches.length, 0);
});

test('evaluateSocialTags: missing required Open Graph properties are reported per OGP spec', () => {
  const rendered = { ogTitle: '', ogDescription: '', ogImage: '', ogUrl: '', ogType: '', twitterCard: '', twitterTitle: '', twitterDescription: '', twitterImage: '', twitterUrl: '' };
  const result = evaluateSocialTags(rendered);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('og:title')));
  assert.ok(result.errors.some((e) => e.includes('og:image')));
});

test('evaluateSocialTags: complete OG tags pass clean', () => {
  const rendered = { ogTitle: 'BLVD Park', ogDescription: 'desc', ogImage: 'https://blvdpark.com/og.jpg', ogUrl: 'https://blvdpark.com/', ogType: 'website', twitterCard: 'summary_large_image' };
  const result = evaluateSocialTags(rendered);
  assert.strictEqual(result.valid, true);
});

test('evaluateImageAltQuality: filename-like alt text is flagged as low quality', () => {
  const evidence = [{ hasAlt: true, alt: 'IMG_4821.jpg', src: '/uploads/a.jpg' }];
  const findings = evaluateImageAltQuality(evidence);
  assert.strictEqual(findings.length, 1);
  assert.ok(findings[0].reason.includes('filename'));
});

test('evaluateImageAltQuality: generic placeholder alt word is flagged', () => {
  const evidence = [{ hasAlt: true, alt: 'image', src: '/uploads/a.jpg' }];
  const findings = evaluateImageAltQuality(evidence);
  assert.strictEqual(findings.length, 1);
  assert.ok(findings[0].reason.includes('generic'));
});

test('evaluateImageAltQuality: a real descriptive alt text is not flagged', () => {
  const evidence = [{ hasAlt: true, alt: 'Steak dinner plated with roasted vegetables', src: '/uploads/a.jpg' }];
  const findings = evaluateImageAltQuality(evidence);
  assert.strictEqual(findings.length, 0);
});

test('evaluateLinkText: "click here" is flagged per WAI guidance', () => {
  const evidence = [{ href: '/menu', visibleText: 'Click Here', ariaLabel: '' }];
  const findings = evaluateLinkText(evidence);
  assert.strictEqual(findings.length, 1);
});

test('evaluateLinkText: bare URL as link text is flagged', () => {
  const evidence = [{ href: '/menu', visibleText: 'https://blvdpark.com/menu', ariaLabel: '' }];
  const findings = evaluateLinkText(evidence);
  assert.strictEqual(findings.length, 1);
});

test('evaluateLinkText: generic text with a real aria-label is not flagged (accessible name supplied)', () => {
  const evidence = [{ href: '/menu', visibleText: 'Click Here', ariaLabel: 'View the full food and drink menu' }];
  const findings = evaluateLinkText(evidence);
  assert.strictEqual(findings.length, 0);
});

test('evaluateFormLabels: an input with no label/aria-label/aria-labelledby is flagged', () => {
  const evidence = [{ tagName: 'input', type: 'email', id: 'email-field', hasForLabel: false, hasWrappingLabel: false, hasAriaLabel: false, hasAriaLabelledby: false }];
  const findings = evaluateFormLabels(evidence);
  assert.strictEqual(findings.length, 1);
});

test('evaluateFormLabels: an input with a for-label is not flagged', () => {
  const evidence = [{ tagName: 'input', type: 'email', id: 'email-field', hasForLabel: true, hasWrappingLabel: false, hasAriaLabel: false, hasAriaLabelledby: false }];
  const findings = evaluateFormLabels(evidence);
  assert.strictEqual(findings.length, 0);
});

test('validateSchemaNodeForRichResults: Event missing required startDate/location is flagged (schema validation failure)', () => {
  const node = { '@type': 'Event', name: 'Trivia Night' };
  const result = validateSchemaNodeForRichResults(node);
  assert.ok(result.missingRequired.includes('startDate'));
  assert.ok(result.missingRequired.includes('location'));
});

test('validateSchemaNodeForRichResults: complete Event schema has no missing required properties', () => {
  const node = { '@type': 'Event', name: 'Trivia Night', startDate: '2026-08-01T19:00', location: { '@type': 'Place', address: { '@type': 'PostalAddress', streetAddress: '123 Main St' } } };
  const result = validateSchemaNodeForRichResults(node);
  assert.strictEqual(result.missingRequired.length, 0);
});

test('validateSchemaNodeForRichResults: FAQPage is reported as a deprecated Google rich-result type', () => {
  const node = { '@type': 'FAQPage', mainEntity: [] };
  const result = validateSchemaNodeForRichResults(node);
  assert.ok(result.deprecatedTypes.includes('FAQPage'));
});

test('validateSchemaNodesForRichResults: aggregates missing-required across multiple nodes', () => {
  const nodes = [{ '@type': 'Event', name: 'X' }, { '@type': 'LocalBusiness', name: 'BLVD Park' }];
  const result = validateSchemaNodesForRichResults(nodes);
  assert.strictEqual(result.anyMissingRequired, true);
});

test('clusterByKey: two pages sharing the same normalized title are clustered (duplicate title)', () => {
  const entries = [
    { key: 'welcome to blvd park', url: 'https://blvdpark.com/a' },
    { key: 'welcome to blvd park', url: 'https://blvdpark.com/b' },
    { key: 'unique other title', url: 'https://blvdpark.com/c' },
  ];
  const clusters = clusterByKey(entries);
  assert.strictEqual(clusters.size, 1, 'only the shared-title key should form a cluster');
  assert.deepStrictEqual(clusters.get('welcome to blvd park'), ['https://blvdpark.com/a', 'https://blvdpark.com/b']);
});

test('normalizeVisibleText + jaccardSimilarity: identical text is 100% similar', () => {
  const a = normalizeVisibleText('<p>Come enjoy steak night every Thursday at BLVD Park.</p>');
  const b = normalizeVisibleText('<p>Come enjoy steak night every Thursday at BLVD Park.</p>');
  const sim = jaccardSimilarity(shingleText(a), shingleText(b));
  assert.strictEqual(sim, 1);
});

test('findNearDuplicateContentPairs: near-identical page copy is flagged with a real similarity score', () => {
  const pages = [
    { url: 'https://blvdpark.com/a', normalizedText: normalizeVisibleText('come enjoy steak night every thursday at blvd park with live music and drink specials all night long') },
    { url: 'https://blvdpark.com/b', normalizedText: normalizeVisibleText('come enjoy steak night every thursday at blvd park with live music and drink specials all night long too') },
  ];
  const pairs = findNearDuplicateContentPairs(pages, 0.6, 5);
  assert.strictEqual(pairs.length, 1);
  assert.ok(pairs[0].similarity > 0.6 && pairs[0].similarity < 1);
});

test('findNearDuplicateContentPairs: unrelated pages are not flagged', () => {
  const pages = [
    { url: 'https://blvdpark.com/a', normalizedText: normalizeVisibleText('steak night thursday at blvd park') },
    { url: 'https://blvdpark.com/b', normalizedText: normalizeVisibleText('book your private event with our team today') },
  ];
  const pairs = findNearDuplicateContentPairs(pages, 0.6, 5);
  assert.strictEqual(pairs.length, 0);
});

test('findCanonicalChain: detects a canonical loop (A -> B -> A)', () => {
  const map = new Map([['/a', '/b'], ['/b', '/a']]);
  const { loopFound } = findCanonicalChain(map, '/a');
  assert.strictEqual(loopFound, true);
});

test('findCanonicalChain: a one-hop chain to a distinct, self-canonical target has no loop', () => {
  // Matches how runSeoAudit() actually calls this: the caller only invokes
  // findCanonicalChain() when the start path's declared canonical differs from its own
  // path (declaredKey !== pathname; a genuinely self-canonical page is never passed in
  // at all — see the call site in runSeoAudit()). So the real "clean" case is a distinct
  // start path pointing at a target that itself is not in the map (a page findCanonicalChain
  // treats as a terminus, per the `next === undefined` break condition), never a map entry
  // that points at itself.
  const map = new Map([['/a', '/b']]);
  const { loopFound, chain } = findCanonicalChain(map, '/a');
  assert.strictEqual(loopFound, false);
  assert.deepStrictEqual(chain, ['/a', '/b']);
});

test('computeCrawlDepths: BFS distance from homepage over a real link graph', () => {
  const adjacency = new Map([
    ['/', new Set(['/menu'])],
    ['/menu', new Set(['/events'])],
    ['/events', new Set()],
  ]);
  const depths = computeCrawlDepths(adjacency, '/');
  assert.strictEqual(depths.get('/'), 0);
  assert.strictEqual(depths.get('/menu'), 1);
  assert.strictEqual(depths.get('/events'), 2);
});

test('evaluateUrlTrapRisk: three+ query params with pagination-shaped names is flagged', () => {
  const result = evaluateUrlTrapRisk('/menu?page=2&sort=date&category=drinks');
  assert.strictEqual(result.isSuspectedTrap, true);
});

test('evaluateUrlTrapRisk: a normal single-param admin URL is not flagged', () => {
  const result = evaluateUrlTrapRisk('/menu?type=food');
  assert.strictEqual(result.isSuspectedTrap, false);
});

test('evaluateReadability: thin/very short content still returns a real score, not a fabricated pass', () => {
  const result = evaluateReadability('Book now.', 'en-US');
  // Two words, one sentence — enough for the formula to compute, though the number
  // itself has no strong meaning at this length; the point is it's real, not skipped.
  assert.strictEqual(result.skipped, false);
  assert.strictEqual(typeof result.fleschReadingEase, 'number');
});

test('evaluateReadability: non-English language is honestly skipped, never scored', () => {
  const result = evaluateReadability('Reserva ahora para la mejor noche de la ciudad.', 'es-MX');
  assert.strictEqual(result.skipped, true);
  assert.ok(result.reason.includes('English'));
});

test('classifySchemaRegression: a newly-failing required-property code is a real regression', () => {
  const result = classifySchemaRegression([], ['SCHEMA_MISSING_REQUIRED_PROPERTY'], true);
  assert.strictEqual(result.isRegression, true);
  assert.deepStrictEqual(result.newlyFailingCodes, ['SCHEMA_MISSING_REQUIRED_PROPERTY']);
});

test('classifySchemaRegression: no previous run means never a regression (nothing to regress from)', () => {
  const result = classifySchemaRegression([], ['SCHEMA_MISSING_REQUIRED_PROPERTY'], false);
  assert.strictEqual(result.isRegression, false);
});

test('validateLanguageTag: a bare 2-letter code is valid BCP47 syntax', () => {
  const result = validateLanguageTag('en');
  assert.strictEqual(result.valid, true);
});

test('validateLanguageTag: a malformed hreflang code is rejected', () => {
  const result = validateLanguageTag('not_a_lang_tag!!');
  assert.strictEqual(result.valid, false);
});

test('checkReciprocalHreflang: a one-way hreflang link (not reciprocated) is flagged', () => {
  const entriesByUrl = new Map([
    ['https://blvdpark.com/', [{ lang: 'es', url: 'https://blvdpark.com/es' }]],
    ['https://blvdpark.com/es', []],
  ]);
  const broken = checkReciprocalHreflang(entriesByUrl);
  assert.strictEqual(broken.length, 1);
});

test('evaluateEventSchemaAgainstDatabase: schema startDate mismatching stored event date is flagged', () => {
  const schemaNode = { name: 'Trivia Night', startDate: '2026-09-01', eventStatus: 'https://schema.org/EventScheduled' };
  const dbEvent = { title: 'Trivia Night', date: '2026-09-02', status: 'active' };
  const result = evaluateEventSchemaAgainstDatabase(schemaNode, dbEvent, '2026-08-01');
  assert.ok(result.dateMismatch);
  assert.strictEqual(result.dateMismatch.schemaValue, '2026-09-01');
  assert.strictEqual(result.dateMismatch.dbValue, '2026-09-02');
});

test('evaluateEventSchemaAgainstDatabase: a scheduled event whose real date has passed is flagged stale', () => {
  const schemaNode = { name: 'Past Trivia', startDate: '2026-01-01', eventStatus: 'https://schema.org/EventScheduled' };
  const dbEvent = { title: 'Past Trivia', date: '2026-01-01', status: 'active' };
  const result = evaluateEventSchemaAgainstDatabase(schemaNode, dbEvent, '2026-08-01');
  assert.ok(result.staleScheduledEvent);
});

test('evaluateEventSchemaAgainstDatabase: matching title/date/future-date produces no findings', () => {
  const schemaNode = { name: 'Trivia Night', startDate: '2026-12-01', eventStatus: 'https://schema.org/EventScheduled' };
  const dbEvent = { title: 'Trivia Night', date: '2026-12-01', status: 'active' };
  const result = evaluateEventSchemaAgainstDatabase(schemaNode, dbEvent, '2026-08-01');
  assert.strictEqual(result.nameMismatch, null);
  assert.strictEqual(result.dateMismatch, null);
  assert.strictEqual(result.staleScheduledEvent, null);
});

test('getCrawlLockStatus: reports not-running when no crawl is in progress', () => {
  const status = getCrawlLockStatus();
  assert.strictEqual(status.running, false);
});

test('requestCrawlCancellation: a stale/unknown crawlRunId is a safe no-op, never throws', () => {
  const result = requestCrawlCancellation('does-not-exist-999', 'tester');
  assert.strictEqual(result, false);
});

// ---------------------------------------------------------------------------
// Live-server contract tests — spawns the real server, drives the real Express
// routes over HTTP, exercises the crawler against BLVD's own live-loopback pages.
// ---------------------------------------------------------------------------
const PORT = 40000 + Math.floor(Math.random() * 20000);
const BASE = `http://127.0.0.1:${PORT}`;
const KEY = 'test-admin-key';
let proc;

const auth = { 'x-auth-key': KEY, 'Content-Type': 'application/json' };

before(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blvd-seo-audit-'));
  proc = spawn('node', [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(PORT), DB_PATH: path.join(tmp, 'test.db'), ADMIN_API_KEY: KEY, UPLOADS_DIR: path.join(tmp, 'uploads'), SEO_AUDIT_BASE_URL: BASE },
    stdio: 'ignore',
  });
  let started = false;
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`${BASE}/api/health`); if (r.ok) { started = true; break; } } catch (_e) {}
    await new Promise((r) => setTimeout(r, 200));
  }
  if (!started) throw new Error('server did not start');

  // Seed one real, published page before any crawl test runs. Without at least one
  // crawlable resource, listSeoResources() returns an empty array and runSeoAudit()'s
  // per-resource loop never hits a real `await fetch(...)` — the whole async function
  // then runs to completion synchronously (no yield point), which makes the
  // concurrency-lock race test below unwinnable (the crawl finishes and releases the
  // lock before a second HTTP request can even be dispatched). A real page gives the
  // crawler a real network fetch to await, which is also just a more honest test of an
  // actual crawl than an empty one.
  await fetch(`${BASE}/api/pages`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({ title: 'Seed Page', slug: 'seed-page', status: 'published', robots: 'index, follow' }),
  });
});

after(() => { proc.kill(); });

test('GET /api/seo/summary requires auth and returns real counts', async () => {
  const noAuth = await fetch(`${BASE}/api/seo/summary`);
  assert.strictEqual(noAuth.status, 401);

  const res = await fetch(`${BASE}/api/seo/summary`, { headers: auth });
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(typeof body.resources, 'number');
  assert.strictEqual(typeof body.openIssues, 'number');
  assert.strictEqual(body.lastRun, null, 'no crawl has run yet in this fresh test DB');
});

test('GET /api/seo/crawl/status reports not-running before any crawl', async () => {
  const res = await fetch(`${BASE}/api/seo/crawl/status`, { headers: auth });
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.running, false);
});

test('POST /api/seo/crawl/sync runs a real crawl against this server\'s own loopback pages and persists a completed run', async () => {
  const res = await fetch(`${BASE}/api/seo/crawl/sync`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({ maxPages: 5, maxDurationMs: 30000 }),
  });
  assert.strictEqual(res.status, 200, `expected a completed run; got ${res.status}`);
  const run = await res.json();
  assert.strictEqual(run.status, 'completed');
  assert.strictEqual(typeof run.totalUrls, 'number');

  const runsList = await fetch(`${BASE}/api/seo/runs`, { headers: auth });
  const runs = await runsList.json();
  assert.ok(runs.some((r) => r.id === run.id), 'the completed run must appear in run history');

  const pageChecks = await fetch(`${BASE}/api/seo/runs/${run.id}/page-checks`, { headers: auth });
  assert.strictEqual(pageChecks.status, 200);
  assert.ok(Array.isArray(await pageChecks.json()));
});

test('a second concurrent crawl is rejected with 409 while one is in flight', async () => {
  // The fixture site is tiny (a handful of pages), so a /crawl/sync run can complete in
  // under a millisecond — too fast to reliably race a second HTTP request against. Use
  // the async (fire-and-forget) POST /api/seo/crawl endpoint instead: it acquires the
  // real in-process lock synchronously before returning 202, so by the time the 202
  // response is back, activeCrawlLock is guaranteed to be held for the immediately-following
  // second request.
  const start = await fetch(`${BASE}/api/seo/crawl`, { method: 'POST', headers: auth, body: JSON.stringify({ maxPages: 5, maxDurationMs: 30000 }) });
  assert.strictEqual(start.status, 202);
  const second = await fetch(`${BASE}/api/seo/crawl/sync`, { method: 'POST', headers: auth, body: JSON.stringify({ maxPages: 5, maxDurationMs: 30000 }) });
  assert.strictEqual(second.status, 409);
  // Drain the first (async) crawl before moving on so it doesn't leak into later tests.
  for (let i = 0; i < 100; i++) {
    const status = await fetch(`${BASE}/api/seo/crawl/status`, { headers: auth });
    const lock = await status.json();
    if (!lock.running) break;
    await new Promise((r) => setTimeout(r, 50));
  }
});

test('GET /api/seo/issues requires auth and returns an array', async () => {
  const noAuth = await fetch(`${BASE}/api/seo/issues`);
  assert.strictEqual(noAuth.status, 401);

  const res = await fetch(`${BASE}/api/seo/issues?status=all`, { headers: auth });
  assert.strictEqual(res.status, 200);
  assert.ok(Array.isArray(await res.json()));
});

test('PATCH /api/seo/issues/:id updates status and is reflected on the row', async () => {
  const list = await fetch(`${BASE}/api/seo/issues?status=all&limit=1`, { headers: auth });
  const issues = await list.json();
  if (!issues.length) return; // No issues on this minimal test fixture site — nothing to patch.
  const target = issues[0];
  const res = await fetch(`${BASE}/api/seo/issues/${target.id}`, {
    method: 'PATCH', headers: auth, body: JSON.stringify({ status: 'ignored' }),
  });
  assert.strictEqual(res.status, 200);
  const updated = await res.json();
  assert.strictEqual(updated.status, 'ignored');
});

test('PATCH /api/seo/issues/:id with an invalid status is rejected', async () => {
  const res = await fetch(`${BASE}/api/seo/issues/1`, {
    method: 'PATCH', headers: auth, body: JSON.stringify({ status: 'not-a-real-status' }),
  });
  assert.strictEqual(res.status, 400);
});

test('GET /api/seo/links returns the current link inventory as an array', async () => {
  const res = await fetch(`${BASE}/api/seo/links`, { headers: auth });
  assert.strictEqual(res.status, 200);
  assert.ok(Array.isArray(await res.json()));
});

test('POST /api/seo/crawl (async) returns 202 immediately with lock status', async () => {
  const res = await fetch(`${BASE}/api/seo/crawl`, { method: 'POST', headers: auth, body: JSON.stringify({ maxPages: 3, maxDurationMs: 15000 }) });
  assert.strictEqual(res.status, 202);
  const body = await res.json();
  assert.strictEqual(body.started, true);
  // Wait for the async crawl to actually finish before the process exits, so it
  // doesn't leak into a later test's lock-status assertion.
  for (let i = 0; i < 100; i++) {
    const status = await fetch(`${BASE}/api/seo/crawl/status`, { headers: auth });
    const lock = await status.json();
    if (!lock.running) break;
    await new Promise((r) => setTimeout(r, 100));
  }
});

test('POST /api/seo/crawl/cancel with an unknown crawlRunId returns 404', async () => {
  const res = await fetch(`${BASE}/api/seo/crawl/cancel`, { method: 'POST', headers: auth, body: JSON.stringify({ crawlRunId: 999999 }) });
  assert.strictEqual(res.status, 404);
});
