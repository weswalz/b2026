const { getCrawlLockStatus, runSeoAudit } = require('./seo-audit');
const crypto = require('crypto');
const SCHEDULER_LOCK = 'scheduled-seo-crawl';

function getCrawlSchedule(db) {
  return db.prepare("SELECT * FROM seo_crawl_schedule WHERE id = 'default'").get();
}

function saveCrawlSchedule(db, input, actor = {}) {
  const current = getCrawlSchedule(db);
  const intervalMinutes = Number(input.intervalMinutes ?? current.intervalMinutes);
  const maxPages = Number(input.maxPages ?? current.maxPages);
  const maxDurationMs = Number(input.maxDurationMs ?? current.maxDurationMs);
  const scopeType = input.scopeType === 'prefix' ? 'prefix' : 'all';
  const scopePrefix = scopeType === 'prefix' ? String(input.scopePrefix || '').trim() : null;
  if (!Number.isInteger(intervalMinutes) || intervalMinutes < 15 || intervalMinutes > 10080) {
    throw Object.assign(new Error('Schedule interval must be between 15 minutes and 7 days.'), { status: 400 });
  }
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 5000) {
    throw Object.assign(new Error('Maximum pages must be between 1 and 5000.'), { status: 400 });
  }
  if (!Number.isInteger(maxDurationMs) || maxDurationMs < 10000 || maxDurationMs > 3600000) {
    throw Object.assign(new Error('Maximum duration must be between 10 seconds and 1 hour.'), { status: 400 });
  }
  if (scopeType === 'prefix' && (!scopePrefix || !scopePrefix.startsWith('/'))) {
    throw Object.assign(new Error('A prefix schedule requires a path beginning with /.'), { status: 400 });
  }
  db.prepare(`
    UPDATE seo_crawl_schedule
    SET enabled = ?, intervalMinutes = ?, scopeType = ?, scopePrefix = ?,
        maxPages = ?, maxDurationMs = ?, updatedAt = CURRENT_TIMESTAMP, updatedBy = ?
    WHERE id = 'default'
  `).run(
    input.enabled ? 1 : 0, intervalMinutes, scopeType, scopePrefix,
    maxPages, maxDurationMs, actor.username || actor.email || 'admin'
  );
  return getCrawlSchedule(db);
}

function acquireSchedulerLock(db, owner, ttlMs) {
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  return db.transaction(() => {
    db.prepare(`
      INSERT OR IGNORE INTO seo_worker_locks (name, owner, expiresAt, updatedAt)
      VALUES (?, NULL, NULL, ?)
    `).run(SCHEDULER_LOCK, now);
    const result = db.prepare(`
      UPDATE seo_worker_locks
      SET owner = ?, expiresAt = ?, updatedAt = ?
      WHERE name = ? AND (owner IS NULL OR expiresAt IS NULL OR expiresAt <= ? OR owner = ?)
    `).run(owner, expiresAt, now, SCHEDULER_LOCK, now, owner);
    return result.changes === 1;
  })();
}

function releaseSchedulerLock(db, owner) {
  db.prepare(`
    UPDATE seo_worker_locks
    SET owner = NULL, expiresAt = NULL, updatedAt = CURRENT_TIMESTAMP
    WHERE name = ? AND owner = ?
  `).run(SCHEDULER_LOCK, owner);
}

async function runScheduledCrawlIfDue(db, options = {}) {
  const schedule = getCrawlSchedule(db);
  if (!schedule?.enabled || getCrawlLockStatus().running) return null;
  const last = schedule.lastScheduledRunAt ? new Date(schedule.lastScheduledRunAt).getTime() : 0;
  if (Date.now() - last < schedule.intervalMinutes * 60_000) return null;

  const owner = options.owner || `${process.pid}-${crypto.randomUUID()}`;
  if (!acquireSchedulerLock(db, owner, schedule.maxDurationMs + 60_000)) return null;
  const claimedAt = new Date().toISOString();
  try {
    const claim = db.prepare(`
      UPDATE seo_crawl_schedule
      SET lastScheduledRunAt = ?
      WHERE id = 'default' AND enabled = 1
        AND (lastScheduledRunAt IS NULL OR julianday(?) - julianday(lastScheduledRunAt) >= intervalMinutes / 1440.0)
    `).run(claimedAt, claimedAt);
    if (claim.changes !== 1) return null;
    return await runSeoAudit(db, { username: 'scheduler' }, {
      triggerType: 'scheduled',
      scopeType: schedule.scopeType,
      scopePrefix: schedule.scopePrefix,
      maxPages: schedule.maxPages,
      maxDurationMs: schedule.maxDurationMs,
    });
  } finally {
    releaseSchedulerLock(db, owner);
  }
}

function startSeoScheduler(db) {
  const tick = () => runScheduledCrawlIfDue(db).catch((error) => {
    if (error?.code !== 'CRAWL_ALREADY_RUNNING') console.error('[SEO scheduler] Crawl failed:', error?.message || error);
  });
  setImmediate(tick);
  const timer = setInterval(tick, 60_000);
  timer.unref();
  return timer;
}

module.exports = {
  getCrawlSchedule,
  saveCrawlSchedule,
  acquireSchedulerLock,
  releaseSchedulerLock,
  runScheduledCrawlIfDue,
  startSeoScheduler,
};
