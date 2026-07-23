// Generic runtime ALTER-TABLE guard for additive columns on an existing prod DB.
// Mirrors the ensureContactPhoneColumn pattern (server.js) so every venue-parity
// feature (events SEO/slug/soft-delete, users.isActive, pages.faq_items, ...)
// can add a column safely without a migration runner. Never throws — a failed
// ALTER is logged and the app continues (the column simply won't exist yet).
function ensureColumns(db, table, columns) {
  try {
    const existing = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
    for (const { name, ddl } of columns) {
      if (!existing.has(name)) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
      }
    }
  } catch (err) {
    console.warn(`Schema guard failed for ${table}:`, err.message || err);
  }
}

module.exports = { ensureColumns };
