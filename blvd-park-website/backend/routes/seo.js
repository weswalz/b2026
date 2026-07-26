// SEO-ops admin routes: crawl trigger/cancel/status, audit run history, page
// checks, and issue query/update. Registered as a separate route module (matching
// the existing backend/routes/sso.js precedent) rather than inlined into
// server.js, because the SEO route surface here (7 endpoints, each delegating to
// backend/lib/seo-audit.js and backend/lib/seo-resources.js) is a cohesive,
// self-contained feature area — the same justification sso.js already
// established as this backend's one prior exception to its otherwise-inline
// server.js route style (confirmed by reading server.js in full: every other
// route family — events, pages, redirects, users, media — is inline; sso.js is
// the sole precedent for a routes/ module, and it exists for the same reason:
// a self-contained feature with its own dedicated logic file to delegate to).
//
// Auth: every route requires requireAuth (session token or ADMIN_API_KEY), passed
// in from server.js as middleware — mirrors how server.js's own inline routes are
// gated. requireRole('admin', 'super_admin') for the mutating endpoints, editors
// still need to be able to trigger/view audits per Heights' own convention
// (Heights' /api/admin/... surface allows all authenticated admin roles to run
// audits — see this file's own middleware wiring below for the exact allowed set).
const { Router } = require('express');
const {
  getCrawlLockStatus,
  requestCrawlCancellation,
  runSeoAudit,
} = require('../lib/seo-audit');
const {
  createSeoResource,
  listSeoResources,
  getSeoResource,
  saveSeoResource,
  listSeoRevisions,
  rollbackSeoRevision,
  getSeoSiteSettings,
  saveSeoSiteSettings,
  createSeoBulkPreview,
  listSeoBulkJobs,
  applySeoBulkJob,
  rollbackSeoBulkJob,
  listSeoAuditRuns,
  listSeoPageChecks,
  listSeoIssues,
  updateSeoIssue,
  getSeoDashboardSummary,
} = require('../lib/seo-resources');

