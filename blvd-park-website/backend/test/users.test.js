// Users management + roles contract tests — spawns the real server on a random high port with a temp DB.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const Database = require('better-sqlite3');

const PORT = 40000 + Math.floor(Math.random() * 20000);
const BASE = `http://127.0.0.1:${PORT}`;
const KEY = 'test-admin-key';
let proc;
let dbPath;

before(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blvd-users-'));
  dbPath = path.join(tmp, 'test.db');
  // SMTP intentionally left unset/unreachable — invite/resend must degrade gracefully
  // (200 + token row) rather than fail the request when mail can't actually send.
  proc = spawn('node', [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(PORT), DB_PATH: dbPath, ADMIN_API_KEY: KEY, UPLOADS_DIR: path.join(tmp, 'uploads'), SMTP_HOST: '127.0.0.1', SMTP_PORT: '1' },
    stdio: 'ignore'
  });
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`${BASE}/api/health`); if (r.ok) return; } catch (_e) {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('server did not start');
});

after(() => { proc.kill(); });

const superAdminAuth = { 'x-auth-key': KEY, 'Content-Type': 'application/json' };

// Creates a real session-token user with the given role directly in the DB (bypassing
// the API key bypass, which is always super_admin) so role-gating tests exercise the
// actual session -> role lookup path in requireAuth/requireRole.
function createSessionUser(role) {
  const db = new Database(dbPath);
  const crypto = require('crypto');
  const email = `${role}-${crypto.randomBytes(4).toString('hex')}@example.com`;
  const info = db.prepare("INSERT INTO users (email, username, role, isActive) VALUES (?, ?, ?, 1)").run(email, role, role);
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, info.lastInsertRowid, expiresAt);
  db.close();
  return { id: info.lastInsertRowid, email, token, auth: { 'x-auth-key': token, 'Content-Type': 'application/json' } };
}

function setActive(userId, isActive) {
  const db = new Database(dbPath);
  db.prepare('UPDATE users SET isActive = ? WHERE id = ?').run(isActive ? 1 : 0, userId);
  db.close();
}

test('super_admin can list users; admin and editor cannot', async () => {
  const admin = createSessionUser('admin');
  const editor = createSessionUser('editor');

  const superRes = await fetch(`${BASE}/api/users`, { headers: superAdminAuth });
  assert.strictEqual(superRes.status, 200);
  const superBody = await superRes.json();
  assert.ok(Array.isArray(superBody));
  assert.ok(!superBody.some((u) => 'password_hash' in u), 'password hashes must be stripped from the response');

  const adminRes = await fetch(`${BASE}/api/users`, { headers: admin.auth });
  assert.strictEqual(adminRes.status, 403);

  const editorRes = await fetch(`${BASE}/api/users`, { headers: editor.auth });
  assert.strictEqual(editorRes.status, 403);
});

test('super_admin can create a user with an invite (200 + reset token row, no password field accepted)', async () => {
  const res = await fetch(`${BASE}/api/users`, {
    method: 'POST', headers: superAdminAuth,
    body: JSON.stringify({ email: 'newinvite@example.com', username: 'New Invite', role: 'editor' })
  });
  assert.strictEqual(res.status, 201);
  const created = await res.json();
  assert.strictEqual(created.email, 'newinvite@example.com');
  assert.ok(!('password_hash' in created));
  assert.ok(!('password' in created), 'no raw password should ever be returned');

  const db = new Database(dbPath);
  const row = db.prepare('SELECT password_reset_token, password_reset_expires FROM users WHERE email = ?').get('newinvite@example.com');
  db.close();
  assert.ok(row.password_reset_token, 'invite must set a password_reset_token');
  assert.ok(row.password_reset_expires, 'invite must set an expiry');
});

test('admin cannot create users (super_admin only)', async () => {
  const admin = createSessionUser('admin');
  const res = await fetch(`${BASE}/api/users`, {
    method: 'POST', headers: admin.auth,
    body: JSON.stringify({ email: 'shouldfail@example.com', username: 'Should Fail', role: 'editor' })
  });
  assert.strictEqual(res.status, 403);
});

test('super_admin can update a user (username/email/role/isActive)', async () => {
  const target = createSessionUser('editor');
  const res = await fetch(`${BASE}/api/users/${target.id}`, {
    method: 'PUT', headers: superAdminAuth,
    body: JSON.stringify({ username: 'Renamed Editor', role: 'admin' })
  });
  assert.strictEqual(res.status, 200);
  const updated = await res.json();
  assert.strictEqual(updated.username, 'Renamed Editor');
  assert.strictEqual(updated.role, 'admin');
});

