// Pages CMS payload validation — shared CLE contract (see docs/superpowers/specs/2026-07-22-cle-panel-parity-design.md §4)
// Extended for the page-builder upgrade: hero_json (hero module) + module-style
// content_sections (content-section / component alongside the original text/html).
const { sanitizeCmsHtml } = require('./cms-sanitize');

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const RESERVED_SLUGS = new Set(['admin', 'api', 'uploads', 'assets', 'images', 'menu', 'book', 'contact', 'private-events', 'privacy', 'terms', 'index', '404']);
const ROBOTS_VALUES = new Set(['noindex, nofollow', 'noindex, follow', 'index, follow', 'index, nofollow']);
const STATUS_VALUES = new Set(['draft', 'published']);
const MAX_SECTIONS = 40;
const MAX_FAQ_ITEMS = 50;
const MAX_FAQ_QUESTION_LEN = 500;
const MAX_FAQ_ANSWER_LEN = 10000;

// Component sections map to real Astro components in the public renderer
// (src/components/cms/DynamicSections.astro). This allowlist is the single
// server-side source of truth; the admin editor mirrors it in
// src/components/admin/pageEditor/defs.ts. Keep both in sync.
// Prop types: text (≤300 chars), number (finite, |v| ≤ 100000), select (one of options), checkbox (boolean).
const PAGES_COMPONENT_DEFS = [
  {
    name: 'CallToAction',
    props: [
      { key: 'title', type: 'text' },
      { key: 'subtitle', type: 'text' },
      { key: 'primaryLabel', type: 'text' },
      { key: 'primaryHref', type: 'text' },
      { key: 'secondaryLabel', type: 'text' },
      { key: 'secondaryHref', type: 'text' },
    ],
  },
  {
    name: 'GalleryGrid',
    props: [
      { key: 'title', type: 'text' },
      { key: 'category', type: 'select', options: ['', 'venue', 'food', 'crowd', 'events'] },
      { key: 'limit', type: 'number' },
      { key: 'ctaLabel', type: 'text' },
      { key: 'ctaHref', type: 'text' },
    ],
  },
  {
    name: 'UpcomingEventsSection',
    props: [
      { key: 'title', type: 'text' },
      { key: 'limit', type: 'number' },
      { key: 'ctaLabel', type: 'text' },
      { key: 'ctaHref', type: 'text' },
    ],
  },
  {
    name: 'ReserveCta',
    props: [
      { key: 'title', type: 'text' },
      { key: 'subtitle', type: 'text' },
      { key: 'buttonLabel', type: 'text' },
      { key: 'buttonHref', type: 'text' },
    ],
  },
  {
    name: 'ContactStrip',
    props: [
      { key: 'title', type: 'text' },
      { key: 'subtitle', type: 'text' },
      { key: 'buttonLabel', type: 'text' },
    ],
  },
];

const COMPONENT_NAMES = new Set(PAGES_COMPONENT_DEFS.map((c) => c.name));
const COMPONENT_DEFS_BY_NAME = new Map(PAGES_COMPONENT_DEFS.map((c) => [c.name, c]));
const SECTION_IMAGE_POSITIONS = new Set(['left', 'right']);
const SECTION_HEADING_LEVELS = new Set(['h2', 'h3']);
const CTA_STYLES = new Set(['primary', 'secondary']);
const MAX_HERO_CTAS = 2;
const MAX_HERO_TEXT = 200;
const MAX_HERO_SUBTITLE = 300;
const MAX_MEDIA_URL = 500;
const MAX_PROP_TEXT = 300;
const MAX_PROP_NUMBER = 100000;

