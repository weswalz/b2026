// Redirects manager — core resolver + write-time safety guards.
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
};
