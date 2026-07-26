const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { applySeoSchema } = require('../lib/seo-schema');

function createDatabase(prefix) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const db = new Database(path.join(directory, 'test.db'));
  applySeoSchema(db);
  return {
    db,
    close() {
      db.close();
      fs.rmSync(directory, { recursive: true, force: true });
    },
  };
}

test('IndexNow queue persists failed work and retries it to completion', async () => {
  const fixture = createDatabase('blvd-indexnow-queue-');
  const originalKey = process.env.INDEXNOW_KEY;
  const originalFetch = global.fetch;
  process.env.INDEXNOW_KEY = 'durable-test-key';
  fixture.db.prepare("UPDATE seo_site_settings SET indexNowEnabled = 1 WHERE id = 'default'").run();
  let attempts = 0;
  global.fetch = async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('simulated outage');
    return { ok: true, status: 200 };
  };

  try {
    delete require.cache[require.resolve('../lib/indexnow')];
    const { enqueueIndexNow, processIndexNowQueue, listIndexNowQueue } = require('../lib/indexnow');
    const queued = enqueueIndexNow(fixture.db, 'https://blvdpark.com/durable-page', {
      action: 'updated',
      submittedBy: 'test',
    });
    assert.equal(queued.queued, true);

    const first = await processIndexNowQueue(fixture.db, { maxItems: 1, workerId: 'worker-a' });
    assert.deepEqual(first, { processed: 1, succeeded: 0, failed: 1 });
    let row = listIndexNowQueue(fixture.db, 10)[0];
    assert.equal(row.status, 'pending');
    assert.equal(row.attemptCount, 1);
    assert.match(row.lastError, /simulated outage/);

    // Simulates process downtime followed by the persisted retry becoming due.
    fixture.db.prepare("UPDATE seo_indexnow_queue SET nextAttemptAt = '2000-01-01T00:00:00.000Z' WHERE id = ?").run(row.id);
    delete require.cache[require.resolve('../lib/indexnow')];
    const reloaded = require('../lib/indexnow');
    const second = await reloaded.processIndexNowQueue(fixture.db, { maxItems: 1, workerId: 'worker-b' });
    assert.deepEqual(second, { processed: 1, succeeded: 1, failed: 0 });
    row = reloaded.listIndexNowQueue(fixture.db, 10)[0];
    assert.equal(row.status, 'succeeded');
    assert.equal(row.attemptCount, 2);
    assert.ok(row.completedAt);
  } finally {
    if (originalKey === undefined) delete process.env.INDEXNOW_KEY;
    else process.env.INDEXNOW_KEY = originalKey;
    global.fetch = originalFetch;
    delete require.cache[require.resolve('../lib/indexnow')];
    fixture.close();
  }
});

test('IndexNow queue claim prevents two workers from delivering one row twice', async () => {
  const fixture = createDatabase('blvd-indexnow-claim-');
  const originalKey = process.env.INDEXNOW_KEY;
  const originalFetch = global.fetch;
  process.env.INDEXNOW_KEY = 'durable-test-key';
  fixture.db.prepare("UPDATE seo_site_settings SET indexNowEnabled = 1 WHERE id = 'default'").run();
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 25));
    return { ok: true, status: 200 };
  };

  try {
    delete require.cache[require.resolve('../lib/indexnow')];
    const { enqueueIndexNow, processIndexNowQueue } = require('../lib/indexnow');
    enqueueIndexNow(fixture.db, 'https://blvdpark.com/one-delivery', { submittedBy: 'test' });
    await Promise.all([
      processIndexNowQueue(fixture.db, { maxItems: 1, workerId: 'worker-a' }),
      processIndexNowQueue(fixture.db, { maxItems: 1, workerId: 'worker-b' }),
    ]);
    assert.equal(calls, 1);
    assert.equal(fixture.db.prepare("SELECT status FROM seo_indexnow_queue").get().status, 'succeeded');
  } finally {
    if (originalKey === undefined) delete process.env.INDEXNOW_KEY;
    else process.env.INDEXNOW_KEY = originalKey;
    global.fetch = originalFetch;
    delete require.cache[require.resolve('../lib/indexnow')];
    fixture.close();
  }
});

test('crawl scheduler lock has one SQLite-backed owner at a time', () => {
  const fixture = createDatabase('blvd-scheduler-lock-');
  try {
    const { acquireSchedulerLock, releaseSchedulerLock } = require('../lib/seo-scheduler');
    assert.equal(acquireSchedulerLock(fixture.db, 'instance-a', 60_000), true);
    assert.equal(acquireSchedulerLock(fixture.db, 'instance-b', 60_000), false);
    releaseSchedulerLock(fixture.db, 'instance-a');
    assert.equal(acquireSchedulerLock(fixture.db, 'instance-b', 60_000), true);
  } finally {
    fixture.close();
  }
});
