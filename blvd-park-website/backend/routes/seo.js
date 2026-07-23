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
  listSeoAuditRuns,
  listSeoPageChecks,
  listSeoIssues,
  updateSeoIssue,
  getSeoDashboardSummary,
} = require('../lib/seo-resources');

function buildSeoRouter({ requireAuth, requireRole, logActivity, broadcast }) {
  const router = Router();

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
