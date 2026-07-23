// Unit tests for MIME sniffing — no server spawn needed, this is a pure function test.
const { test } = require('node:test');
const assert = require('node:assert');
const { detectUploadMime, mimeMatches } = require('../lib/upload-verify');

test('detects JPEG from SOI marker FF D8 FF', () => {
  const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
  assert.strictEqual(detectUploadMime(buf), 'image/jpeg');
});

test('detects PNG from 8-byte signature', () => {
  const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
  assert.strictEqual(detectUploadMime(buf), 'image/png');
});

test('detects GIF87a and GIF89a', () => {
  assert.strictEqual(detectUploadMime(Buffer.from('GIF87a' + 'xxxx', 'ascii')), 'image/gif');
  assert.strictEqual(detectUploadMime(Buffer.from('GIF89a' + 'xxxx', 'ascii')), 'image/gif');
});

test('detects WebP from RIFF....WEBP structure', () => {
  const buf = Buffer.concat([
    Buffer.from('RIFF', 'ascii'),
    Buffer.from([0x00, 0x00, 0x00, 0x00]), // file size (irrelevant for detection)
    Buffer.from('WEBP', 'ascii'),
  ]);
  assert.strictEqual(detectUploadMime(buf), 'image/webp');
});

test('detects SVG by content-sniffing <svg tag, tolerant of BOM/xml prolog/whitespace', () => {
  assert.strictEqual(detectUploadMime(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'utf8')), 'image/svg+xml');
  assert.strictEqual(detectUploadMime(Buffer.from('<?xml version="1.0"?>\n<svg></svg>', 'utf8')), 'image/svg+xml');
  assert.strictEqual(detectUploadMime(Buffer.from('﻿<?xml version="1.0"?>\n\n<svg></svg>', 'utf8')), 'image/svg+xml');
});

test('returns null for unrecognized/non-image content', () => {
  assert.strictEqual(detectUploadMime(Buffer.from('not an image at all', 'utf8')), null);
  assert.strictEqual(detectUploadMime(Buffer.from('<html><body>evil</body></html>', 'utf8')), null);
  assert.strictEqual(detectUploadMime(Buffer.alloc(0)), null);
});

test('a renamed HTML file with a .jpg extension is NOT detected as JPEG (the core threat model)', () => {
  const maliciousBuffer = Buffer.from('<script>alert(document.cookie)</script>', 'utf8');
  const detected = detectUploadMime(maliciousBuffer);
  assert.notStrictEqual(detected, 'image/jpeg');
  assert.strictEqual(detected, null);
});

test('mimeMatches: exact match and the jpeg/pjpeg compatibility group', () => {
  assert.strictEqual(mimeMatches('image/png', 'image/png'), true);
  assert.strictEqual(mimeMatches('image/jpeg', 'image/pjpeg'), true);
  assert.strictEqual(mimeMatches('image/png', 'image/jpeg'), false);
  assert.strictEqual(mimeMatches(null, 'image/png'), false);
});
