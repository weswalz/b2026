// SEO resource registry — core CRUD, revisions/rollback, bulk preview/apply/
// rollback, citations, link inventory. Ported from HEIGHTSASTRO/src/lib/db/seo.js
// (read in full 2026-07-23) to BLVD's Express/SQLite backend. Adapted to this
// backend's real conventions (confirmed by reading backend/lib/redirects.js
// and backend/server.js in full before writing this):
//   - camelCase columns (matches BLVD's own pre-existing tables, not a
//     translation choice — BLVD already IS camelCase)
//   - INTEGER AUTOINCREMENT ids (matches events/pages/redirects/users)
//   - Errors are thrown as `Object.assign(new Error(message), { status })`,
//     the exact shape backend/lib/redirects.js's validateRedirectPayload()
//     already established and server.js's route handlers already catch
//     (`if (err.status) return res.status(err.status).json({ error: err.message })`)
//   - CommonJS (require/module.exports), matching every other backend/lib/*.js

function normalizePath(value) {
  let p = String(value || '/').trim();
  if (!p.startsWith('/')) p = `/${p}`;
  p = p.replace(/\/{2,}/g, '/');
  if (p.length > 1) p = p.replace(/\/+$/, '');
  return p;
}

function throwErr(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

const JSON_FIELDS = ['googlebotDirectives', 'dataNosnippetSelectors', 'hreflangJson', 'schemaJson', 'taxonomyJson', 'schemaFieldOverridesJson'];
const JSON_FIELD_DEFAULTS = { schemaJson: null, schemaFieldOverridesJson: {} };
const BOOLEAN_FIELDS = ['nosnippet', 'includeSitemap', 'includeSiteSearch', 'includeFeeds', 'includeNavigation', 'includeRecommendations', 'isActive'];

const SEO_RESOURCE_COLUMNS = new Set([
  'resourceType', 'resourceId', 'path', 'parentPath', 'taxonomyJson', 'template',
  'seoTitle', 'seoDescription',
  'httpStatus', 'indexState', 'followState',
  'googlebotDirectives', 'maxSnippet', 'maxImagePreview', 'maxVideoPreview',
  'nosnippet', 'dataNosnippetSelectors', 'canonicalUrl', 'language', 'hreflangJson',
  'breadcrumbTitle', 'ogTitle', 'ogDescription', 'ogImage', 'ogUrl', 'twitterCard',
  'featuredImage', 'publishedAt', 'modifiedAt', 'expiresAt', 'author', 'reviewer',
  'contentOwner', 'contentIntent', 'audience', 'topic', 'funnelStage',
  'targetQueryNotes', 'includeSitemap', 'includeSiteSearch', 'includeFeeds',
  'includeNavigation', 'includeRecommendations', 'schemaType', 'schemaJson',
  'schemaFieldOverridesJson', 'factCheckStatus', 'legalApprovalRequired',
  'legalApprovalStatus', 'lastReviewedAt', 'nextReviewAt', 'isActive',
  'updatedAt', 'updatedBy',
]);

const SITE_SETTING_COLUMNS = new Set([
  'robotsText', 'defaultLanguage', 'canonicalOrigin', 'hostnamePolicy',
  'trailingSlashPolicy', 'lowercasePaths', 'stripTrackingParameters',
  'trackingParameters', 'emergencyNoindex', 'indexNowEnabled', 'updatedAt', 'updatedBy',
]);

function pickAllowedColumns(data, allowedColumns) {
  const picked = {};
  for (const key of Object.keys(data || {})) {
    if (allowedColumns.has(key)) picked[key] = data[key];
  }
  return picked;
}

function parseJson(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function hydrateResource(row) {
  if (!row) return null;
  const hydrated = { ...row };
  for (const field of JSON_FIELDS) {
    const fallback = Object.prototype.hasOwnProperty.call(JSON_FIELD_DEFAULTS, field) ? JSON_FIELD_DEFAULTS[field] : [];
    hydrated[field] = parseJson(row[field], fallback);
  }
  return hydrated;
}

// Google's documented robots meta tag vocabulary —
// https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag
// (same primary source Heights' db/seo.js cites, fetched 2026-07-22 there,
// stable enough not to need re-verification for this port).
const ROBOTS_BARE_DIRECTIVES = new Set([
  'all', 'noindex', 'nofollow', 'none', 'nosnippet', 'indexifembedded',
  'notranslate', 'noimageindex', 'noarchive', 'nocache', 'nositelinkssearchbox',
]);

function isValidMaxValue(value) {
  return Number.isInteger(value) && value >= -1;
}

function validateGooglebotDirective(raw) {
  const value = String(raw || '').trim();
  if (ROBOTS_BARE_DIRECTIVES.has(value)) return;
  const [prefix, ...rest] = value.split(':');
  const argument = rest.join(':');
  if (prefix === 'max-snippet' && isValidMaxValue(Number(argument))) return;
  if (prefix === 'max-image-preview' && ['none', 'standard', 'large'].includes(argument)) return;
  if (prefix === 'max-video-preview' && isValidMaxValue(Number(argument))) return;
  if (prefix === 'unavailable_after' && argument && !Number.isNaN(new Date(argument).getTime())) return;
  throwErr(`"${value}" is not a recognized robots meta tag directive.`);
}

function validateResourceInput(data) {
  const path = normalizePath(data.path);
  if (/\s/.test(path) || path.includes('?') || path.includes('#')) {
    throwErr('SEO resource paths cannot contain spaces, query strings, or fragments.');
  }
  if (![200, 404, 410].includes(Number(data.httpStatus || 200))) {
    throwErr('HTTP status must be 200, 404, or 410.');
  }
  if (!['index', 'noindex'].includes(data.indexState || 'index')) {
    throwErr('Index state must be index or noindex.');
  }
  if (!['follow', 'nofollow'].includes(data.followState || 'follow')) {
    throwErr('Follow state must be follow or nofollow.');
  }
  if (!['none', 'standard', 'large'].includes(data.maxImagePreview || 'large')) {
    throwErr('Image preview must be none, standard, or large.');
  }
  if (data.maxSnippet !== null && data.maxSnippet !== undefined && data.maxSnippet !== '' && !isValidMaxValue(Number(data.maxSnippet))) {
    throwErr('Max snippet must be -1 (unlimited) or a non-negative whole number.');
  }
  if (data.maxVideoPreview !== null && data.maxVideoPreview !== undefined && data.maxVideoPreview !== '' && !isValidMaxValue(Number(data.maxVideoPreview))) {
    throwErr('Max video preview must be -1 (unlimited) or a non-negative whole number.');
  }
  if (Array.isArray(data.googlebotDirectives)) {
    for (const directive of data.googlebotDirectives) validateGooglebotDirective(directive);
  }
  if (data.canonicalUrl) {
    let canonical;
    try { canonical = new URL(data.canonicalUrl); } catch { throwErr('Canonical URL is not a valid URL.'); }
    if (!['http:', 'https:'].includes(canonical.protocol)) throwErr('Canonical URLs must use HTTP or HTTPS.');
  }
  if (data.schemaJson) {
    let parsed;
    try { parsed = typeof data.schemaJson === 'string' ? JSON.parse(data.schemaJson) : data.schemaJson; }
    catch { throwErr('Advanced JSON-LD is not valid JSON.'); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throwErr('Advanced JSON-LD must be a JSON object.');
  }
  return path;
}

function computeDefaultParentPath(path) {
  const normalized = normalizePath(path);
  if (normalized === '/') return null;
  const segments = normalized.split('/').filter(Boolean);
  if (segments.length <= 1) return '/';
  return `/${segments.slice(0, -1).join('/')}`;
}

let inventorySynced = false;

// Discovers every real page/event and gives it a starting seo_resources row.
// BLVD's pages use `slug` (pages table) and events use `slug` too (confirmed
// by reading backend/init-db.js in full — both tables already have a real
// slug column, events.slug added by the B-wave1 SEO parity work).
function syncSeoResourceInventory(db, force = false) {
  if (inventorySynced && !force) return;
  const insert = db.prepare(`
    INSERT OR IGNORE INTO seo_resources (
      resourceType, resourceId, path, parentPath, httpStatus, indexState, followState,
      maxImagePreview, language, includeSitemap, includeSiteSearch, includeFeeds,
      includeNavigation, includeRecommendations, isActive, createdAt, updatedAt, updatedBy
    ) VALUES (?, ?, ?, ?, 200, ?, 'follow', 'large', 'en-US', ?, 1, 1, 1, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'system')
  `);

  const transaction = db.transaction(() => {
    const pages = db.prepare('SELECT id, slug, status FROM pages').all();
    for (const page of pages) {
      if (!page.slug) continue;
      const path = `/${page.slug}`;
      const isPublished = page.status === 'published';
      insert.run('page', String(page.id), path, computeDefaultParentPath(path), 'index', 1, isPublished ? 1 : 0);
    }

    const events = db.prepare("SELECT id, slug, status FROM events WHERE deleted_at IS NULL AND slug IS NOT NULL AND TRIM(slug) != ''").all();
    for (const event of events) {
      const path = `/events/${event.slug}`;
      const active = event.status === 'active';
      insert.run('event', String(event.id), path, computeDefaultParentPath(path), active ? 'index' : 'noindex', active ? 1 : 0, active ? 1 : 0);
    }
  });
  transaction();
  inventorySynced = true;
}

function createSeoResource(db, input, actor = {}) {
  const resourceType = ['page', 'event', 'route', 'asset'].includes(input.resourceType) ? input.resourceType : 'route';
  const resourceId = String(input.resourceId || Date.now()).trim();
  const path = validateResourceInput({ ...input, path: input.path, httpStatus: input.httpStatus || 200 });
  const existing = db.prepare('SELECT id FROM seo_resources WHERE path = ? OR (resourceType = ? AND resourceId = ?)').get(path, resourceType, resourceId);
  if (existing) throwErr('An SEO resource already exists for that path or identifier.', 409);
  const info = db.prepare(`
    INSERT INTO seo_resources (
      resourceType, resourceId, path, httpStatus, indexState, followState,
      maxImagePreview, language, includeSitemap, includeSiteSearch, includeFeeds,
      includeNavigation, includeRecommendations, isActive, createdAt, updatedAt, updatedBy
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)
  `).run(
    resourceType, resourceId, path, Number(input.httpStatus || 200),
    input.indexState || 'index', input.followState || 'follow', input.maxImagePreview || 'large',
    input.language || 'en-US', input.includeSitemap === false ? 0 : 1,
    input.includeSiteSearch === false ? 0 : 1, input.includeFeeds === false ? 0 : 1,
    input.includeNavigation === false ? 0 : 1, input.includeRecommendations === false ? 0 : 1,
    actor.username || actor.email || 'admin'
  );
  return hydrateResource(db.prepare('SELECT * FROM seo_resources WHERE id = ?').get(info.lastInsertRowid));
}

function listSeoResources(db) {
  syncSeoResourceInventory(db, true);
  const rows = db.prepare(`
    SELECT r.*,
      CASE
        WHEN r.resourceType = 'page' THEN (SELECT p.title FROM pages p WHERE p.id = r.resourceId)
        WHEN r.resourceType = 'event' THEN (SELECT e.title FROM events e WHERE e.id = r.resourceId)
        ELSE NULL
      END AS contentTitle
    FROM seo_resources r
    ORDER BY r.path
  `).all();
  return rows.map(hydrateResource);
}

function getSeoResource(db, resourceType, resourceId, force = false) {
  syncSeoResourceInventory(db, force);
  return hydrateResource(db.prepare(`
    SELECT r.*,
      CASE
        WHEN r.resourceType = 'page' THEN (SELECT p.title FROM pages p WHERE p.id = r.resourceId)
        WHEN r.resourceType = 'event' THEN (SELECT e.title FROM events e WHERE e.id = r.resourceId)
        ELSE NULL
      END AS contentTitle
    FROM seo_resources r
    WHERE r.resourceType = ? AND r.resourceId = ?
  `).get(resourceType, String(resourceId)));
}

function getSeoResourceByPath(db, path) {
  syncSeoResourceInventory(db);
  return hydrateResource(db.prepare('SELECT * FROM seo_resources WHERE path = ? AND isActive = 1').get(normalizePath(path)));
}

function saveSeoResource(db, resourceType, resourceId, input, actor = {}) {
  const current = getSeoResource(db, resourceType, resourceId);
  if (!current) throwErr('SEO resource was not found.', 404);

  const data = { ...input };
  delete data.changeSummary;
  data.path = validateResourceInput({ ...current, ...data });
  for (const field of JSON_FIELDS) {
    if (field in data && typeof data[field] !== 'string') {
      data[field] = data[field] === null ? null : JSON.stringify(data[field]);
    }
  }
  for (const field of BOOLEAN_FIELDS) {
    if (field in data) data[field] = data[field] ? 1 : 0;
  }
  data.updatedAt = new Date().toISOString();
  data.updatedBy = actor.username || actor.email || 'admin';

  const allowed = pickAllowedColumns(data, SEO_RESOURCE_COLUMNS);
  const fields = Object.keys(allowed);
  if (!fields.length) return current;

  const revisionNumber = (db.prepare('SELECT COALESCE(MAX(revisionNumber), 0) + 1 AS next FROM seo_revisions WHERE seoResourceId = ?').get(current.id)?.next) || 1;
  const transaction = db.transaction(() => {
    db.prepare(`
      INSERT INTO seo_revisions (seoResourceId, revisionNumber, snapshotJson, changeSummary, createdAt, createdBy)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
    `).run(current.id, revisionNumber, JSON.stringify(current), input.changeSummary || 'SEO settings updated', data.updatedBy);
    const setClause = fields.map((field) => `${field} = ?`).join(', ');
    db.prepare(`UPDATE seo_resources SET ${setClause} WHERE id = ?`).run(...fields.map((field) => allowed[field]), current.id);
  });
  transaction();

  return getSeoResource(db, resourceType, resourceId);
}

function listSeoRevisions(db, seoResourceId, limit = 25) {
  return db.prepare('SELECT * FROM seo_revisions WHERE seoResourceId = ? ORDER BY revisionNumber DESC LIMIT ?').all(seoResourceId, limit);
}

function rollbackSeoRevision(db, revisionId, actor = {}) {
  const revision = db.prepare('SELECT * FROM seo_revisions WHERE id = ?').get(revisionId);
  if (!revision) throwErr('SEO revision was not found.', 404);
  const resource = db.prepare('SELECT * FROM seo_resources WHERE id = ?').get(revision.seoResourceId);
  if (!resource) throwErr('SEO resource was not found.', 404);
  const snapshot = parseJson(revision.snapshotJson, null);
  if (!snapshot) throwErr('SEO revision snapshot is invalid.', 500);
  const input = {};
  for (const field of SEO_RESOURCE_COLUMNS) {
    if (field in snapshot && !['resourceType', 'resourceId', 'updatedAt', 'updatedBy'].includes(field)) input[field] = snapshot[field];
  }
  input.changeSummary = `Rollback to revision ${revision.revisionNumber}`;
  return saveSeoResource(db, resource.resourceType, resource.resourceId, input, actor);
}

function getSeoSiteSettings(db) {
  return db.prepare("SELECT * FROM seo_site_settings WHERE id = 'default'").get();
}

function saveSeoSiteSettings(db, input, actor = {}) {
  const data = { ...input };
  for (const field of ['lowercasePaths', 'stripTrackingParameters', 'emergencyNoindex', 'indexNowEnabled']) {
    if (field in data) data[field] = data[field] ? 1 : 0;
  }
  if (data.canonicalOrigin) {
    let origin;
    try { origin = new URL(data.canonicalOrigin); } catch { throwErr('Canonical origin is not a valid URL.'); }
    if (origin.protocol !== 'https:') throwErr('Canonical origin must use HTTPS.');
    data.canonicalOrigin = origin.origin;
  }
  data.updatedAt = new Date().toISOString();
  data.updatedBy = actor.username || actor.email || 'admin';
  const allowed = pickAllowedColumns(data, SITE_SETTING_COLUMNS);
  const fields = Object.keys(allowed);
  if (fields.length) {
    db.prepare(`UPDATE seo_site_settings SET ${fields.map((field) => `${field} = ?`).join(', ')} WHERE id = 'default'`)
      .run(...fields.map((field) => allowed[field]));
  }
  return getSeoSiteSettings(db);
}

function getSeoDashboardSummary(db) {
  syncSeoResourceInventory(db);
  const resources = db.prepare('SELECT COUNT(*) AS count FROM seo_resources WHERE isActive = 1').get().count;
  const indexable = db.prepare("SELECT COUNT(*) AS count FROM seo_resources WHERE isActive = 1 AND indexState = 'index' AND httpStatus = 200").get().count;
  const openIssues = db.prepare("SELECT COUNT(*) AS count FROM seo_issues WHERE status != 'resolved'").get().count;
  const criticalIssues = db.prepare("SELECT COUNT(*) AS count FROM seo_issues WHERE status != 'resolved' AND severity = 'critical'").get().count;
  const lastRun = db.prepare('SELECT * FROM seo_audit_runs ORDER BY startedAt DESC LIMIT 1').get() || null;
  return { resources, indexable, openIssues, criticalIssues, lastRun };
}

function listSeoIssues(db, { status = 'open', limit = 250 } = {}) {
  const where = status === 'all' ? '' : status === 'open' ? "WHERE status != 'resolved'" : 'WHERE status = ?';
  const params = status === 'all' || status === 'open' ? [limit] : [status, limit];
  return db.prepare(`SELECT * FROM seo_issues ${where} ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END, lastSeenAt DESC LIMIT ?`).all(...params);
}

function updateSeoIssue(db, id, { status, owner }) {
  const validStatus = ['open', 'in_progress', 'ignored', 'resolved'];
  if (!validStatus.includes(status)) throwErr('Invalid issue status.');
  const now = new Date().toISOString();
  const result = db.prepare('UPDATE seo_issues SET status = ?, owner = ?, resolvedAt = ? WHERE id = ?')
    .run(status, owner || null, status === 'resolved' ? now : null, id);
  if (!result.changes) throwErr('SEO issue was not found.', 404);
  return db.prepare('SELECT * FROM seo_issues WHERE id = ?').get(id);
}

function listSeoAuditRuns(db, limit = 20) {
  return db.prepare('SELECT * FROM seo_audit_runs ORDER BY startedAt DESC LIMIT ?').all(limit);
}

function listSeoPageChecks(db, runId, limit = 500) {
  return db.prepare('SELECT * FROM seo_page_checks WHERE runId = ? ORDER BY url LIMIT ?').all(runId, limit);
}

function listIndexNowLog(db, limit = 50) {
  return db.prepare('SELECT * FROM seo_indexnow_log ORDER BY submittedAt DESC LIMIT ?').all(limit);
}

function recordSeo404(db, data) {
  const { path, queryString = '', referrer = null, userAgent = null, ipAddress = null } = data;
  if (!path || path.startsWith('/admin') || path.startsWith('/api')) return;
  db.prepare(`
    INSERT INTO seo_404_log (path, queryString, referrer, userAgent, ipAddress, hitCount, firstSeenAt, lastSeenAt)
    VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(path, queryString) DO UPDATE SET
      referrer = excluded.referrer, userAgent = excluded.userAgent, ipAddress = excluded.ipAddress,
      hitCount = seo_404_log.hitCount + 1, lastSeenAt = excluded.lastSeenAt
  `).run(path, queryString || '', referrer, userAgent, ipAddress);
}

function listSeo404s(db, limit = 250) {
  return db.prepare('SELECT * FROM seo_404_log ORDER BY hitCount DESC, lastSeenAt DESC LIMIT ?').all(limit);
}

// ---------------------------------------------------------------------------
// Bulk operations: preview -> apply -> rollback
// ---------------------------------------------------------------------------
const BULK_DENIED_FIELDS = new Set(['resourceType', 'resourceId', 'createdAt', 'updatedAt', 'updatedBy']);

function bulkPatchFromSnapshot(snapshot) {
  const patch = {};
  for (const field of SEO_RESOURCE_COLUMNS) {
    if (!BULK_DENIED_FIELDS.has(field) && field in snapshot) patch[field] = snapshot[field];
  }
  return patch;
}

function createSeoBulkPreview(db, changes, actor = {}) {
  if (!Array.isArray(changes) || !changes.length) throwErr('Bulk change input must be a non-empty array.');
  if (changes.length > 500) throwErr('Bulk previews are limited to 500 resources at a time.');
  const claimedPaths = new Map();
  const preview = changes.map((change, index) => {
    const errors = [];
    const resourceType = String(change?.resourceType || '');
    const resourceId = String(change?.resourceId || '');
    const current = getSeoResource(db, resourceType, resourceId);
    if (!current) return { index, resourceType, resourceId, valid: false, errors: ['SEO resource was not found.'] };
    const suppliedPatch = change?.patch;
    if (!suppliedPatch || typeof suppliedPatch !== 'object' || Array.isArray(suppliedPatch)) {
      return { index, resourceType, resourceId, path: current.path, valid: false, errors: ['patch must be a JSON object.'] };
    }
    const patch = {};
    for (const [field, value] of Object.entries(suppliedPatch)) {
      if (!SEO_RESOURCE_COLUMNS.has(field) || BULK_DENIED_FIELDS.has(field)) errors.push(`Field is not bulk-editable: ${field}`);
      else patch[field] = value;
    }
    let nextPath = current.path;
    try { nextPath = validateResourceInput({ ...current, ...patch }); } catch (err) { errors.push(err.message); }
    patch.path = nextPath;
    const existingPathOwner = db.prepare('SELECT id FROM seo_resources WHERE path = ?').get(nextPath);
    if (existingPathOwner && existingPathOwner.id !== current.id) errors.push(`Path is already owned by another resource: ${nextPath}`);
    if (claimedPaths.has(nextPath) && claimedPaths.get(nextPath) !== current.id) errors.push(`Another row in this preview also claims ${nextPath}`);
    claimedPaths.set(nextPath, current.id);
    const changedFields = Object.keys(patch).filter((field) => JSON.stringify(current[field]) !== JSON.stringify(patch[field]));
    if (!changedFields.length) errors.push('No effective changes were supplied.');
    return { index, resourceType, resourceId, path: current.path, nextPath, valid: errors.length === 0, errors, changedFields, patch, before: current };
  });
  const info = db.prepare("INSERT INTO seo_bulk_jobs (status, requestJson, previewJson, createdAt, createdBy) VALUES ('preview', ?, ?, CURRENT_TIMESTAMP, ?)")
    .run(JSON.stringify(changes), JSON.stringify(preview), actor.username || actor.email || 'admin');
  return getSeoBulkJob(db, info.lastInsertRowid);
}

function getSeoBulkJob(db, id) {
  const row = db.prepare('SELECT * FROM seo_bulk_jobs WHERE id = ?').get(id);
  if (!row) return null;
  return { ...row, request: parseJson(row.requestJson, []), preview: parseJson(row.previewJson, []), result: parseJson(row.resultJson, null) };
}

function listSeoBulkJobs(db, limit = 25) {
  return db.prepare('SELECT * FROM seo_bulk_jobs ORDER BY createdAt DESC LIMIT ?').all(Math.max(1, Math.min(100, Number(limit) || 25)))
    .map((row) => ({ ...row, request: parseJson(row.requestJson, []), preview: parseJson(row.previewJson, []), result: parseJson(row.resultJson, null) }));
}

function applySeoBulkJob(db, id, actor = {}) {
  const job = getSeoBulkJob(db, id);
  if (!job || job.status !== 'preview') throwErr('Pending bulk preview was not found.', 404);
  if (!job.preview.length || job.preview.some((row) => !row.valid)) throwErr('Every row must pass preview validation before apply.');
  const transaction = db.transaction(() => {
    const results = [];
    for (const row of job.preview) {
      const current = getSeoResource(db, row.resourceType, row.resourceId);
      if (!current || current.updatedAt !== row.before.updatedAt) throwErr(`SEO resource changed after preview: ${row.path}. Run a new preview.`);
      const after = saveSeoResource(db, row.resourceType, row.resourceId, { ...row.patch, changeSummary: `Bulk job ${id}` }, actor);
      results.push({ resourceType: row.resourceType, resourceId: row.resourceId, before: row.before, after });
    }
    db.prepare("UPDATE seo_bulk_jobs SET status = 'applied', resultJson = ?, appliedAt = CURRENT_TIMESTAMP, appliedBy = ? WHERE id = ?")
      .run(JSON.stringify(results), actor.username || actor.email || 'admin', id);
    return results;
  });
  transaction();
  return getSeoBulkJob(db, id);
}

function rollbackSeoBulkJob(db, id, actor = {}) {
  const job = getSeoBulkJob(db, id);
  if (!job || job.status !== 'applied' || !Array.isArray(job.result)) throwErr('Applied bulk job was not found.', 404);
  const transaction = db.transaction(() => {
    for (const row of job.result) {
      const current = getSeoResource(db, row.resourceType, row.resourceId);
      if (!current || current.updatedAt !== row.after.updatedAt) throwErr(`SEO resource changed after this bulk apply: ${row.after.path}. Automatic rollback stopped.`);
      saveSeoResource(db, row.resourceType, row.resourceId, { ...bulkPatchFromSnapshot(row.before), changeSummary: `Rollback bulk job ${id}` }, actor);
    }
    db.prepare("UPDATE seo_bulk_jobs SET status = 'rolled_back', rolledBackAt = CURRENT_TIMESTAMP, rolledBackBy = ? WHERE id = ?")
      .run(actor.username || actor.email || 'admin', id);
  });
  transaction();
  return getSeoBulkJob(db, id);
}

module.exports = {
  normalizePath, computeDefaultParentPath, throwErr, hydrateResource, isValidMaxValue,
  validateGooglebotDirective, validateResourceInput, syncSeoResourceInventory,
  createSeoResource, listSeoResources, getSeoResource, getSeoResourceByPath, saveSeoResource,
  listSeoRevisions, rollbackSeoRevision, getSeoSiteSettings, saveSeoSiteSettings,
  getSeoDashboardSummary, listSeoIssues, updateSeoIssue, listSeoAuditRuns, listSeoPageChecks,
  listIndexNowLog, recordSeo404, listSeo404s, createSeoBulkPreview, listSeoBulkJobs,
  applySeoBulkJob, rollbackSeoBulkJob, SEO_RESOURCE_COLUMNS,
};
