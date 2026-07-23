const jose = require('jose');

const SSO_SECRET = process.env.SSO_SECRET;

/**
 * Verify an SSO JWT token from CLE Group Admin Hub.
 * Returns decoded user payload or null on failure.
 */
async function verifySSOToken(token) {
  if (!token || !SSO_SECRET) return null;

  try {
    const secret = new TextEncoder().encode(SSO_SECRET);
    const { payload } = await jose.jwtVerify(token, secret, {
      algorithms: ['HS256'],
      maxTokenAge: '30s',
    });

    if (!payload.userId || !payload.email || !payload.role) return null;

    return {
      userId: payload.userId,
      email: payload.email,
      role: payload.role,
      venue: payload.venue,
      name: payload.name,
    };
  } catch (e) {
    console.error('[SSO] Verification failed:', e.message);
    return null;
  }
}

module.exports = { verifySSOToken };
