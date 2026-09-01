// Upload MIME sniffing — detects the real file type from magic bytes, independent of
// the client-declared Content-Type/extension, and compares it against what multer's
// fileFilter accepted. Prevents a renamed .jpg that's actually an HTML/script payload
// (or any other extension/content mismatch) from landing in /uploads.
//
// Signatures cited to primary sources:
// - JPEG SOI marker FF D8: https://www.w3.org/Graphics/JPEG/jfif3.pdf
// - PNG 8-byte signature 89 50 4E 47 0D 0A 1A 0A: https://www.w3.org/TR/png/#5PNG-file-signature
// - GIF87a/GIF89a 6-byte ASCII header: https://www.w3.org/Graphics/GIF/spec-gif89a.txt
// - WebP RIFF....WEBP structure: https://developers.google.com/speed/webp/docs/riff_container
// - SVG: no binary magic bytes (XML text format) — detected by content-sniffing for a
//   `<svg` tag within the first bytes, ignoring a possible UTF-8 BOM / XML prolog / whitespace.
// - MP4: 'ftyp' box type at byte offset 4 (ISO base media file format, ISO/IEC 14496-12 §4.3),
//   with the major brand in bytes 8–11 restricted to common ISO-BMFF brands so a random file
//   containing the ASCII "ftyp" doesn't pass.
// - WebM: EBML magic 0x1A45DFA3 (https://www.matroska.org/technical/elements.html — the EBML
//   header ID every Matroska/WebM file starts with).

const SVG_PROBE_WINDOW = 512; // enough to skip past a BOM + <?xml ...?> prolog + whitespace
const MP4_BRANDS = new Set(['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'dash', 'msdh', 'M4V ', 'iso5', 'iso6']);

function detectUploadMime(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 3) return null;

  if (buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buffer.toString('ascii', 8, 12);
    if (MP4_BRANDS.has(brand)) return 'video/mp4';
  }

  if (
    buffer.length >= 4 &&
    buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3
  ) {
    return 'video/webm';
  }

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  if (buffer.length >= 6) {
    const header6 = buffer.toString('ascii', 0, 6);
    if (header6 === 'GIF87a' || header6 === 'GIF89a') return 'image/gif';
  }

  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }

  // SVG: content-sniff for a <svg tag within the probe window, case-insensitive,
  // tolerant of a leading BOM/XML declaration/whitespace/comments before the root element.
  const probe = buffer.subarray(0, Math.min(buffer.length, SVG_PROBE_WINDOW)).toString('utf8');
  if (/<svg[\s>]/i.test(probe)) return 'image/svg+xml';

  return null;
}

// Declared-vs-detected compatibility groups. image/jpeg and image/pjpeg are historically
// interchangeable client-side declarations for the same JPEG magic bytes.
const COMPATIBLE_GROUPS = [
  new Set(['image/jpeg', 'image/pjpeg']),
];

function mimeMatches(declared, detected) {
  if (!declared || !detected) return false;
  if (declared === detected) return true;
  return COMPATIBLE_GROUPS.some((group) => group.has(declared) && group.has(detected));
}

module.exports = { detectUploadMime, mimeMatches };