// href must be a safe in-site/absolute link — rendered into an href attribute.
const SAFE_HREF_RE = /^(\/|#|https?:\/\/|mailto:|tel:)/i;

const str = (v) => (typeof v === 'string' ? v.trim() : '');

// Validates + normalizes a pages payload. Returns { ok: true, page } or { ok: false, errors }.
function validatePagePayload(body) {
  const errors = [];
  const out = {};

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

  out.content_sections = validateSections(body.content_sections, errors);
  out.faq_items = validateFaqItems(body.faq_items, errors);

  const hero = validateHero(body.hero_json, errors);
  out.hero_json = JSON.stringify(hero);

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

// Section validator — original text/html shapes stay byte-compatible; the two new
// module shapes (content-section, component) carry structured fields.
function validateSections(raw, errors) {
  let sections = raw;
  if (typeof sections === 'string') {
    try { sections = JSON.parse(sections); } catch (_e) { errors.push('content_sections is not valid JSON'); sections = null; }
  }
  if (sections == null) sections = [];
  if (!Array.isArray(sections) || sections.length > MAX_SECTIONS) {
    errors.push(`content_sections must be an array (max ${MAX_SECTIONS})`);
    return JSON.stringify([]);
  }

  const cleaned = sections.map((s, i) => {
    if (!s || typeof s !== 'object') { errors.push(`section ${i}: must be an object`); return null; }

    if (s.type === 'text' || s.type === 'html') {
      const bodyText = typeof s.body === 'string' ? s.body : '';
      if (s.type === 'text' && bodyText.length > 20000) { errors.push(`section ${i}: text too long (max 20000)`); return null; }
      if (s.type === 'html' && bodyText.length > 40000) { errors.push(`section ${i}: html too long (max 40000)`); return null; }
      return { type: s.type, body: s.type === 'html' ? sanitizeCmsHtml(bodyText) : bodyText };
    }

    if (s.type === 'content-section') {
      const out = {
        type: 'content-section',
        title: str(s.title).slice(0, 200),
        subtitle: str(s.subtitle).slice(0, 300),
        contentHtml: sanitizeCmsHtml(typeof s.contentHtml === 'string' ? s.contentHtml.slice(0, 20000) : ''),
        imageSrc: str(s.imageSrc).slice(0, MAX_MEDIA_URL),
        imageAlt: str(s.imageAlt).slice(0, 300),
        imagePosition: s.imagePosition === 'right' ? 'right' : 'left',
        headingLevel: s.headingLevel === 'h3' ? 'h3' : 'h2',
        id: str(s.id).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 80),
      };
      if (out.imageSrc && !SAFE_HREF_RE.test(out.imageSrc)) { errors.push(`section ${i}: imageSrc must be a /, http(s), or # URL`); return null; }
      return out;
    }

    if (s.type === 'component') {
      const name = str(s.name);
      if (!COMPONENT_NAMES.has(name)) { errors.push(`section ${i}: unknown component "${name.slice(0, 60)}"`); return null; }
      const def = COMPONENT_DEFS_BY_NAME.get(name);
      const rawProps = s.props && typeof s.props === 'object' && !Array.isArray(s.props) ? s.props : {};
      const props = {};
      for (const propDef of def.props) {
        const v = rawProps[propDef.key];
        if (v === undefined || v === null || v === '') continue;
        switch (propDef.type) {
          case 'text': {
            if (typeof v !== 'string') { errors.push(`section ${i}: ${name}.${propDef.key} must be text`); return null; }
            const text = str(v).slice(0, MAX_PROP_TEXT);
            if (propDef.key.endsWith('Href') && text && !SAFE_HREF_RE.test(text)) { errors.push(`section ${i}: ${name}.${propDef.key} must be a /, http(s), mailto:, or tel: URL`); return null; }
            props[propDef.key] = text;
            break;
          }
          case 'number': {
            const num = typeof v === 'number' ? v : Number(str(String(v)));
            if (!Number.isFinite(num) || Math.abs(num) > MAX_PROP_NUMBER) { errors.push(`section ${i}: ${name}.${propDef.key} must be a number (max ${MAX_PROP_NUMBER})`); return null; }
            props[propDef.key] = Math.trunc(num);
            break;
          }
          case 'select': {
            const sv = str(String(v));
            if (!propDef.options.includes(sv)) { errors.push(`section ${i}: ${name}.${propDef.key} must be one of: ${propDef.options.join(' | ')}`); return null; }
            if (sv) props[propDef.key] = sv;
            break;
          }
          case 'checkbox': {
            props[propDef.key] = v === true || v === 'true' || v === 1 || v === '1';
            break;
          }
          default:
            errors.push(`section ${i}: ${name}.${propDef.key} has an unsupported prop type`);
            return null;
        }
      }
      return { type: 'component', name, props };
    }

    errors.push(`section ${i}: type must be text, html, content-section, or component`);
    return null;
  });

  return JSON.stringify(cleaned.filter(Boolean));
}

function validateFaqItems(raw, errors) {
  let faqItems = raw;
  if (typeof faqItems === 'string') {
    try { faqItems = JSON.parse(faqItems); } catch (_e) { errors.push('faq_items is not valid JSON'); faqItems = null; }
  }
  if (faqItems == null) faqItems = [];
  if (!Array.isArray(faqItems) || faqItems.length > MAX_FAQ_ITEMS) {
    errors.push(`faq_items must be an array (max ${MAX_FAQ_ITEMS})`);
    return JSON.stringify([]);
  }
  const cleaned = faqItems.map((item, i) => {
    const question = item && typeof item.question === 'string' ? item.question.trim() : '';
    const answerRaw = item && typeof item.answer === 'string' ? item.answer : '';
    if (!question || question.length > MAX_FAQ_QUESTION_LEN) {
      errors.push(`faq_items[${i}]: question is required (max ${MAX_FAQ_QUESTION_LEN} chars)`);
      return null;
    }
    if (answerRaw.length > MAX_FAQ_ANSWER_LEN) {
      errors.push(`faq_items[${i}]: answer too long (max ${MAX_FAQ_ANSWER_LEN})`);
      return null;
    }
    return { question, answer: sanitizeCmsHtml(answerRaw) };
  });
  return JSON.stringify(cleaned.filter(Boolean));
}

// Hero module — stored as a JSON column so no structured-table migration is needed.
function validateHero(raw, errors) {
  let hero = raw;
  if (typeof hero === 'string') {
    if (!hero.trim()) return emptyHero();
    try { hero = JSON.parse(hero); } catch (_e) { errors.push('hero_json is not valid JSON'); return emptyHero(); }
  }
  if (hero == null) return emptyHero();
  if (typeof hero !== 'object' || Array.isArray(hero)) {
    errors.push('hero_json must be an object');
    return emptyHero();
  }

  const out = emptyHero();
  out.title = str(hero.title).slice(0, MAX_HERO_TEXT);
  out.subtitle = str(hero.subtitle).slice(0, MAX_HERO_SUBTITLE);
  out.eyebrow = str(hero.eyebrow).slice(0, 100);
  out.image = str(hero.image).slice(0, MAX_MEDIA_URL);
  out.video = str(hero.video).slice(0, MAX_MEDIA_URL);
  out.showLogo = hero.showLogo === true || hero.showLogo === 1 || hero.showLogo === '1';

  if (out.image && !SAFE_HREF_RE.test(out.image)) { errors.push('hero_json.image must be a /, http(s), or # URL'); return emptyHero(); }
  if (out.video && !SAFE_HREF_RE.test(out.video)) { errors.push('hero_json.video must be a /, http(s), or # URL'); return emptyHero(); }

  let ctas = hero.ctas;
  if (typeof ctas === 'string') {
    try { ctas = JSON.parse(ctas); } catch (_e) { ctas = null; }
  }
  if (ctas == null) ctas = [];
  if (!Array.isArray(ctas) || ctas.length > MAX_HERO_CTAS) {
    errors.push(`hero_json.ctas must be an array (max ${MAX_HERO_CTAS})`);
  } else {
    out.ctas = ctas.map((cta, i) => {
      const label = str(cta?.label).slice(0, 100);
      const href = str(cta?.href).slice(0, MAX_MEDIA_URL);
      if (!label && !href) return null;
      if (!label || !href) { errors.push(`hero_json.ctas[${i}]: label and href are both required`); return null; }
      if (!SAFE_HREF_RE.test(href)) { errors.push(`hero_json.ctas[${i}]: href must be a /, http(s), mailto:, or tel: URL`); return null; }
      return { label, href, style: CTA_STYLES.has(cta.style) ? cta.style : 'primary' };
    }).filter(Boolean);
  }

  return out;
}

function emptyHero() {
  return { title: '', subtitle: '', eyebrow: '', image: '', video: '', showLogo: false, ctas: [] };
}

module.exports = {
  validatePagePayload,
  SLUG_RE,
  RESERVED_SLUGS,
  PAGES_COMPONENT_DEFS,
  COMPONENT_NAMES,
};
