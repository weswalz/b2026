// CMS HTML sanitizer — allowlist ported verbatim from the Colorado Club implementation
// (coloradoclubhouston.com src/lib/cms-sanitize.js). No script/iframe/style; scheme-checked hrefs.
const sanitizeHtml = require('sanitize-html');

const SAFE_URL_PATTERN = /^(#|\/(?!\/)|https?:\/\/|mailto:|tel:)/i;

function normalizeHref(href) {
  if (typeof href !== 'string') return '#';
  const trimmed = href.trim();
  return SAFE_URL_PATTERN.test(trimmed) ? trimmed : '#';
}

function cleanAttributeValue(value) {
  if (typeof value !== 'string') return value;
  return Array.from(value)
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join('')
    .trim();
}

function sanitizeCmsHtml(html) {
  if (typeof html !== 'string' || html.length === 0) return '';

  return sanitizeHtml(html, {
    allowedTags: [
      'a', 'article', 'aside', 'b', 'br', 'caption', 'cite', 'code', 'col', 'colgroup',
      'dd', 'del', 'details', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'footer',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'i', 'img', 'ins', 'li',
      'main', 'mark', 'nav', 'ol', 'p', 'picture', 'pre', 's', 'section', 'small',
      'source', 'span', 'strong', 'sub', 'summary', 'sup', 'table', 'tbody', 'td',
      'tfoot', 'th', 'thead', 'tr', 'u', 'ul'
    ],
    allowedAttributes: {
      '*': ['class', 'id', 'title', 'role', 'aria-label', 'aria-labelledby', 'aria-describedby', 'aria-hidden', 'data-*'],
      a: ['href', 'target', 'rel', 'class', 'id', 'title', 'aria-label'],
      img: ['src', 'srcset', 'sizes', 'alt', 'width', 'height', 'loading', 'decoding', 'fetchpriority', 'class', 'id', 'title'],
      source: ['src', 'srcset', 'sizes', 'type', 'media']
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowProtocolRelative: false,
    allowedSchemesAppliedToAttributes: ['href', 'src', 'srcset'],
    transformTags: {
      a: (tagName, attribs) => {
        const href = normalizeHref(attribs.href);
        const nextAttribs = { ...attribs, href };
        if (nextAttribs.target === '_blank') {
          nextAttribs.rel = 'noopener noreferrer';
        }
        return { tagName, attribs: nextAttribs };
      },
      '*': (tagName, attribs) => {
        const nextAttribs = {};
        for (const [key, value] of Object.entries(attribs)) {
          nextAttribs[key] = cleanAttributeValue(value);
        }
        return { tagName, attribs: nextAttribs };
      }
    }
  });
}

module.exports = { sanitizeCmsHtml };
