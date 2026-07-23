// Redirects manager — core resolver + write-time safety guards, plus CSV
// import/apply/rollback and internal-link migration jobs (ported from
// HEIGHTSASTRO/src/lib/db/redirects.js, read in full 2026-07-23 — Heights'
// previewRedirectCsvImport/createRedirectImportJob/applyRedirectImportJob/
// rollbackRedirectImportJob/extractInternalHrefs/rewriteHref/
// findStaleInternalLinks/createLinkMigrationJob/applyLinkMigrationJob/
// rollbackLinkMigrationJob sections below the "CSV import/export (SEO-0410)"
// and "Internal-link migration update (SEO-0412)" header comments).
//
// Everything above this comment (RESERVED_PREFIXES through the original
// module.exports) is BLVD's PRE-EXISTING resolver/validator — confirmed by
// reading this whole file before editing, per this task's explicit instruction
// not to touch the existing resolver. Only new functions are appended below.
// This file's existing conventions are followed exactly for the new code:
// function(payload, db) / function(id, db, actor) argument order, errors
// thrown as `Object.assign(new Error(message), { status })` (not Heights'
// `{ code }` shape), INTEGER AUTOINCREMENT ids via lastInsertRowid (not
// Heights' crypto.randomUUID()), CommonJS.
//
// Two new tables are required (redirect_import_jobs, link_migration_jobs) that
// do not yet exist in backend/lib/seo-schema.js (the coordinator's file, not to
// be duplicated/rewritten here). They are created idempotently via
// ensureRedirectMigrationTables(db), called once per db at the top of every
// exported function below that touches them — the same `CREATE TABLE IF NOT
// EXISTS` idempotent pattern backend/init-db.js and backend/lib/seo-schema.js
// already use, just scoped to this module since these two tables are
// redirects-specific, not part of the coordinator's 20-table SEO-ops schema.
//
// Priority on resolve: exact -> prefix (startsWith + '/' boundary) -> regex (bounded test).
const RESERVED_PREFIXES = ['/admin', '/api', '/uploads', '/assets'];
const UNSAFE_SCHEME_RE = /^\s*(javascript|data|vbscript)\s*:/i;
const PROTOCOL_RELATIVE_RE = /^\/\//;
const MAX_REGEX_TEST_LEN = 512;
const MAX_LOOP_HOPS = 25;
const VALID_MATCH_TYPES = new Set(['exact', 'prefix', 'regex']);
const VALID_STATUS_CODES = new Set([301, 302, 307, 308]);

function isReservedPath(p) {
  const norm = String(p || '');
  return RESERVED_PREFIXES.some((prefix) => norm === prefix || norm.startsWith(`${prefix}/`));
}

// For regex-mode fromPath, the value is a pattern, not a literal path — "starts with /"
// doesn't apply (e.g. ^/old-.*$ starts with the anchor ^). Reservation is checked by
// testing the pattern against representative reserved-prefix probes instead.
function isReservedByRegex(pattern) {
  try {
    const re = new RegExp(pattern);
    return RESERVED_PREFIXES.some((prefix) => re.test(prefix) || re.test(`${prefix}/probe`));
  } catch (_e) {
    return false; // invalid regex is caught separately by isValidRegexPattern
  }
}

function isUnsafeTarget(to) {
  const trimmed = String(to || '').trim();
  if (!trimmed) return true;
  if (UNSAFE_SCHEME_RE.test(trimmed)) return true;
  if (PROTOCOL_RELATIVE_RE.test(trimmed)) return true;
  return false;
}

// Heuristic ReDoS scan: flags nested quantifiers like (a+)+ or (a*)* which are the
// classic catastrophic-backtracking shape. Not a full static analyzer — a bounded
// gate against the obvious cases, paired with the MAX_REGEX_TEST_LEN cap at match time.
const NESTED_QUANTIFIER_RE = /\([^()]*[+*][^()]*\)[+*]/;
function looksLikeReDoS(pattern) {
  return NESTED_QUANTIFIER_RE.test(String(pattern || ''));
}

function isValidRegexPattern(pattern) {
  if (looksLikeReDoS(pattern)) return false;
  try {
    // eslint-disable-next-line no-new
    new RegExp(pattern);
    return true;
  } catch (_e) {
    return false;
  }
}