test('isActive=0 rejects the session at requireAuth even with a valid, unexpired token', async () => {
  const target = createSessionUser('editor');
  const preCheck = await fetch(`${BASE}/api/auth/verify`, { headers: { 'x-auth-key': target.token } });
  assert.strictEqual(preCheck.status, 200, 'sanity check: session works before deactivation');

  setActive(target.id, false);

  const postCheck = await fetch(`${BASE}/api/auth/verify`, { headers: { 'x-auth-key': target.token } });
  assert.strictEqual(postCheck.status, 401, 'deactivated user session must be rejected');

  const mutatingAttempt = await fetch(`${BASE}/api/hours`, { method: 'PUT', headers: target.auth, body: JSON.stringify({ hours: [] }) });
  assert.strictEqual(mutatingAttempt.status, 401, 'deactivated user must be rejected on any requireAuth route, not just verify');
});

test('resend-invite is super_admin only and returns 200 with a fresh token', async () => {
  const target = createSessionUser('editor');
  const dbBefore = new Database(dbPath);
  const before_ = dbBefore.prepare('SELECT password_reset_token FROM users WHERE id = ?').get(target.id);
  dbBefore.close();

  const adminAttempt = createSessionUser('admin');
  const forbidden = await fetch(`${BASE}/api/users/${target.id}/resend-invite`, { method: 'POST', headers: adminAttempt.auth });
  assert.strictEqual(forbidden.status, 403);

  const res = await fetch(`${BASE}/api/users/${target.id}/resend-invite`, { method: 'POST', headers: superAdminAuth });
  assert.strictEqual(res.status, 200);

  const dbAfter = new Database(dbPath);
  const after_ = dbAfter.prepare('SELECT password_reset_token FROM users WHERE id = ?').get(target.id);
  dbAfter.close();
  assert.ok(after_.password_reset_token, 'resend must (re)issue a token');
  assert.notStrictEqual(after_.password_reset_token, before_.password_reset_token, 'resend must issue a NEW token, not reuse the old one');
});

test('DELETE endpoints require admin|super_admin — editor is blocked', async () => {
  const editor = createSessionUser('editor');
  const admin = createSessionUser('admin');

  // Seed an event to attempt deleting via each role.
  const create = await fetch(`${BASE}/api/events`, {
    method: 'POST', headers: superAdminAuth,
    body: JSON.stringify({ title: 'Role Gate Delete Test', date: '2099-01-01', time: '18:00', category: 'special' })
  });
  const event = await create.json();

  const editorDelete = await fetch(`${BASE}/api/events/${event.id}`, { method: 'DELETE', headers: editor.auth });
  assert.strictEqual(editorDelete.status, 403, 'editor must be blocked from DELETE');

  const adminDelete = await fetch(`${BASE}/api/events/${event.id}`, { method: 'DELETE', headers: admin.auth });
  assert.strictEqual(adminDelete.status, 200, 'admin must be allowed to DELETE');
});

test('header-fix: /api/auth/verify and /api/auth/logout accept x-auth-key too', async () => {
  const target = createSessionUser('editor');

  // Previously only x-auth-token / Authorization: Bearer worked on these two routes;
  // the frontend API client only ever sends x-auth-key (src/lib/api.ts), which meant
  // verify/logout as called from the actual frontend never worked via that header.
  const verifyViaAuthKey = await fetch(`${BASE}/api/auth/verify`, { headers: { 'x-auth-key': target.token } });
  assert.strictEqual(verifyViaAuthKey.status, 200);
  const verifyBody = await verifyViaAuthKey.json();
  assert.strictEqual(verifyBody.authenticated, true);

  // x-auth-token must keep working too (backward compatible, not a breaking change).
  const verifyViaAuthToken = await fetch(`${BASE}/api/auth/verify`, { headers: { 'x-auth-token': target.token } });
  assert.strictEqual(verifyViaAuthToken.status, 200);

  const logoutViaAuthKey = await fetch(`${BASE}/api/auth/logout`, { method: 'POST', headers: { 'x-auth-key': target.token } });
  assert.strictEqual(logoutViaAuthKey.status, 200);

  // Session must actually be gone after logout.
  const verifyAfterLogout = await fetch(`${BASE}/api/auth/verify`, { headers: { 'x-auth-key': target.token } });
  assert.strictEqual(verifyAfterLogout.status, 401);
});
