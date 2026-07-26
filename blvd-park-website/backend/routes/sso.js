const { Router } = require('express');
const crypto = require('crypto');
const { verifySSOToken } = require('../lib/sso-verify');
const { logAccess } = require('../lib/activity');

const router = Router();

/**
 * SSO entry point — validates JWT from CLE Group Admin Hub,
 * finds or creates a local user, creates a session, and
 * redirects to /admin with the session token in the URL hash.
 */
router.get('/', async (req, res) => {
  const token = req.query.token;
  if (!token) return res.redirect('/admin/sso-error');

  const ssoUser = await verifySSOToken(token);
  if (!ssoUser) return res.redirect('/admin/sso-error');

  // Tokens are minted for one CLE venue. Never accept a valid token issued for
  // another property (or a legacy token with no venue claim). The default
  // matches the Admin Hub's stable venue id; deployments can override it
  // explicitly without weakening claim enforcement.
  const expectedVenue = String(process.env.SSO_EXPECTED_VENUE || 'blvdpark').trim().toLowerCase();
  const claimedVenue = typeof ssoUser.venue === 'string' ? ssoUser.venue.trim().toLowerCase() : '';
  if (!claimedVenue || claimedVenue !== expectedVenue) {
    console.warn('[SSO] Venue claim missing or mismatched:', claimedVenue || '(missing)');
    return res.redirect('/admin/sso-error');
  }

  try {
    const db = req.app.locals.db;

    // Find or create local user by email
    let user = db.prepare('SELECT id, role FROM users WHERE email = ?').get(ssoUser.email);
    if (!user) {
      const result = db.prepare(
        'INSERT INTO users (email, username, password_hash, role) VALUES (?, ?, ?, ?)'
      ).run(ssoUser.email, ssoUser.name || ssoUser.email, '', ssoUser.role || 'admin');
      user = { id: result.lastInsertRowid, role: ssoUser.role || 'admin' };
      console.log('[SSO] Created local user for', ssoUser.email);
    }

    // Create session (mirrors existing pattern in server.js)
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(
      sessionToken, user.id, expiresAt
    );

    console.log('[SSO] Session created for', ssoUser.email);
    logAccess(db, { req: { ...req, user: { id: user.id, username: ssoUser.name || ssoUser.email, email: ssoUser.email } }, route: '/api/sso', statusCode: 302 });

    // Redirect with session token in URL hash (frontend picks it up)
    res.redirect(`/admin#sso_token=${sessionToken}&sso_user=${encodeURIComponent(JSON.stringify({ id: user.id, email: ssoUser.email, username: ssoUser.name || ssoUser.email, role: user.role }))}`);
  } catch (err) {
    console.error('[SSO] Session creation failed:', err);
    res.redirect('/admin/sso-error');
  }
});

module.exports = router;