// Validates + normalizes a redirect payload. Throws a shaped error { status, message } on failure.
function validateRedirectPayload(body, db, excludeId) {
  const fromPath = String(body.fromPath || '').trim();
  const toPath = String(body.toPath || '').trim();
  const matchType = VALID_MATCH_TYPES.has(body.matchType) ? body.matchType : 'exact';
  const statusCode = VALID_STATUS_CODES.has(Number(body.statusCode)) ? Number(body.statusCode) : 301;
  const notes = typeof body.notes === 'string' ? body.notes.slice(0, 1000) : '';
  const isActive = body.isActive === undefined ? 1 : (body.isActive ? 1 : 0);

  if (!fromPath) {
    const err = new Error('fromPath is required');
    err.status = 400;
    throw err;
  }
  if (matchType === 'regex') {
    if (!isValidRegexPattern(fromPath)) {
      const err = new Error('fromPath regex is invalid or looks like a catastrophic-backtracking (ReDoS) pattern');
      err.status = 400;
      throw err;
    }
    if (isReservedByRegex(fromPath)) {
      const err = new Error('fromPath regex would match a reserved prefix (admin/api/uploads/assets)');
      err.status = 400;
      throw err;
    }
  } else {
    // exact / prefix: fromPath is a literal path, not a pattern.
    if (!fromPath.startsWith('/')) {
      const err = new Error('fromPath is required and must start with /');
      err.status = 400;
      throw err;
    }
    if (isReservedPath(fromPath)) {
      const err = new Error(`fromPath "${fromPath}" is reserved (admin/api/uploads/assets)`);
      err.status = 400;
      throw err;
    }
  }
  if (!toPath) {
    const err = new Error('toPath is required');
    err.status = 400;
    throw err;
  }
  if (isUnsafeTarget(toPath)) {
    const err = new Error('toPath uses an unsafe scheme or protocol-relative URL');
    err.status = 400;
    throw err;
  }

  // Write-time loop guard: walk the chain starting at toPath (following only exact
  // redirects, the deterministic case) and reject if it ever leads back to fromPath.
  if (toPath.startsWith('/') && !isUnsafeTarget(toPath)) {
    let cursor = toPath;
    const seen = new Set([fromPath]);
    for (let hop = 0; hop < MAX_LOOP_HOPS; hop += 1) {
      const next = db.prepare('SELECT toPath FROM redirects WHERE fromPath = ? AND matchType = ? AND isActive = 1 AND id != ?')
        .get(cursor, 'exact', excludeId || -1);
      if (!next) break;
      if (seen.has(next.toPath) || next.toPath === fromPath) {
        const err = new Error(`Creating this redirect would close a loop (${fromPath} -> ... -> ${fromPath})`);
        err.status = 400;
        throw err;
      }
      seen.add(next.toPath);
      cursor = next.toPath;
    }
  }

  return { fromPath, toPath, matchType, statusCode, notes, isActive };
}

// Resolves a request path to a redirect row, or null. Priority: exact -> prefix -> regex.
function getActiveRedirectForPath(db, requestPath) {
  if (!requestPath || typeof requestPath !== 'string') return null;

  const exact = db.prepare('SELECT * FROM redirects WHERE fromPath = ? AND matchType = ? AND isActive = 1').get(requestPath, 'exact');
  if (exact) return exact;

  const prefixes = db.prepare("SELECT * FROM redirects WHERE matchType = 'prefix' AND isActive = 1").all();
  for (const row of prefixes) {
    const prefix = row.fromPath;
    if (requestPath === prefix || requestPath.startsWith(`${prefix}/`)) return row;
  }

  if (requestPath.length <= MAX_REGEX_TEST_LEN) {
    const regexes = db.prepare("SELECT * FROM redirects WHERE matchType = 'regex' AND isActive = 1").all();
    for (const row of regexes) {
      try {
        const re = new RegExp(row.fromPath);
        if (re.test(requestPath)) return row;
      } catch (_e) {
        // Invalid regex saved by some other path — skip rather than 500.
      }
    }
  }

  return null;
}

function recordHit(db, id) {
  try {
    db.prepare("UPDATE redirects SET hitCount = hitCount + 1, lastHitAt = datetime('now') WHERE id = ?").run(id);
  } catch (err) {
    console.warn('recordHit failed:', err.message || err);
  }
}

