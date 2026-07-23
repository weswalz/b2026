// Events-at-Heights-level: slug generation/validation, soft delete, and the
// write-time auto-status sync (mirrors Heights src/lib/db/events.js semantics,
// ported to this venue's better-sqlite3 + Express shape).
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MIN_SLUG_LEN = 3;
const MAX_SLUG_LEN = 120;

function slugify(input) {
  return String(input || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LEN);
}

// Validates a slug's shape only (regex + length). Does not check uniqueness.
function isValidSlugShape(slug) {
  return typeof slug === 'string' && SLUG_RE.test(slug) && slug.length >= MIN_SLUG_LEN && slug.length <= MAX_SLUG_LEN;
}

// Throws a shaped error { code, status, message } — callers map this to the HTTP response.
// excludeId: when editing, exclude that row's own id from the uniqueness check.
function assertSlugAvailable(db, slug, excludeId) {
  if (!isValidSlugShape(slug)) {
    const err = new Error(`Slug must match ${SLUG_RE} (${MIN_SLUG_LEN}-${MAX_SLUG_LEN} chars)`);
    err.code = 'SLUG_INVALID';
    err.status = 400;
    throw err;
  }
  const row = excludeId
    ? db.prepare('SELECT id FROM events WHERE slug = ? AND id != ?').get(slug, excludeId)
    : db.prepare('SELECT id FROM events WHERE slug = ?').get(slug);
  if (row) {
    const err = new Error(`Slug "${slug}" is already taken`);
    err.code = 'SLUG_TAKEN';
    err.status = 409;
    throw err;
  }
}

// Generates a unique slug from a title, appending -2, -3, ... on collision.
// excludeId: when regenerating for an existing row, exclude its own id.
function generateUniqueSlug(db, title, excludeId) {
  const base = slugify(title) || 'event';
  const padded = base.length >= MIN_SLUG_LEN ? base : `${base}-event`.slice(0, MAX_SLUG_LEN);
  let candidate = padded;
  let n = 2;
  const taken = (s) =>
    excludeId
      ? db.prepare('SELECT id FROM events WHERE slug = ? AND id != ?').get(s, excludeId)
      : db.prepare('SELECT id FROM events WHERE slug = ?').get(s);
  while (taken(candidate)) {
    const suffix = `-${n}`;
    candidate = `${padded.slice(0, MAX_SLUG_LEN - suffix.length)}${suffix}`;
    n += 1;
  }
  return candidate;
}

// Backfills slugs for existing rows missing one — run once on boot.
function backfillEventSlugs(db) {
  const missing = db.prepare('SELECT id, title FROM events WHERE slug IS NULL OR slug = \'\'').all();
  if (missing.length === 0) return 0;
  const update = db.prepare('UPDATE events SET slug = ? WHERE id = ?');
  const tx = db.transaction((rows) => {
    for (const row of rows) {
      const slug = generateUniqueSlug(db, row.title, row.id);
      update.run(slug, row.id);
    }
  });
  tx(missing);
  return missing.length;
}

// Write-time auto-status sync (mirrors Heights syncEventStatuses): flips
// non-recurring active events with a past date to 'completed'. Run on both
// public read paths. Excludes soft-deleted rows.
function syncEventStatuses(db) {
  db.prepare(
    "UPDATE events SET status = 'completed' WHERE status = 'active' AND isRecurring = 0 AND date < date('now') AND deleted_at IS NULL"
  ).run();
}

module.exports = {
  SLUG_RE,
  slugify,
  isValidSlugShape,
  assertSlugAvailable,
  generateUniqueSlug,
  backfillEventSlugs,
  syncEventStatuses,
};
