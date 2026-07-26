// Dependency-free XML well-formedness checker + persisted validation history.
// Ported from HEIGHTSASTRO/src/lib/sitemap-validation.js (read in full
// 2026-07-23) to BLVD's Express/SQLite backend. Adapted to this backend's real
// conventions (confirmed by reading backend/lib/seo-resources.js in full):
// function(db, ...) for the DB-touching functions (no module-level
// connectToDatabase() singleton), INTEGER AUTOINCREMENT ids
// (seo_sitemap_checks.id, seo_sitemap_check_files.id — already defined this
// way in backend/lib/seo-schema.js), CommonJS.
//
// No XML parser dependency exists in this codebase and adding one is out of
// this session's scope per the project's "no new npm dependencies" hard rule.
// This module implements a dependency-free, sufficient well-formedness check:
// balanced open/close tags, a real XML declaration, and — for urlset sitemaps
// — that every <loc> value is a syntactically valid absolute URL. This is NOT
// full XML Schema validation against the sitemaps.org XSD — that limitation is
// disclosed here, not silently implied to be more.
//
const SITEMAP_FILES = [
  { key: 'sitemap.xml', path: '/sitemap.xml', kind: 'sitemapindex' },
  { key: 'sitemap-pages.xml', path: '/sitemap-pages.xml', kind: 'urlset' },
  { key: 'sitemap-images.xml', path: '/sitemap-images.xml', kind: 'urlset' },
  { key: 'sitemap-videos.xml', path: '/sitemap-videos.xml', kind: 'urlset' },
];

async function fetchWithTimeout(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

// Extract every <loc>...</loc> text content. Returns the raw text between the
// tags, unescaped only for the 5 predefined XML entities BLVD's own sitemap
// generator (src/pages/sitemap.xml.ts) could ever produce.
function extractLocValues(xml) {
  const matches = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)];
  return matches.map((match) => match[1]
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
}

// Balanced-tag structural check: walks every opening/closing/self-closing tag
// and confirms a matching close for every open, in the right order. Catches
// truncation and tag-mismatch corruption. Does not validate attribute grammar
// or full XML Schema — see module header for that disclosed limitation.
function checkBalancedTags(xml) {
  const tagPattern = /<\/?([a-zA-Z][\w:-]*)\b[^>]*?(\/?)>/g;
  const stack = [];
  let match;
  while ((match = tagPattern.exec(xml)) !== null) {
    const [full, name, selfClosing] = match;
    if (full.startsWith('<?') || full.startsWith('<!')) continue;
    if (selfClosing === '/') continue;
    if (full.startsWith('</')) {
      const expected = stack.pop();
      if (expected !== name) {
        return { balanced: false, reason: expected ? `Expected closing </${expected}> but found </${name}>` : `Unexpected closing </${name}> with no matching open tag` };
      }
    } else {
      stack.push(name);
    }
  }
  if (stack.length) return { balanced: false, reason: `Unclosed tag(s): ${stack.join(', ')} — response may have been truncated` };
  return { balanced: true, reason: null };
}

// Validate a single already-fetched sitemap document's XML body. Pure function
// — no I/O — so it is directly unit-testable against both real and
// deliberately corrupted fixtures.
function validateSitemapXml(xml, kind) {
  const errors = [];
  const trimmed = String(xml || '').trim();

  if (!trimmed) {
    return { wellFormed: false, urlCount: 0, invalidUrls: [], errors: ['Response body was empty.'] };
  }
  if (!trimmed.startsWith('<?xml')) {
    errors.push('Missing XML declaration (expected the document to start with <?xml ...?>).');
  }
  const rootTag = kind === 'sitemapindex' ? 'sitemapindex' : 'urlset';
  if (!trimmed.includes(`<${rootTag}`)) {
    errors.push(`Missing expected root element <${rootTag}>.`);
  }

  const balance = checkBalancedTags(trimmed);
  if (!balance.balanced) errors.push(balance.reason);

  const locValues = extractLocValues(trimmed);
  const invalidUrls = locValues.filter((value) => {
    try { return !['http:', 'https:'].includes(new URL(value).protocol); }
    catch { return true; }
  });
  if (invalidUrls.length) {
    errors.push(`${invalidUrls.length} <loc> value(s) are not valid absolute http(s) URLs.`);
  }
  if (locValues.length === 0) {
    errors.push(`No <loc> entries found in the ${rootTag}.`);
  }

  return {
    wellFormed: errors.length === 0,
    urlCount: locValues.length,
    invalidUrls,
    errors,
  };
}