// ---------------------------------------------------------------------------
// CSV import/export
// ---------------------------------------------------------------------------

function ensureRedirectMigrationTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS redirect_import_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      status TEXT NOT NULL,
      previewJson TEXT NOT NULL,
      resultJson TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      createdBy TEXT,
      appliedAt TEXT,
      appliedBy TEXT,
      rolledBackAt TEXT,
      rolledBackBy TEXT
    );
    CREATE TABLE IF NOT EXISTS link_migration_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      status TEXT NOT NULL,
      previewJson TEXT NOT NULL,
      resultJson TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      createdBy TEXT,
      appliedAt TEXT,
      appliedBy TEXT,
      rolledBackAt TEXT,
      rolledBackBy TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_redirect_import_jobs_created ON redirect_import_jobs(createdAt DESC);
    CREATE INDEX IF NOT EXISTS idx_link_migration_jobs_created ON link_migration_jobs(createdAt DESC);
  `);
}

function actorLabel(actor = {}) {
  return actor.username || actor.email || actor.id || 'admin';
}

function parseJson(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

// Full export column set. On import, only fromPath/toPath/statusCode/matchType/
// notes are ever read back out of a row — isActive/hitCount/lastHitAt/
// createdAt/updatedAt are export-only audit context. Importing a redirect
// always creates a fresh, active row through the same INSERT shape the
// existing POST /api/redirects route uses (via applyRedirectImportJob below).
const CSV_COLUMNS = ['fromPath', 'toPath', 'statusCode', 'matchType', 'notes', 'isActive', 'hitCount', 'lastHitAt', 'createdAt', 'updatedAt'];

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Render every redirect (active + inactive, so an export is a full backup) as CSV.
 * @param {import('better-sqlite3').Database} db
 * @returns {string}
 */
function exportRedirectsToCsv(db) {
  const rows = db.prepare('SELECT * FROM redirects ORDER BY createdAt DESC').all();
  const header = CSV_COLUMNS.join(',');
  const body = rows.map((row) => CSV_COLUMNS.map((column) => csvCell(row[column])).join(',')).join('\n');
  return `${header}\n${body}${rows.length ? '\n' : ''}`;
}

/**
 * Minimal RFC 4180 CSV parser (no external dependency — this project's rule
 * against adding packages without consent). Handles quoted fields, escaped
 * `""`, and both \n and \r\n line endings.
 * @param {string} text
 * @returns {Record<string, string>[]}
 */
function parseCsv(text) {
  if (typeof text !== 'string' || text.trim() === '') return [];
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;
  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else { inQuotes = false; }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') { inQuotes = true; continue; }
    if (char === ',') { pushField(); continue; }
    if (char === '\r') { continue; }
    if (char === '\n') { pushRow(); continue; }
    field += char;
  }
  if (field !== '' || row.length) pushRow();

  const cleaned = rows.filter((r) => !(r.length === 1 && r[0] === ''));
  if (!cleaned.length) return [];
  const header = cleaned[0].map((h) => h.trim());
  return cleaned.slice(1).map((cells) => {
    const record = {};
    header.forEach((key, index) => { record[key] = cells[index] ?? ''; });
    return record;
  });
}

/**
 * Validate every row of a parsed CSV import through the exact same
 * validateRedirectPayload() path the real POST /api/redirects route uses — no
 * bypass for bulk import. Rows are checked against the CURRENT database state
 * plus every row already accepted earlier in this same preview (so a file
 * can't smuggle in an internal loop or duplicate between two of its own rows),
 * but nothing is written yet.
 * @param {Record<string, string>[]} records - Parsed CSV rows (see parseCsv).
 * @param {import('better-sqlite3').Database} db
 * @returns {{index: number, fromPath: string, toPath: string, statusCode: number, matchType: string, notes: string|null, valid: boolean, errors: string[]}[]}
 */
function previewRedirectCsvImport(records, db) {
  if (!Array.isArray(records)) {
    const err = new Error('CSV import input must be an array of rows.');
    err.status = 400;
    throw err;
  }
  if (records.length > 1000) {
    const err = new Error('CSV imports are limited to 1000 rows at a time.');
    err.status = 400;
    throw err;
  }

  // Simulate the DB gaining each valid row as we go, so within-file loop/
  // collision detection works without ever touching the real table.
  // validateRedirectPayload reads live from the DB, so we insert accepted rows
  // into a REAL transaction that we roll back at the end — the only way to
  // reuse that exact validation logic (including its loop-walk) without
  // duplicating or bypassing it for a "preview" mode.
  const results = [];
  const rollback = db.transaction(() => {
    records.forEach((raw, index) => {
      const errors = [];
      const fromPathRaw = String(raw.fromPath ?? '').trim();
      const toPathRaw = String(raw.toPath ?? '').trim();
      const statusCodeRaw = String(raw.statusCode ?? '301').trim();
      const matchTypeRaw = String(raw.matchType ?? 'exact').trim().toLowerCase() || 'exact';
      const notesRaw = String(raw.notes ?? '').trim() || null;

      let valid = true;
      let payload = null;
      try {
        payload = validateRedirectPayload({ fromPath: fromPathRaw, toPath: toPathRaw, statusCode: Number(statusCodeRaw), matchType: matchTypeRaw, notes: notesRaw }, db);
      } catch (error) {
        errors.push(error?.message || 'Validation failed.');
        valid = false;
      }

      const fromPath = payload ? payload.fromPath : fromPathRaw;
      const toPath = payload ? payload.toPath : toPathRaw;
      const statusCode = payload ? payload.statusCode : (VALID_STATUS_CODES.has(Number(statusCodeRaw)) ? Number(statusCodeRaw) : 301);
      const matchType = payload ? payload.matchType : (VALID_MATCH_TYPES.has(matchTypeRaw) ? matchTypeRaw : 'exact');
      const notes = payload ? payload.notes : notesRaw;

      results.push({ index, fromPath, toPath, statusCode, matchType, notes, valid, errors });

      // Only insert accepted rows into the transactional scratch state so
      // later rows in the same file are validated against them
      // (duplicate-within-file, loop-through-a-row-above-it, etc).
      if (valid) {
        const now = new Date().toISOString();
        db.prepare(`
          INSERT INTO redirects (fromPath, toPath, statusCode, matchType, isActive, notes, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, 1, ?, ?, ?)
        `).run(fromPath, toPath, statusCode, matchType, notes, now, now);
      }
    });
    // Force a rollback unconditionally — this transaction exists only to let
    // validateRedirectPayload see "what the DB would look like" mid-file;
    // nothing from a preview is ever meant to persist.
    throw { __previewRollback: true };
  });

  try {
    rollback();
  } catch (error) {
    if (!error || error.__previewRollback !== true) throw error;
  }

  return results;
}

/**
 * Save a CSV import preview as a job row (mirrors seo_bulk_jobs' shape in
 * backend/lib/seo-resources.js), so an apply can be authorized against the
 * exact preview an admin saw, and a rollback can later undo exactly what that
 * apply did.
 * @param {ReturnType<typeof previewRedirectCsvImport>} preview
 * @param {import('better-sqlite3').Database} db
 * @param {{id?: string, username?: string, email?: string}} [actor]
 */
function createRedirectImportJob(preview, db, actor = {}) {
  ensureRedirectMigrationTables(db);
  const now = new Date().toISOString();
  const info = db.prepare(`
    INSERT INTO redirect_import_jobs (status, previewJson, createdAt, createdBy)
    VALUES ('preview', ?, ?, ?)
  `).run(JSON.stringify(preview), now, actorLabel(actor));
  return getRedirectImportJob(info.lastInsertRowid, db);
}

/**
 * @param {number|string} id
 * @param {import('better-sqlite3').Database} db
 */
function getRedirectImportJob(id, db) {
  ensureRedirectMigrationTables(db);
  const row = db.prepare('SELECT * FROM redirect_import_jobs WHERE id = ?').get(id);
  if (!row) return null;
  return { ...row, preview: parseJson(row.previewJson, []), result: parseJson(row.resultJson, null) };
}

function listRedirectImportJobs(db, limit = 25) {
  ensureRedirectMigrationTables(db);
  return db.prepare('SELECT * FROM redirect_import_jobs ORDER BY createdAt DESC LIMIT ?')
    .all(Math.max(1, Math.min(100, Number(limit) || 25)))
    .map((row) => ({ ...row, preview: parseJson(row.previewJson, []), result: parseJson(row.resultJson, null) }));
}

/**
 * Apply a saved import job atomically: every previewed row must have been
 * valid, and either every row is created or none are (a single transaction).
 * Re-validates each row through validateRedirectPayload() again at apply time
 * (not just trusting the earlier preview) so nothing changed about the live
 * redirect table between preview and apply can silently create an unsafe row.
 * @param {number|string} id
 * @param {import('better-sqlite3').Database} db
 * @param {{id?: string, username?: string, email?: string}} [actor]
 */
function applyRedirectImportJob(id, db, actor = {}) {
  const job = getRedirectImportJob(id, db);
  if (!job || job.status !== 'preview') { const e = new Error('Pending redirect import preview was not found.'); e.status = 404; throw e; }
  if (!job.preview.length) { const e = new Error('This import has no rows to apply.'); e.status = 400; throw e; }
  if (job.preview.some((row) => !row.valid)) { const e = new Error('Every row must pass preview validation before apply. Re-run the preview after fixing the flagged rows.'); e.status = 400; throw e; }

  const now = new Date().toISOString();
  const apply = db.transaction(() => {
    const created = [];
    for (const row of job.preview) {
      const payload = validateRedirectPayload({ fromPath: row.fromPath, toPath: row.toPath, statusCode: row.statusCode, matchType: row.matchType, notes: row.notes }, db);
      const info = db.prepare(`
        INSERT INTO redirects (fromPath, toPath, statusCode, matchType, isActive, notes, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, 1, ?, ?, ?)
      `).run(payload.fromPath, payload.toPath, payload.statusCode, payload.matchType, payload.notes, now, now);
      created.push(db.prepare('SELECT * FROM redirects WHERE id = ?').get(info.lastInsertRowid));
    }
    db.prepare("UPDATE redirect_import_jobs SET status = 'applied', resultJson = ?, appliedAt = ?, appliedBy = ? WHERE id = ?")
      .run(JSON.stringify(created), now, actorLabel(actor), id);
    return created;
  });
  const created = apply();
  return { ...getRedirectImportJob(id, db), createdCount: created.length };
}

/**
 * Guarded rollback: deactivate every redirect this job created (soft-delete,
 * matching the existing DELETE .../:id route's semantics elsewhere in
 * server.js — nothing is hard-deleted here, so the rows and their hit history
 * remain inspectable/reversible). Refuses to run twice and refuses to run on a
 * job that was never applied.
 * @param {number|string} id
 * @param {import('better-sqlite3').Database} db
 * @param {{id?: string, username?: string, email?: string}} [actor]
 */
function rollbackRedirectImportJob(id, db, actor = {}) {
  const job = getRedirectImportJob(id, db);
  if (!job || job.status !== 'applied' || !Array.isArray(job.result)) { const e = new Error('Applied redirect import job was not found.'); e.status = 404; throw e; }
  const now = new Date().toISOString();
  const rollback = db.transaction(() => {
    for (const created of job.result) {
      const current = db.prepare('SELECT * FROM redirects WHERE id = ?').get(created.id);
      if (current && current.isActive) {
        db.prepare('UPDATE redirects SET isActive = 0, updatedAt = ? WHERE id = ?').run(now, created.id);
      }
    }
    db.prepare("UPDATE redirect_import_jobs SET status = 'rolled_back', rolledBackAt = ?, rolledBackBy = ? WHERE id = ?")
      .run(now, actorLabel(actor), id);
  });
  rollback();
  return getRedirectImportJob(id, db);
}

// ---------------------------------------------------------------------------
// Internal-link migration update
// ---------------------------------------------------------------------------
// Honest scope, stated explicitly: BLVD has no active URL migration and no "old
// site" URL inventory exists anywhere in this codebase. What IS real and
// detectable without any active migration or fabricated data: this site's own
// accumulated redirects already create a genuine, unfabricated "stale internal
// link" case whenever a page's own HTML content still links to a path that has
// since gained an active redirect elsewhere.
//
// Real internal links in BLVD's admin-editable content live in exactly one
// place: `pages.content_sections` — but only sections with `type: 'html'`
// (field `body`) can contain a real `<a href>`; `type: 'text'` sections are
// rendered as a plain `<p>{s.body}</p>` (confirmed by reading
// src/pages/[slug].astro:73-79 in full), never `set:html`, so a raw href string
// in a text section is inert, non-clickable text, not a real link. `faq_items`
// (question/answer pairs) is NOT included: confirmed by reading
// src/pages/[slug].astro:41-52 in full — faqItems.answer is only ever rendered
// as a plain-text FAQPage JSON-LD `text` property, never as HTML with
// clickable links anywhere in this codebase (same precedent Heights' own
// db/redirects.js documents for its own faqItems field) — so there is no real
// href to find or fix there. Event records (backend/init-db.js's events table)
// have no free-form HTML field with links at all, so they are correctly out of
// scope, not silently skipped.

const HREF_PATTERN = /href\s*=\s*(["'])(\/[^"'#?>\s][^"'>]*?)\1/gi;

/**
 * Extract every same-site internal link href from one HTML string, in the
 * exact order they appear, alongside the raw path (query/hash stripped only
 * for the comparison used to detect a stale link — the ORIGINAL href text is
 * preserved unchanged in `rawHref`). Only matches hrefs that start with "/"
 * (already same-site relative) — an absolute `https://blvdpark.com/...` href
 * is deliberately NOT matched here (a distinct, larger scope this port does
 * not claim), matching Heights' own disclosed limitation exactly.
 * @param {string} html
 * @returns {{rawHref: string, path: string}[]}
 */
