// Regression: initDatabase() must survive a pre-existing production DB whose
// events/users/pages tables predate the Wave-1 columns. On such a DB the
// CREATE TABLE IF NOT EXISTS block no-ops, and the index block used to crash
// with "no such column: slug" (observed in production 2026-07-23).
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const { initDatabase } = require('../init-db');

test('initDatabase upgrades a legacy DB (events without slug) instead of crashing', () => {
  const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'blvd-legacy-')), 'legacy.db');

  // Simulate the legacy production schema: events without slug/SEO/deleted_at,
  // users without isActive, pages absent entirely.
  const legacy = new Database(dbPath);
  legacy.exec(`
    CREATE TABLE events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      description TEXT,
      category TEXT DEFAULT 'special',
      image TEXT,
      ticketUrl TEXT,
      status TEXT DEFAULT 'active',
      isRecurring INTEGER DEFAULT 0,
      recurringPattern TEXT,
      recurringEndDate TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      username TEXT NOT NULL,
      role TEXT DEFAULT 'editor',
      password_hash TEXT,
      password_reset_token TEXT,
      password_reset_expires DATETIME,
      last_login DATETIME,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  legacy.prepare(
    "INSERT INTO events (title, date, time) VALUES ('Legacy Event', '2026-01-01', '19:00')"
  ).run();
  legacy.close();

  // Must not throw.
  assert.doesNotThrow(() => initDatabase(dbPath));

  // Columns and indexes must now exist, with legacy data intact.
  const db = new Database(dbPath);
  const eventCols = new Set(db.prepare('PRAGMA table_info(events)').all().map((c) => c.name));
  for (const col of ['slug', 'seoTitle', 'seoDescription', 'seoKeywords', 'ogTitle', 'ogDescription', 'ogImage', 'deleted_at']) {
    assert.ok(eventCols.has(col), `events.${col} missing after init`);
  }
  const userCols = new Set(db.prepare('PRAGMA table_info(users)').all().map((c) => c.name));
  assert.ok(userCols.has('isActive'), 'users.isActive missing after init');
  const indexes = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map((i) => i.name));
  assert.ok(indexes.has('idx_events_slug'), 'idx_events_slug missing');
  assert.ok(indexes.has('idx_events_deleted_at'), 'idx_events_deleted_at missing');
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM events').get().n, 1, 'legacy row lost');
  db.close();
});
