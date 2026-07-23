// Activity + access logging — write-path helpers only. Never throw: a logging
// failure must never break the mutating request it's attached to.
function logActivity(db, { action, resourceType, resourceId, req, details }) {
  try {
    db.prepare(`
      INSERT INTO activity_log (action, resourceType, resourceId, userId, username, details, ipAddress)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      action,
      resourceType,
      resourceId != null ? String(resourceId) : null,
      req?.user?.id != null ? String(req.user.id) : null,
      req?.user?.username || req?.user?.email || (req?.user?.role === 'super_admin' ? 'api-key' : null),
      details != null ? (typeof details === 'string' ? details : JSON.stringify(details)) : null,
      req?.ip || req?.headers?.['x-forwarded-for'] || null
    );
  } catch (err) {
    console.warn('logActivity failed:', err.message || err);
  }
}

function logAccess(db, { req, res, route, statusCode }) {
  try {
    db.prepare(`
      INSERT INTO access_log (action, resourceType, resourceId, userId, username, details, ipAddress, route, method, statusCode, userAgent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'access',
      'auth',
      null,
      req?.user?.id != null ? String(req.user.id) : null,
      req?.user?.username || req?.user?.email || null,
      null,
      req?.ip || req?.headers?.['x-forwarded-for'] || null,
      route || req?.originalUrl || req?.path || null,
      req?.method || null,
      statusCode != null ? statusCode : (res?.statusCode ?? null),
      req?.headers?.['user-agent'] || null
    );
  } catch (err) {
    console.warn('logAccess failed:', err.message || err);
  }
}

module.exports = { logActivity, logAccess };