function buildSeoRouter({ requireAuth, requireRole, logActivity, broadcast }) {
  const router = Router();

  // Core SEO resource registry. These routes expose the already-proven
  // resource/revision/bulk helpers to the admin UI; previously the helpers
  // existed but had no HTTP surface.
  router.get('/resources', requireAuth, (req, res) => {
    try {
      res.json(listSeoResources(req.app.locals.db));
    } catch (err) {
      console.error('SEO resource list error:', err);
      res.status(err.status || 500).json({ error: err.message || 'Failed to fetch SEO resources' });
    }
  });

  router.post('/resources', requireAuth, requireRole('admin', 'super_admin'), (req, res) => {
    try {
      const db = req.app.locals.db;
      const created = createSeoResource(db, req.body || {}, req.user);
      logActivity(db, { action: 'create', resourceType: 'seo_resource', resourceId: created.id, req, details: { path: created.path } });
      broadcast('seo');
      res.status(201).json(created);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message || 'Failed to create SEO resource' });
    }
  });

  router.get('/resources/:resourceType/:resourceId', requireAuth, (req, res, next) => {
    try {
      // Existing entity/taxonomy routes use /resources/:numericSeoResourceId/*
      // and are registered later on the parent app. Let those two-segment
      // subroutes continue instead of treating their suffix as a resource id.
      if (/^\d+$/.test(req.params.resourceType)) return next();
      const resource = getSeoResource(req.app.locals.db, req.params.resourceType, req.params.resourceId, true);
      if (!resource) return res.status(404).json({ error: 'SEO resource was not found.' });
      res.json(resource);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message || 'Failed to fetch SEO resource' });
    }
  });

  router.put('/resources/:resourceType/:resourceId', requireAuth, requireRole('admin', 'super_admin', 'editor'), (req, res) => {
    try {
      const db = req.app.locals.db;
      const updated = saveSeoResource(db, req.params.resourceType, req.params.resourceId, req.body || {}, req.user);
      logActivity(db, {
        action: 'update',
        resourceType: 'seo_resource',
        resourceId: updated.id,
        req,
        details: { path: updated.path, changeSummary: req.body?.changeSummary || null },
      });
      broadcast('seo');
      res.json(updated);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message || 'Failed to update SEO resource' });
    }
  });

  router.get('/resources/:resourceType/:resourceId/revisions', requireAuth, (req, res) => {
    try {
      const db = req.app.locals.db;
      const resource = getSeoResource(db, req.params.resourceType, req.params.resourceId, true);
      if (!resource) return res.status(404).json({ error: 'SEO resource was not found.' });
      const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 25));
      res.json(listSeoRevisions(db, resource.id, limit));
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message || 'Failed to fetch SEO revisions' });
    }
  });

  router.post('/revisions/:revisionId/rollback', requireAuth, requireRole('admin', 'super_admin'), (req, res) => {
    try {
      const db = req.app.locals.db;
      const updated = rollbackSeoRevision(db, req.params.revisionId, req.user);
      logActivity(db, { action: 'rollback', resourceType: 'seo_resource', resourceId: updated.id, req, details: { revisionId: req.params.revisionId, path: updated.path } });
      broadcast('seo');
      res.json(updated);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message || 'Failed to roll back SEO revision' });
    }
  });

  router.get('/site-settings', requireAuth, (req, res) => {
    try {
      res.json(getSeoSiteSettings(req.app.locals.db));
    } catch (err) {
      console.error('SEO site settings fetch error:', err);
      res.status(500).json({ error: 'Failed to fetch SEO site settings' });
    }
  });

  router.put('/site-settings', requireAuth, requireRole('admin', 'super_admin'), (req, res) => {
    try {
      const db = req.app.locals.db;
      const updated = saveSeoSiteSettings(db, req.body || {}, req.user);
      logActivity(db, { action: 'update', resourceType: 'seo_site_settings', resourceId: 'default', req });
      broadcast('seo');
      res.json(updated);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message || 'Failed to update SEO site settings' });
    }
  });

  router.get('/bulk', requireAuth, (req, res) => {
    try {
      res.json(listSeoBulkJobs(req.app.locals.db, req.query.limit));
    } catch (err) {
      console.error('SEO bulk job list error:', err);
      res.status(500).json({ error: 'Failed to fetch SEO bulk jobs' });
    }
  });

  router.post('/bulk/preview', requireAuth, requireRole('admin', 'super_admin'), (req, res) => {
    try {
      const db = req.app.locals.db;
      const job = createSeoBulkPreview(db, req.body?.changes, req.user);
      logActivity(db, { action: 'preview', resourceType: 'seo_bulk_job', resourceId: job.id, req, details: { rows: job.preview.length } });
      res.status(201).json(job);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message || 'Failed to preview SEO bulk changes' });
    }
  });

  router.post('/bulk/:id/apply', requireAuth, requireRole('admin', 'super_admin'), (req, res) => {
    try {
      const db = req.app.locals.db;
      const job = applySeoBulkJob(db, req.params.id, req.user);
      logActivity(db, { action: 'apply', resourceType: 'seo_bulk_job', resourceId: job.id, req });
      broadcast('seo');
      res.json(job);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message || 'Failed to apply SEO bulk changes' });
    }
  });

  router.post('/bulk/:id/rollback', requireAuth, requireRole('admin', 'super_admin'), (req, res) => {
    try {
      const db = req.app.locals.db;
      const job = rollbackSeoBulkJob(db, req.params.id, req.user);
      logActivity(db, { action: 'rollback', resourceType: 'seo_bulk_job', resourceId: job.id, req });
      broadcast('seo');
      res.json(job);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message || 'Failed to roll back SEO bulk changes' });
    }
  });

  // Dashboard summary (resource counts, open/critical issue counts, last run).
  router.get('/summary', requireAuth, (req, res) => {
    try {
      const db = req.app.locals.db;
      res.json(getSeoDashboardSummary(db));
    } catch (err) {
      console.error('SEO summary error:', err);
      res.status(500).json({ error: 'Failed to fetch SEO summary' });
    }
  });

  // Crawl lock status — used by the admin panel to show "a crawl is currently
  // running" and enable/disable the Run/Cancel buttons.
  router.get('/crawl/status', requireAuth, (req, res) => {
    res.json(getCrawlLockStatus());
  });

  // Trigger a crawl. Fires the crawl asynchronously (does not block the HTTP
  // response on the whole crawl duration, which can run up to maxDurationMs) —
  // returns 202 with the crawl's lock status immediately; the admin panel polls
  // /crawl/status and /runs for progress/completion, matching how a long-running
  // background job is normally surfaced over a synchronous HTTP API.
  router.post('/crawl', requireAuth, requireRole('admin', 'super_admin', 'editor'), (req, res) => {
    const db = req.app.locals.db;
    const { scopeType, scopePrefix, maxPages, maxDurationMs, triggerType } = req.body || {};
    const options = {
      triggerType: triggerType === 'scheduled' ? 'scheduled' : 'manual',
      scopeType: scopeType === 'prefix' ? 'prefix' : 'all',
      scopePrefix: scopePrefix || null,
      maxPages: Number.isInteger(maxPages) ? maxPages : undefined,
      maxDurationMs: Number.isInteger(maxDurationMs) ? maxDurationMs : undefined,
    };
    runSeoAudit(db, req.user, options)
      .then((run) => {
        logActivity(db, { action: 'crawl-complete', resourceType: 'seo_audit_run', resourceId: run.id, req, details: { status: run.status, totalUrls: run.totalUrls, issueCount: run.issueCount } });
        broadcast('seo');
      })
      .catch((err) => {
        if (err.code !== 'CRAWL_ALREADY_RUNNING') console.error('SEO crawl error:', err);
      });
    logActivity(db, { action: 'crawl-start', resourceType: 'seo_audit_run', resourceId: null, req, details: options });
    res.status(202).json({ started: true, lockStatus: getCrawlLockStatus() });
  });

  // Synchronous crawl variant — awaits the full run and returns the completed
  // seo_audit_runs row. Primarily for tests and small scoped crawls; the async
  // POST /crawl above is the one the admin panel's "Run audit" button should use
  // for a full unscoped site crawl so the request doesn't hold open for minutes.
  router.post('/crawl/sync', requireAuth, requireRole('admin', 'super_admin', 'editor'), async (req, res) => {
    const db = req.app.locals.db;
    const { scopeType, scopePrefix, maxPages, maxDurationMs, triggerType } = req.body || {};
    const options = {
      triggerType: triggerType === 'scheduled' ? 'scheduled' : 'manual',
      scopeType: scopeType === 'prefix' ? 'prefix' : 'all',
      scopePrefix: scopePrefix || null,
      maxPages: Number.isInteger(maxPages) ? maxPages : undefined,
      maxDurationMs: Number.isInteger(maxDurationMs) ? maxDurationMs : undefined,
    };
    try {
      const run = await runSeoAudit(db, req.user, options);
      res.status(run.status === 'completed' ? 200 : 502).json(run);
      logActivity(db, { action: 'crawl-complete', resourceType: 'seo_audit_run', resourceId: run.id, req, details: { status: run.status, totalUrls: run.totalUrls, issueCount: run.issueCount } });
      broadcast('seo');
    } catch (err) {
      if (err.code === 'CRAWL_ALREADY_RUNNING') return res.status(409).json({ error: err.message });
      console.error('SEO sync crawl error:', err);
      res.status(500).json({ error: 'Crawl failed', message: err.message });
    }
  });

  router.post('/crawl/cancel', requireAuth, requireRole('admin', 'super_admin'), (req, res) => {
    const { crawlRunId } = req.body || {};
    if (!crawlRunId) return res.status(400).json({ error: 'crawlRunId is required' });
    const cancelled = requestCrawlCancellation(crawlRunId, req.user?.username || req.user?.email || 'admin');
    if (!cancelled) return res.status(404).json({ error: 'No matching in-progress crawl was found' });
    logActivity(req.app.locals.db, { action: 'crawl-cancel', resourceType: 'seo_crawl_run', resourceId: crawlRunId, req });
    res.json({ cancelled: true });
  });

  // Audit run history.
  router.get('/runs', requireAuth, (req, res) => {
    try {
      const db = req.app.locals.db;
      const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 20));
      res.json(listSeoAuditRuns(db, limit));
    } catch (err) {
      console.error('SEO runs fetch error:', err);
      res.status(500).json({ error: 'Failed to fetch audit runs' });
    }
  });

  router.get('/runs/:runId', requireAuth, (req, res) => {
    try {
      const db = req.app.locals.db;
      const run = db.prepare('SELECT * FROM seo_audit_runs WHERE id = ?').get(req.params.runId);
      if (!run) return res.status(404).json({ error: 'Audit run not found' });
      res.json(run);
    } catch (err) {
      console.error('SEO run fetch error:', err);
      res.status(500).json({ error: 'Failed to fetch audit run' });
    }
  });

  router.get('/runs/:runId/page-checks', requireAuth, (req, res) => {
    try {
      const db = req.app.locals.db;
      const limit = Math.max(1, Math.min(2000, Number(req.query.limit) || 500));
      res.json(listSeoPageChecks(db, req.params.runId, limit));
    } catch (err) {
      console.error('SEO page-checks fetch error:', err);
      res.status(500).json({ error: 'Failed to fetch page checks' });
    }
  });

  // Issues: list (filterable by status) and patch (status/owner).
  router.get('/issues', requireAuth, (req, res) => {
    try {
      const db = req.app.locals.db;
      const status = req.query.status || 'open';
      const limit = Math.max(1, Math.min(2000, Number(req.query.limit) || 250));
      res.json(listSeoIssues(db, { status, limit }));
    } catch (err) {
      console.error('SEO issues fetch error:', err);
      res.status(500).json({ error: 'Failed to fetch SEO issues' });
    }
  });

  router.patch('/issues/:id', requireAuth, requireRole('admin', 'super_admin', 'editor'), (req, res) => {
    try {
      const db = req.app.locals.db;
      const { status, owner } = req.body || {};
      const updated = updateSeoIssue(db, req.params.id, { status, owner });
      res.json(updated);
      logActivity(db, { action: 'update', resourceType: 'seo_issue', resourceId: req.params.id, req, details: { status, owner } });
      broadcast('seo');
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      console.error('SEO issue update error:', err);
      res.status(500).json({ error: 'Failed to update SEO issue' });
    }
  });

  // Link inventory from the most recent crawl (seo_links is current-state, not
  // run-scoped — see backend/lib/seo-audit.js's runSeoAudit() header for why).
  router.get('/links', requireAuth, (req, res) => {
    try {
      const db = req.app.locals.db;
      const limit = Math.max(1, Math.min(5000, Number(req.query.limit) || 1000));
      res.json(db.prepare('SELECT * FROM seo_links ORDER BY sourceUrl LIMIT ?').all(limit));
    } catch (err) {
      console.error('SEO links fetch error:', err);
      res.status(500).json({ error: 'Failed to fetch link inventory' });
    }
  });

  return router;
}

module.exports = { buildSeoRouter };
