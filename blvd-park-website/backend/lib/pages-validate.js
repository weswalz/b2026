// Pages CMS payload validation — shared CLE contract (see docs/superpowers/specs/2026-07-22-cle-panel-parity-design.md §4)
const { sanitizeCmsHtml } = require('./cms-sanitize');

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const RESERVED_SLUGS = new Set(['admin', 'api', 'uploads', 'assets', 'images', 'menu', 'book', 'contact', 'private-events', 'privacy', 'terms', 'index', '404']);
const ROBOTS_VALUES = new Set(['noindex, nofollow', 'noindex, follow', 'index, follow', 'index, nofollow']);
const STATUS_VALUES = new Set(['draft', 'published']);
const MAX_SECTIONS = 40;

// Validates + normalizes a pages payload. Returns { ok: true, page } or { ok: false, errors }.
function validatePagePayload(body) {
  const errors = [];
  const out = {};

  const str = (v) => (typeof v === 'string' ? v.trim() : '');

  out.title = str(body.title);
  if (!out.title || out.title.length > 200) errors.push('title is required (max 200 chars)');

  out.slug = str(body.slug).toLowerCase();
  if (!SLUG_RE.test(out.slug) || out.slug.length > 80) errors.push('slug must match ^[a-z0-9]+(-[a-z0-9]+)*$ (max 80 chars)');
  if (RESERVED_SLUGS.has(out.slug)) errors.push(`slug "${out.slug}" is reserved`);

  out.description = str(body.description).slice(0, 1000);
  out.seo_title = str(body.seo_title).slice(0, 300);
  out.seo_description = str(body.seo_description).slice(0, 500);
  out.seo_keywords = str(body.seo_keywords).slice(0, 500);
  out.og_image = str(body.og_image).slice(0, 500);

  out.robots = str(body.robots) || 'noindex, nofollow';
  if (!ROBOTS_VALUES.has(out.robots)) errors.push('robots must be one of: ' + [...ROBOTS_VALUES].join(' | '));

  out.status = str(body.status) || 'draft';
  if (!STATUS_VALUES.has(out.status)) errors.push('status must be draft or published');

  let sections = body.content_sections;
  if (typeof sections === 'string') {
    try { sections = JSON.parse(sections); } catch (_e) { errors.push('content_sections is not valid JSON'); sections = null; }
  }
  if (sections == null) sections = [];
  if (!Array.isArray(sections) || sections.length > MAX_SECTIONS) {
    errors.push(`content_sections must be an array (max ${MAX_SECTIONS})`);
    sections = [];
  } else {
    sections = sections.map((s, i) => {
      const type = s && s.type === 'html' ? 'html' : s && s.type === 'text' ? 'text' : null;
      const bodyText = s && typeof s.body === 'string' ? s.body : '';
      if (!type) { errors.push(`section ${i}: type must be text or html`); return null; }
      if (type === 'text' && bodyText.length > 20000) { errors.push(`section ${i}: text too long (max 20000)`); return null; }
      if (type === 'html' && bodyText.length > 40000) { errors.push(`section ${i}: html too long (max 40000)`); return null; }
      return { type, body: type === 'html' ? sanitizeCmsHtml(bodyText) : bodyText };
    });
  }
  out.content_sections = JSON.stringify((sections || []).filter(Boolean));

  const jsonLdRaw = str(body.json_ld);
  if (jsonLdRaw) {
    try {
      const parsed = JSON.parse(jsonLdRaw);
      if (parsed === null || typeof parsed !== 'object') throw new Error('not an object');
      out.json_ld = JSON.stringify(parsed);
    } catch (_e) {
      errors.push('json_ld must be valid JSON (object or array)');
      out.json_ld = '';
    }
  } else {
    out.json_ld = '';
  }

  return errors.length ? { ok: false, errors } : { ok: true, page: out };
}

module.exports = { validatePagePayload, SLUG_RE, RESERVED_SLUGS };
