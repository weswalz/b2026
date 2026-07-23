// Media picker + MIME-sniffing integration tests — spawns the real server on a random
// high port with a temp DB, exercises the real multipart upload path through multer.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const PORT = 40000 + Math.floor(Math.random() * 20000);
const BASE = `http://127.0.0.1:${PORT}`;
const KEY = 'test-admin-key';
let proc;

before(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blvd-media-'));
  proc = spawn('node', [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(PORT), DB_PATH: path.join(tmp, 'test.db'), ADMIN_API_KEY: KEY, UPLOADS_DIR: path.join(tmp, 'uploads') },
    stdio: 'ignore'
  });
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`${BASE}/api/health`); if (r.ok) return; } catch (_e) {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('server did not start');
});

after(() => { proc.kill(); });

const authHeaders = { 'x-auth-key': KEY };

// A real 1x1 PNG (the smallest valid PNG), so legitimate uploads have real magic bytes.
const REAL_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d494844520000000100000001080600000' +
  '01f15c4890000000a4944415478da6360000002000155023d84000000004945' +
  '4e44ae426082',
  'hex'
);

function multipartBody(fieldName, filename, contentType, buffer, extraFields = {}) {
  const boundary = '----BlvdTestBoundary' + Math.random().toString(16).slice(2);
  const parts = [];
  for (const [key, value] of Object.entries(extraFields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`));
  }
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`));
  parts.push(buffer);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

test('a legitimate PNG upload to gallery succeeds', async () => {
  const { body, contentType } = multipartBody('image', 'real.png', 'image/png', REAL_PNG, { alt: 'Real PNG', category: 'venue', galleryType: 'main' });
  const res = await fetch(`${BASE}/api/gallery`, { method: 'POST', headers: { ...authHeaders, 'Content-Type': contentType }, body });
  assert.strictEqual(res.status, 200);
  const created = await res.json();
  assert.ok(created.url.endsWith('.png'));
});

test('an HTML payload disguised with a .png extension and image/png Content-Type is rejected 400', async () => {
  const disguised = Buffer.from('<script>alert(document.cookie)</script>', 'utf8');
  const { body, contentType } = multipartBody('image', 'fake.png', 'image/png', disguised, { alt: 'Fake', category: 'venue', galleryType: 'main' });
  const res = await fetch(`${BASE}/api/gallery`, { method: 'POST', headers: { ...authHeaders, 'Content-Type': contentType }, body });
  assert.strictEqual(res.status, 400);
  const errBody = await res.json();
  assert.strictEqual(errBody.declared, 'image/png');
  assert.strictEqual(errBody.detected, 'unrecognized');
});

test('rejected upload does not leave a file on disk (unlinked) and does not create a gallery row', async () => {
  const disguised = Buffer.from('not-an-image-at-all-just-text', 'utf8');
  const { body, contentType } = multipartBody('image', 'sneaky.jpg', 'image/jpeg', disguised, { alt: 'Sneaky', category: 'venue', galleryType: 'main' });
  const before_ = await (await fetch(`${BASE}/api/gallery`, { headers: authHeaders })).json();

  const res = await fetch(`${BASE}/api/gallery`, { method: 'POST', headers: { ...authHeaders, 'Content-Type': contentType }, body });
  assert.strictEqual(res.status, 400);

  const after_ = await (await fetch(`${BASE}/api/gallery`, { headers: authHeaders })).json();
  assert.strictEqual(after_.length, before_.length, 'no new gallery row should be created on a rejected upload');
});

test('the same mismatch check applies to the events image upload route', async () => {
  const disguised = Buffer.from('<html>evil</html>', 'utf8');
  const { body, contentType } = multipartBody('image', 'evil.png', 'image/png', disguised, { title: 'MIME Test Event', date: '2099-01-01', time: '18:00', category: 'special' });
  const res = await fetch(`${BASE}/api/events`, { method: 'POST', headers: { ...authHeaders, 'Content-Type': contentType }, body });
  assert.strictEqual(res.status, 400);
});

test('GET /api/media/list requires auth and returns the uploaded PNG with expected fields', async () => {
  const noAuth = await fetch(`${BASE}/api/media/list`);
  assert.strictEqual(noAuth.status, 401);

  const res = await fetch(`${BASE}/api/media/list`, { headers: authHeaders });
  assert.strictEqual(res.status, 200);
  const rows = await res.json();
  assert.ok(Array.isArray(rows));
  assert.ok(rows.length <= 300);
  const pngRow = rows.find((r) => r.url.endsWith('.png'));
  assert.ok(pngRow, 'expected the earlier real.png upload to appear in the media list');
  assert.ok('filename' in pngRow);
  assert.ok('size' in pngRow);
  assert.ok('modified' in pngRow);
  assert.ok('source' in pngRow);
  assert.ok(pngRow.size > 0);
});
