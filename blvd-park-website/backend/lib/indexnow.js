// IndexNow client — pings search engines when indexable content changes.
// Protocol: https://www.indexnow.org/documentation (POST /indexnow, JSON body
// {host, key, keyLocation, urlList}, key file hosted at https://<host>/<key>.txt).
// Fire-and-forget: a failed ping must never break the mutating request it's attached to.
const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
const crypto = require('crypto');

// 1-hour in-memory dedup so repeated saves of the same URL (e.g. autosave, rapid
// edits) don't spam the endpoint. Cleared entries are just allowed to re-fire.
const DEDUP_WINDOW_MS = 60 * 60 * 1000;
const recentlyPinged = new Map(); // url -> timestamp

function pruneDedup(now) {
  for (const [url, ts] of recentlyPinged) {
    if (now - ts > DEDUP_WINDOW_MS) recentlyPinged.delete(url);
  }
}

// Submits one or more absolute URLs to IndexNow. Resolves to true/false; never throws.
// Skips silently (resolves false) when INDEXNOW_KEY is unset — B7 must be a no-op
// until the env var is configured, per spec.
function writeLog(db, urls, { action, status, responseStatus = null, responseBody = null, submittedBy }) {
  if (!db) return;
  const insert = db.prepare(`
    INSERT INTO seo_indexnow_log (url, action, status, responseStatus, responseBody, submittedAt, submittedBy)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
  `);
  const transaction = db.transaction(() => {
    for (const url of urls) insert.run(url, action, status, responseStatus, responseBody, submittedBy);
  });
  transaction();
}

async function pingIndexNow(urls, options = {}) {
  const list = (Array.isArray(urls) ? urls : [urls]).filter((u) => typeof u === 'string' && u.length > 0);
  const logOptions = {
    action: options.action || 'updated',
    submittedBy: options.submittedBy || 'system',
  };
  const key = process.env.INDEXNOW_KEY;
  if (list.length === 0) return false;
  if (!key) {
    writeLog(options.db, list, { ...logOptions, status: 'skipped', responseBody: 'INDEXNOW_KEY is not configured.' });
    return false;
  }

  const now = Date.now();
  pruneDedup(now);
  const fresh = list.filter((u) => !recentlyPinged.has(u));
  if (fresh.length === 0) {
    writeLog(options.db, list, { ...logOptions, status: 'deduplicated', responseBody: 'Submitted within the one-hour deduplication window.' });
    return false;
  }

  let host;
  try {
    host = new URL(fresh[0]).host;
  } catch (_e) {
    console.warn('pingIndexNow: could not parse host from URL', fresh[0]);
    writeLog(options.db, fresh, { ...logOptions, status: 'failed', responseBody: 'URL host could not be parsed.' });
    return false;
  }

  const body = {
    host,
    key,
    keyLocation: `https://${host}/${key}.txt`,
    urlList: fresh,
  };

  try {
    const res = await fetch(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.warn(`IndexNow ping failed: HTTP ${res.status}`);
      const responseBody = typeof res.text === 'function'
        ? await res.text().catch(() => '')
        : '';
      writeLog(options.db, fresh, { ...logOptions, status: 'failed', responseStatus: res.status, responseBody: responseBody.slice(0, 2000) });
      return false;
    }
    for (const u of fresh) recentlyPinged.set(u, now);
    writeLog(options.db, fresh, { ...logOptions, status: 'submitted', responseStatus: res.status });
    return true;
  } catch (err) {
    console.warn('IndexNow ping failed:', err.message || err);
    writeLog(options.db, fresh, { ...logOptions, status: 'failed', responseBody: String(err.message || err).slice(0, 2000) });
    return false;
  }
}

function enqueueIndexNow(db, urls, options = {}) {
  const list = [...new Set((Array.isArray(urls) ? urls : [urls])
    .filter((url) => typeof url === 'string' && url.length > 0))];
  if (!db || list.length === 0) return { queued: false, count: 0, reason: 'invalid_request' };

  const key = process.env.INDEXNOW_KEY;
  if (!key) {
    writeLog(db, list, {
      action: options.action || 'updated',
      status: 'skipped',
      responseBody: 'INDEXNOW_KEY is not configured.',
      submittedBy: options.submittedBy || 'system',
    });
    return { queued: false, count: 0, reason: 'credential_required' };
  }

  if (!options.force) {
    const settings = db.prepare("SELECT indexNowEnabled FROM seo_site_settings WHERE id = 'default'").get();
    if (!settings?.indexNowEnabled) {
      writeLog(db, list, {
        action: options.action || 'updated',
        status: 'skipped',
        responseBody: 'Automatic IndexNow delivery is disabled.',
        submittedBy: options.submittedBy || 'system',
      });
      return { queued: false, count: 0, reason: 'disabled' };
    }
  }

  const selectPending = db.prepare(`
    SELECT id FROM seo_indexnow_queue
    WHERE url = ? AND status IN ('pending', 'processing')
    LIMIT 1
  `);
  const insert = db.prepare(`
    INSERT INTO seo_indexnow_queue (
      url, action, status, attemptCount, maxAttempts, nextAttemptAt, submittedBy
    ) VALUES (?, ?, 'pending', 0, ?, ?, ?)
  `);
  const now = new Date().toISOString();
  let count = 0;
  db.transaction(() => {
    for (const url of list) {
      if (selectPending.get(url)) continue;
      insert.run(
        url,
        options.action || 'updated',
        Number.isInteger(options.maxAttempts) ? options.maxAttempts : 5,
        now,
        options.submittedBy || 'system'
      );
      count += 1;
    }
  })();
  return { queued: count > 0, count, reason: count > 0 ? null : 'deduplicated' };
}