// Fetches every real, live sitemap-family URL for the given origin and
// validates each with validateSitemapXml() above. This performs REAL HTTP
// requests against the REAL running site — never a synthetic/fabricated
// result. A network failure for any one file is captured as that file's own
// failed result rather than aborting the whole batch.
async function checkLiveSitemaps(origin) {
  const results = [];
  for (const file of SITEMAP_FILES) {
    const url = new URL(file.path, origin).href;
    try {
      const response = await fetchWithTimeout(url);
      const body = await response.text();
      if (!response.ok) {
        results.push({ key: file.key, url, httpStatus: response.status, wellFormed: false, urlCount: 0, errors: [`HTTP ${response.status} — sitemap did not return 200.`] });
        continue;
      }
      const validation = validateSitemapXml(body, file.kind);
      results.push({ key: file.key, url, httpStatus: response.status, ...validation });
    } catch (err) {
      results.push({ key: file.key, url, httpStatus: null, wellFormed: false, urlCount: 0, errors: [`Request failed: ${err?.message || 'unknown fetch error'}`] });
    }
  }
  return results;
}

function actorLabel(actor = {}) {
  return actor.username || actor.email || actor.id || 'admin';
}

// Runs a REAL "validate sitemap now" check against the site's real configured
// canonical origin (seo_site_settings.canonicalOrigin, matching
// backend/lib/seo-resources.js's SITE_SETTING_COLUMNS, falling back to
// FRONTEND_URL/blvdpark.com — same resolution order backend/server.js's own
// siteUrlBase() uses), stores one seo_sitemap_checks parent row plus one
// seo_sitemap_check_files row per real file fetched, and returns the full
// result. Never fabricates a passing result — a fetch/network failure for any
// file is stored as that file's own failed row, and overallValid is only true
// when every fetched file was well-formed.
async function runSitemapValidation(db, actor = {}) {
  const settingsRow = db.prepare("SELECT canonicalOrigin FROM seo_site_settings WHERE id = 'default'").get();
  const origin = new URL(settingsRow?.canonicalOrigin || process.env.FRONTEND_URL || 'https://blvdpark.com').origin;
  const files = await checkLiveSitemaps(origin);

  const checkedAt = new Date().toISOString();
  const validFileCount = files.filter((file) => file.wellFormed).length;
  const overallValid = files.length > 0 && validFileCount === files.length;

  const transaction = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO seo_sitemap_checks (checkedAt, checkedBy, overallValid, fileCount, validFileCount)
      VALUES (?, ?, ?, ?, ?)
    `).run(checkedAt, actorLabel(actor), overallValid ? 1 : 0, files.length, validFileCount);

    const insertFile = db.prepare(`
      INSERT INTO seo_sitemap_check_files (checkId, sitemapKey, url, httpStatus, wellFormed, urlCount, errorsJson)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const file of files) {
      insertFile.run(
        info.lastInsertRowid, file.key, file.url, file.httpStatus ?? null,
        file.wellFormed ? 1 : 0, file.urlCount || 0, JSON.stringify(file.errors || [])
      );
    }
    return info.lastInsertRowid;
  });
  const checkId = transaction();

  return { id: checkId, checkedAt, overallValid, fileCount: files.length, validFileCount, files };
}

// Real validation history — most recent runs first, each with its per-file
// breakdown attached (never a synthetic/aggregated-only summary).
function listSitemapValidationRuns(db, limit = 20) {
  const runs = db.prepare('SELECT * FROM seo_sitemap_checks ORDER BY checkedAt DESC LIMIT ?').all(limit);
  const filesByCheckStmt = db.prepare('SELECT * FROM seo_sitemap_check_files WHERE checkId = ? ORDER BY sitemapKey');
  return runs.map((run) => ({
    ...run,
    files: filesByCheckStmt.all(run.id).map((file) => ({ ...file, errors: JSON.parse(file.errorsJson || '[]') })),
  }));
}

module.exports = {
  SITEMAP_FILES, validateSitemapXml, checkLiveSitemaps, runSitemapValidation, listSitemapValidationRuns,
};