function extractInternalHrefs(html) {
  const text = String(html || '');
  const found = [];
  let match;
  HREF_PATTERN.lastIndex = 0;
  while ((match = HREF_PATTERN.exec(text))) {
    const rawHref = match[2];
    const path = rawHref.split('?')[0].split('#')[0].replace(/\/{2,}/g, '/').replace(/(.)\/+$/, '$1') || '/';
    found.push({ rawHref, path });
  }
  return found;
}

/**
 * Rewrite every occurrence of an exact `href="oldRawHref"`/`href='oldRawHref'`
 * to `newHref`, preserving the original quote style and everything else in the
 * HTML untouched. Uses the exact matched rawHref text (not just the path) so a
 * link that carried a query string or hash is replaced precisely.
 * @param {string} html
 * @param {string} oldRawHref
 * @param {string} newHref
 * @returns {string}
 */
function rewriteHref(html, oldRawHref, newHref) {
  const text = String(html || '');
  const escaped = oldRawHref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(href\\s*=\\s*)(["'])${escaped}\\2`, 'gi');
  return text.replace(pattern, (_full, prefix, quote) => `${prefix}${quote}${newHref}${quote}`);
}

/**
 * Scan every page's content_sections for a stale internal link — an href whose
 * path resolves (via the real getActiveRedirectForPath resolver) to an active
 * redirect elsewhere in the site. Read-only: builds a preview only, writes
 * nothing. Each finding carries the exact section index so the apply step
 * below can target precisely the same href occurrence it showed the admin.
 * @param {import('better-sqlite3').Database} db
 * @returns {{
 *   generatedAt: string,
 *   pagesScanned: number,
 *   findings: Array<{pageId: number, pageSlug: string, pageTitle: string|null, sectionIndex: number, rawHref: string, currentPath: string, redirectTarget: string, redirectStatusCode: number}>
 * }}
 */
function findStaleInternalLinks(db) {
  const pages = db.prepare('SELECT id, slug, title, content_sections FROM pages').all();
  const findings = [];
  for (const page of pages) {
    let sections;
    try { sections = JSON.parse(page.content_sections || '[]'); } catch { continue; }
    if (!Array.isArray(sections)) continue;
    sections.forEach((section, sectionIndex) => {
      if (!section || typeof section !== 'object' || section.type !== 'html') return;
      const html = section.body;
      if (typeof html !== 'string' || !html) return;
      for (const { rawHref, path } of extractInternalHrefs(html)) {
        const redirect = getActiveRedirectForPath(db, path);
        if (!redirect || !String(redirect.toPath || '').startsWith('/')) continue; // only same-site targets are safely auto-rewritable
        if (redirect.toPath === path) continue; // defensive: validateRedirectPayload already forbids this, but never rewrite a link to itself
        findings.push({
          pageId: page.id,
          pageSlug: page.slug,
          pageTitle: page.title || null,
          sectionIndex,
          rawHref,
          currentPath: path,
          redirectTarget: redirect.toPath,
          redirectStatusCode: redirect.statusCode,
        });
      }
    });
  }
  return { generatedAt: new Date().toISOString(), pagesScanned: pages.length, findings };
}

/**
 * Save a findStaleInternalLinks() preview as a job row, exactly mirroring
 * createRedirectImportJob()'s shape/purpose above.
 * @param {ReturnType<typeof findStaleInternalLinks>} preview
 * @param {import('better-sqlite3').Database} db
 * @param {{id?: string, username?: string, email?: string}} [actor]
 */
function createLinkMigrationJob(preview, db, actor = {}) {
  ensureRedirectMigrationTables(db);
  const now = new Date().toISOString();
  const info = db.prepare(`
    INSERT INTO link_migration_jobs (status, previewJson, createdAt, createdBy)
    VALUES ('preview', ?, ?, ?)
  `).run(JSON.stringify(preview), now, actorLabel(actor));
  return getLinkMigrationJob(info.lastInsertRowid, db);
}

/**
 * @param {number|string} id
 * @param {import('better-sqlite3').Database} db
 */
function getLinkMigrationJob(id, db) {
  ensureRedirectMigrationTables(db);
  const row = db.prepare('SELECT * FROM link_migration_jobs WHERE id = ?').get(id);
  if (!row) return null;
  return { ...row, preview: parseJson(row.previewJson, null), result: parseJson(row.resultJson, null) };
}

function listLinkMigrationJobs(db, limit = 25) {
  ensureRedirectMigrationTables(db);
  return db.prepare('SELECT * FROM link_migration_jobs ORDER BY createdAt DESC LIMIT ?')
    .all(Math.max(1, Math.min(100, Number(limit) || 25)))
    .map((row) => ({ ...row, preview: parseJson(row.previewJson, null), result: parseJson(row.resultJson, null) }));
}

/**
 * Apply a saved link-migration preview atomically. Re-resolves every finding's
 * redirect AGAIN at apply time (not just trusting the earlier preview) — the
 * live redirect table could have changed since the preview was generated.
 * Per-page: reads the CURRENT content_sections fresh (not the preview's stale
 * copy), applies every rewrite for that page's findings via rewriteHref(), and
 * writes back with a direct UPDATE on pages.content_sections (this codebase's
 * pages table has no separate updatePage() library function — page writes are
 * inline in backend/server.js's PUT /api/pages/:id route, confirmed by reading
 * that route in full — so this uses the identical column the admin edit route
 * writes). The full before/after content_sections per touched page is captured
 * in the job's resultJson so rollback can restore it exactly.
 * @param {number|string} id
 * @param {import('better-sqlite3').Database} db
 * @param {{id?: string, username?: string, email?: string}} [actor]
 */
function applyLinkMigrationJob(id, db, actor = {}) {
  const job = getLinkMigrationJob(id, db);
  if (!job || job.status !== 'preview') { const e = new Error('Pending link migration preview was not found.'); e.status = 404; throw e; }
  const findings = job.preview?.findings;
  if (!Array.isArray(findings) || !findings.length) { const e = new Error('This migration preview has no stale links to apply.'); e.status = 400; throw e; }

  const byPage = new Map();
  for (const finding of findings) {
    if (!byPage.has(finding.pageId)) byPage.set(finding.pageId, []);
    byPage.get(finding.pageId).push(finding);
  }

  const now = new Date().toISOString();
  const touchedPages = [];
  const apply = db.transaction(() => {
    for (const [pageId, pageFindings] of byPage) {
      const page = db.prepare('SELECT * FROM pages WHERE id = ?').get(pageId);
      if (!page) { const e = new Error(`Page id ${pageId} no longer exists; re-run the preview.`); e.status = 409; throw e; }
      let sections;
      try { sections = JSON.parse(page.content_sections || '[]'); } catch { sections = []; }
      if (!Array.isArray(sections)) { const e = new Error(`Page "${page.slug}" content_sections is no longer an array; re-run the preview.`); e.status = 409; throw e; }
      const beforeSections = JSON.parse(JSON.stringify(sections));
      let changedCount = 0;
      const appliedFindings = [];
      for (const finding of pageFindings) {
        const section = sections[finding.sectionIndex];
        if (!section || section.type !== 'html') {
          const e = new Error(`Page "${page.slug}" section ${finding.sectionIndex} changed shape since preview; re-run the preview.`);
          e.status = 409;
          throw e;
        }
        const html = section.body;
        if (typeof html !== 'string') continue;
        // Re-resolve the redirect NOW, not the preview's stale value.
        const liveRedirect = getActiveRedirectForPath(db, finding.currentPath);
        if (!liveRedirect || !String(liveRedirect.toPath || '').startsWith('/')) continue; // no longer a live, safe same-site redirect; skip this one honestly
        const rewritten = rewriteHref(html, finding.rawHref, liveRedirect.toPath);
        if (rewritten === html) continue; // href text no longer present (already changed); nothing to do
        section.body = rewritten;
        changedCount += 1;
        appliedFindings.push({ ...finding, redirectTarget: liveRedirect.toPath, redirectStatusCode: liveRedirect.statusCode });
      }
      if (!changedCount) continue;
      db.prepare('UPDATE pages SET content_sections = ?, updated_at = CURRENT_TIMESTAMP, updated_by = ? WHERE id = ?')
        .run(JSON.stringify(sections), actorLabel(actor), pageId);
      touchedPages.push({ pageId, pageSlug: page.slug, beforeSections, afterSections: sections, findings: appliedFindings });
    }
    if (!touchedPages.length) { const e = new Error("No stale links were still applicable — every finding's redirect changed or the link text no longer matches. Re-run the preview."); e.status = 409; throw e; }
    db.prepare("UPDATE link_migration_jobs SET status = 'applied', resultJson = ?, appliedAt = ?, appliedBy = ? WHERE id = ?")
      .run(JSON.stringify(touchedPages), now, actorLabel(actor), id);
    return touchedPages;
  });
  const result = apply();
  return { ...getLinkMigrationJob(id, db), pagesChangedCount: result.length };
}

/**
 * Guarded rollback: restore every touched page's content_sections to the exact
 * `beforeSections` snapshot captured at apply time. Refuses to run twice and
 * refuses to run on a job that was never applied.
 * @param {number|string} id
 * @param {import('better-sqlite3').Database} db
 * @param {{id?: string, username?: string, email?: string}} [actor]
 */
function rollbackLinkMigrationJob(id, db, actor = {}) {
  const job = getLinkMigrationJob(id, db);
  if (!job || job.status !== 'applied' || !Array.isArray(job.result)) { const e = new Error('Applied link migration job was not found.'); e.status = 404; throw e; }
  const now = new Date().toISOString();
  const rollback = db.transaction(() => {
    for (const touched of job.result) {
      const page = db.prepare('SELECT id FROM pages WHERE id = ?').get(touched.pageId);
      if (!page) continue; // page was deleted since apply; nothing to restore it onto
      db.prepare('UPDATE pages SET content_sections = ?, updated_at = CURRENT_TIMESTAMP, updated_by = ? WHERE id = ?')
        .run(JSON.stringify(touched.beforeSections), actorLabel(actor), touched.pageId);
    }
    db.prepare("UPDATE link_migration_jobs SET status = 'rolled_back', rolledBackAt = ?, rolledBackBy = ? WHERE id = ?")
      .run(now, actorLabel(actor), id);
  });
  rollback();
  return getLinkMigrationJob(id, db);
}

module.exports = {
  RESERVED_PREFIXES,
  isReservedPath,
  isReservedByRegex,
  isUnsafeTarget,
  looksLikeReDoS,
  isValidRegexPattern,
  validateRedirectPayload,
  getActiveRedirectForPath,
  recordHit,
  VALID_STATUS_CODES,
  // CSV import/export
  ensureRedirectMigrationTables,
  exportRedirectsToCsv,
  parseCsv,
  previewRedirectCsvImport,
  createRedirectImportJob,
  getRedirectImportJob,
  listRedirectImportJobs,
  applyRedirectImportJob,
  rollbackRedirectImportJob,
  // Internal-link migration
  extractInternalHrefs,
  rewriteHref,
  findStaleInternalLinks,
  createLinkMigrationJob,
  getLinkMigrationJob,
  listLinkMigrationJobs,
  applyLinkMigrationJob,
  rollbackLinkMigrationJob,
};