function listIndexNowQueue(db, limit = 100) {
  return db.prepare(`
    SELECT * FROM seo_indexnow_queue
    ORDER BY CASE status WHEN 'processing' THEN 0 WHEN 'pending' THEN 1 WHEN 'failed' THEN 2 ELSE 3 END,
             createdAt DESC
    LIMIT ?
  `).all(Math.max(1, Math.min(500, Number(limit) || 100)));
}

function claimNextQueueItem(db, workerId) {
  const now = new Date().toISOString();
  const staleBefore = new Date(Date.now() - 10 * 60_000).toISOString();
  return db.transaction(() => {
    db.prepare(`
      UPDATE seo_indexnow_queue
      SET status = 'pending', lockedAt = NULL, lockedBy = NULL, updatedAt = ?
      WHERE status = 'processing' AND lockedAt < ?
    `).run(now, staleBefore);
    const row = db.prepare(`
      SELECT * FROM seo_indexnow_queue
      WHERE status = 'pending' AND nextAttemptAt <= ? AND attemptCount < maxAttempts
      ORDER BY nextAttemptAt ASC, id ASC
      LIMIT 1
    `).get(now);
    if (!row) return null;
    const claimed = db.prepare(`
      UPDATE seo_indexnow_queue
      SET status = 'processing', lockedAt = ?, lockedBy = ?, updatedAt = ?
      WHERE id = ? AND status = 'pending'
    `).run(now, workerId, now, row.id);
    return claimed.changes === 1 ? { ...row, status: 'processing', lockedAt: now, lockedBy: workerId } : null;
  })();
}

function retryDelayMs(attemptCount) {
  return [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 12 * 60 * 60_000][
    Math.min(Math.max(attemptCount - 1, 0), 4)
  ];
}

async function processIndexNowQueue(db, options = {}) {
  if (!db || !process.env.INDEXNOW_KEY) return { processed: 0, succeeded: 0, failed: 0 };
  const workerId = options.workerId || `${process.pid}-${crypto.randomUUID()}`;
  const maxItems = Math.max(1, Math.min(100, Number(options.maxItems) || 25));
  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  while (processed < maxItems) {
    const item = claimNextQueueItem(db, workerId);
    if (!item) break;
    processed += 1;
    const delivered = await pingIndexNow(item.url, {
      db,
      action: item.action,
      submittedBy: item.submittedBy || 'queue-worker',
    });
    const attemptCount = item.attemptCount + 1;
    const now = new Date().toISOString();
    if (delivered) {
      db.prepare(`
        UPDATE seo_indexnow_queue
        SET status = 'succeeded', attemptCount = ?, completedAt = ?, updatedAt = ?,
            lockedAt = NULL, lockedBy = NULL, lastError = NULL
        WHERE id = ? AND lockedBy = ?
      `).run(attemptCount, now, now, item.id, workerId);
      succeeded += 1;
      continue;
    }

    const exhausted = attemptCount >= item.maxAttempts;
    const nextAttemptAt = new Date(Date.now() + retryDelayMs(attemptCount)).toISOString();
    const latestLog = db.prepare('SELECT responseBody FROM seo_indexnow_log WHERE url = ? ORDER BY id DESC LIMIT 1').get(item.url);
    db.prepare(`
      UPDATE seo_indexnow_queue
      SET status = ?, attemptCount = ?, nextAttemptAt = ?, lastError = ?, updatedAt = ?,
          completedAt = ?, lockedAt = NULL, lockedBy = NULL
      WHERE id = ? AND lockedBy = ?
    `).run(
      exhausted ? 'failed' : 'pending',
      attemptCount,
      nextAttemptAt,
      latestLog?.responseBody || 'IndexNow delivery failed.',
      now,
      exhausted ? now : null,
      item.id,
      workerId
    );
    failed += 1;
  }

  return { processed, succeeded, failed };
}

function startIndexNowWorker(db, options = {}) {
  const intervalMs = Math.max(5_000, Number(options.intervalMs) || 30_000);
  const tick = () => processIndexNowQueue(db).catch((error) => {
    console.error('[IndexNow worker] Queue processing failed:', error?.message || error);
  });
  setImmediate(tick);
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  return timer;
}

module.exports = {
  pingIndexNow,
  enqueueIndexNow,
  listIndexNowQueue,
  processIndexNowQueue,
  startIndexNowWorker,
  INDEXNOW_ENDPOINT,
};
