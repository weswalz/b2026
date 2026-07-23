// SEO crawler/audit engine — ported from HEIGHTSASTRO/src/lib/seo-audit.js (3,079
// lines, read in full 2026-07-23) to BLVD's Express/SQLite backend. This is a
// synchronous-per-page, raw-HTTP-fetch site crawler: it walks every active
// seo_resources row, fetches its live URL, parses the rendered HTML (title, meta,
// headings, schema, images, links, accessibility, readability, hreflang, social
// tags), and emits a catalog of issue codes persisted into seo_audit_runs /
// seo_page_checks / seo_issues / seo_links via backend/lib/seo-resources.js's
// exports (never duplicated here).
//
// Adapted to this backend's real conventions (confirmed by reading
// backend/lib/seo-resources.js, backend/lib/redirects.js, backend/server.js,
// backend/lib/seo-schema.js, and backend/lib/events.js in full before writing this):
//   - every function takes `db` as an explicit parameter (no module-level
//     connectToDatabase() singleton — BLVD's server.js owns the one db instance).
//   - camelCase columns throughout (matches BLVD's own convention, already
//     established by seo-resources.js/seo-schema.js).
//   - INTEGER AUTOINCREMENT ids everywhere (seo_audit_runs.id, seo_page_checks.id,
//     seo_issues.id, seo_links.id, seo_crawl_runs.id — all already defined this way
//     in backend/lib/seo-schema.js). No crypto.randomUUID() text ids like Heights.
//   - CommonJS (require/module.exports), matching every other backend/lib/*.js.
//   - Brand/domain: "BLVD Park" / https://blvdpark.com (confirmed via
//     backend/server.js's siteUrlBase() default, backend/init-db.js's default admin
//     email admin@blvdpark.com, and src/pages/index.astro:17's real page title
//     "BLVD Park | The Heights' Playground") — replaces every Heights-specific
//     "heightssocialhtx.com" / "Heights Social" / "HeightsSocial-SEO-Audit"
//     reference from the source file.
//
// PORTED FAITHFULLY (same logic, same issue codes, same evidence/recommendation
// text where the underlying fact is true for BLVD too):
//   - Concurrency lock + cancellation (SEO-0501): getCrawlLockStatus(),
//     requestCrawlCancellation(), CrawlCancelledError — verbatim port, this is a
//     REAL in-memory mutual-exclusion lock keyed off the module-scope
//     `activeCrawlLock`, not a comment. Heights source: seo-audit.js:19-67.
//   - analyzeHtml() and every raw-HTML extraction helper (decodeHtml, firstMatch,
//     attribute, metaContent, linkHref, extractHreflangLinks, countMatches,
//     stripVisibleText, extractHeadings, extractBreadcrumbEvidence,
//     extractSocialTags) — verbatim port. Heights source: seo-audit.js:69-446.
//   - evaluateHeadingOutline, evaluateBreadcrumbConsistency, evaluateSocialTags —
//     verbatim port. Heights source: seo-audit.js:484-615.
//   - Readability (Flesch/Flesch-Kincaid): countSyllables, splitTextForReadability,
//     computeFleschReadingEase, computeFleschKincaidGradeLevel, evaluateReadability —
//     verbatim port, same primary-source citations (Flesch 1948, Kincaid et al.
//     1975). Heights source: seo-audit.js:669-812.
//   - Accessibility (WCAG/WAI): evaluateImageAltQuality, evaluateLinkText,
//     evaluateFormLabels — verbatim port, same WAI citations. Heights source:
//     seo-audit.js:814-940.
//   - Duplicate/near-duplicate content: clusterByKey, normalizeVisibleText,
//     shingleText, jaccardSimilarity, findNearDuplicateContentPairs — verbatim
//     port (Broder 1997/2000 shingle-set Jaccard resemblance). Heights source:
//     seo-audit.js:942-1092.
//   - findCanonicalChain, computeCrawlDepths — verbatim port, pure BFS/chain-walk
//     primitives. Heights source: seo-audit.js:1387-1444.
//   - evaluateUrlTrapRisk — verbatim port (disclosed non-Google-sourced heuristic).
//     Heights source: seo-audit.js:1536-1554.
//   - Schema.org / Google rich-result validation (SEO-0604): the exact
//     EVENT/BREADCRUMBLIST/LOCAL_BUSINESS required/recommended property lists and
//     the FAQPage/HowTo Google-deprecation disclosure, ported inline from
//     HEIGHTSASTRO/src/lib/seo-schema-validation.js (376 lines, read in full) since
//     that module has zero upward imports and is safe to fold directly into this
//     file for BLVD (no circular-import risk exists here the way Heights' db/seo.js
//     <-> seo-audit.js pair had, since BLVD's seo-resources.js never imports this
//     file).
//   - Schema regression detection (SEO-0607): SCHEMA_REGRESSION_ELIGIBLE_CODES,
//     classifySchemaRegression, ported inline from
//     HEIGHTSASTRO/src/lib/seo-schema-diff.js (294 lines, read in full) — only the
//     regression-classification piece is needed by the crawler; the
//     version-history/diff-rendering half of that file (compareSchemaVersions,
//     renderSchemaDiffLines) is a save-time admin-editor feature outside this
//     ticket's crawler-engine scope and is not ported here (see report).
//   - Hreflang (SEO-0107): validateLanguageTag, checkReciprocalHreflang,
//     checkHreflangCanonicalCompatibility, buildHreflangClusters, ported inline
//     from HEIGHTSASTRO/src/lib/hreflang.js (296 lines, read in full — a
//     standalone, dependency-free leaf module with no adaptation needed beyond
//     CommonJS export syntax).
//
// ADAPTED (same behavior, different underlying data source because BLVD's schema
// differs from Heights'):
//   - configuredAuditOrigin(): reads seo_site_settings.canonicalOrigin (via
//     getSeoSiteSettings(db)) then SEO_AUDIT_BASE_URL / FRONTEND_URL / SITE_URL env
//     vars, falling back to 'https://blvdpark.com' (BLVD's real default, confirmed
//     server.js:120 `siteUrlBase()`) instead of Heights' PUBLIC_SITE_URL default of
//     'https://heightssocialhtx.com'.
//   - Resource inventory: reads `listSeoResources(db)` from seo-resources.js
//     (BLVD's own already-built resource layer) instead of Heights'
//     src/lib/db/seo.js's listSeoResources(). Same filter (isActive, exclude
//     /admin and /api paths).
//   - Redirect-chain detection reads BLVD's own `redirects` table (fromPath/toPath/
//     statusCode/isActive — confirmed identical column names to Heights' via
//     backend/init-db.js) — no adaptation needed, same columns exist verbatim.
//
// NOT PORTED (disclosed, not silently dropped — see the final report for the full
// reasoning on each):
//   - SEO-0605 visible-content-consistency Event/Organization cross-checks against
//     a structured `getEventById()`/`getContactInfo()` database record: BLVD's
//     `events` table has no `djName` column (no performer concept exists) and BLVD
//     has no structured contact/address table at all (address lives only as free
//     -text CMS `site_content` keys like `footer.address_line1` — confirmed by
//     reading backend/content-schema.js — not a queryable
//     address/city/state/zipCode row the way Heights' `globals` table is). Building
//     evaluateEventSchemaAgainstDatabase()/evaluateOrganizationSchemaAgainstVisibleContent()
//     against fabricated structured input would violate the anti-fabrication rule
//     this port must follow. Event schema-vs-DB TITLE/DATE consistency (the part
//     BLVD's `events` table CAN support: title, date, status) IS ported below as
//     SCHEMA_EVENT_NAME_MISMATCH / SCHEMA_EVENT_DATE_MISMATCH / SCHEMA_STALE_EVENT_DATE.
//   - image-diagnostics.js (runImageDiagnostics — filesystem/content-hash/oversized
//     -file checks): not in this ticket's required-read sibling-module list and no
//     BLVD equivalent was read/verified; not ported.
//   - checkCitationSources() / BROKEN_CITATION_SOURCE: seo_citations rows exist in
//     BLVD's schema (backend/lib/seo-schema.js) but no citation CRUD layer exists
//     yet in seo-resources.js (confirmed by grep — zero seo_citations references
//     there); this crawler reads whatever seo_citations rows exist directly (the
//     table's shape is already camelCase-identical to Heights'), so the check is
//     ported as-is and will simply find zero rows until a citations CRUD surface
//     is built elsewhere.
//   - SEO-0405 findInternalLinkRecommendations / SEO-0206 entity-reference-based
//     suggestions: depends on seo_entity_references, which has no CRUD layer in
//     seo-resources.js yet either. Not wired into runSeoAudit()'s issue emission
//     (would always report zero); the pure Jaccard/entity primitives this would
//     need already exist below (shingleText/jaccardSimilarity) for a future build.

const crypto = require('crypto');
const {
  listSeoResources,
  getSeoSiteSettings,
} = require('./seo-resources');

// ---------------------------------------------------------------------------------------
// Concurrency lock + cancellation (SEO-0501) — verbatim port, Heights seo-audit.js:19-67
// ---------------------------------------------------------------------------------------
// A REAL in-memory mutual-exclusion lock, not documentation-only. This module-scope
// object is the single source of truth for "is a crawl running right now" across every
// caller in this process — the admin's manual "Run audit" trigger route below is the
// only caller today (BLVD has no scheduler yet, unlike Heights' seo-scheduler.js), but
// the same lock/cancellation contract is built in full so a future scheduler can share
// it without redesign.
let activeCrawlLock = null; // { crawlRunId: number, startedAt: number, cancelRequested: boolean, cancelledBy?: string } | null

function getCrawlLockStatus() {
  if (!activeCrawlLock) return { running: false, crawlRunId: null, startedAt: null, cancelRequested: false };
  return { running: true, ...activeCrawlLock };
}

function requestCrawlCancellation(crawlRunId, cancelledBy = 'admin') {
  if (!activeCrawlLock || activeCrawlLock.crawlRunId !== crawlRunId) return false;
  activeCrawlLock.cancelRequested = true;
  activeCrawlLock.cancelledBy = cancelledBy;
  return true;
}

class CrawlCancelledError extends Error {
  constructor() {
    super('Crawl was cancelled by an administrator.');
    this.name = 'CrawlCancelledError';
  }
}

// ---------------------------------------------------------------------------------------
// Raw HTML extraction primitives — verbatim port, Heights seo-audit.js:69-137
// ---------------------------------------------------------------------------------------

function decodeHtml(value = '') {
  return value
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .trim();
}

function firstMatch(html, pattern) {
  const match = html.match(pattern);
  return match ? decodeHtml(match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')) : '';
}

function attribute(tag, name) {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return match ? decodeHtml(match[1]) : '';
}

function metaContent(html, name, property = false) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const key = attribute(tag, property ? 'property' : 'name').toLowerCase();
    if (key === name.toLowerCase()) return attribute(tag, 'content');
  }
  return '';
}

function linkHref(html, rel) {
  const tags = html.match(/<link\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const relValue = attribute(tag, 'rel').toLowerCase().split(/\s+/);
    if (relValue.includes(rel)) return attribute(tag, 'href');
  }
  return '';
}

function extractHreflangLinks(html) {
  const tags = html.match(/<link\b[^>]*>/gi) || [];
  const entries = [];
  for (const tag of tags) {
    const relValue = attribute(tag, 'rel').toLowerCase().split(/\s+/);
    if (!relValue.includes('alternate')) continue;
    const lang = attribute(tag, 'hreflang');
    const url = attribute(tag, 'href');
    if (lang && url) entries.push({ lang, url });
  }
  return entries;
}

function countMatches(value, pattern) {
  return (value.match(pattern) || []).length;
}

function stripVisibleText(html) {
  return decodeHtml(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<!--([\s\S]*?)-->/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
  );
}

// ---------------------------------------------------------------------------------------
// analyzeHtml() — verbatim port, Heights seo-audit.js:139-374
// ---------------------------------------------------------------------------------------
function analyzeHtml(html, pageUrl) {
  const title = firstMatch(html, /<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const description = metaContent(html, 'description');
  const canonical = linkHref(html, 'canonical');
  const robots = metaContent(html, 'robots');
  const googlebot = metaContent(html, 'googlebot');
  const h1Count = countMatches(html, /<h1\b[^>]*>/gi);
  const headings = extractHeadings(html);
  const schemaTags = html.match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  const schemaErrors = [];
  const schemaNodes = [];
  for (const tag of schemaTags) {
    const payload = tag.replace(/^<script\b[^>]*>/i, '').replace(/<\/script>$/i, '').trim();
    try {
      const parsed = JSON.parse(payload);
      if (!parsed || typeof parsed !== 'object') {
        schemaErrors.push('JSON-LD payload is not an object or array');
        continue;
      }
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      for (const candidate of candidates) {
        if (candidate && typeof candidate === 'object') {
          schemaNodes.push(candidate);
          if (Array.isArray(candidate['@graph'])) {
            for (const graphNode of candidate['@graph']) {
              if (graphNode && typeof graphNode === 'object') schemaNodes.push(graphNode);
            }
          }
        }
      }
    } catch (error) {
      schemaErrors.push(error.message);
    }
  }

  const imageTags = html.match(/<img\b[^>]*>/gi) || [];
  const imagesMissingAlt = imageTags.filter((tag) => !/\salt\s*=\s*["'][^"']*["']/i.test(tag)).length;
  const imageAltEvidence = imageTags.map((tag) => {
    const hasAlt = /\salt\s*=\s*["'][^"']*["']/i.test(tag);
    return { hasAlt, alt: hasAlt ? attribute(tag, 'alt') : null, src: attribute(tag, 'src') };
  });

  const links = [];
  const malformedLinks = [];
  const linkTextEvidence = [];
  const linkInventoryEvidence = [];
  const headerRegion = html.match(/<header\b[^>]*>[\s\S]*?<\/header>/i);
  const footerRegion = html.match(/<footer\b[^>]*>[\s\S]*?<\/footer>/i);
  const breadcrumbNavRegion = html.match(/<nav\b[^>]*aria-label\s*=\s*["']Breadcrumb["'][^>]*>[\s\S]*?<\/nav>/i);
  function classifyLinkContext(offset) {
    if (headerRegion && offset >= headerRegion.index && offset < headerRegion.index + headerRegion[0].length) return 'header';
    if (footerRegion && offset >= footerRegion.index && offset < footerRegion.index + footerRegion[0].length) return 'footer';
    if (breadcrumbNavRegion && offset >= breadcrumbNavRegion.index && offset < breadcrumbNavRegion.index + breadcrumbNavRegion[0].length) return 'breadcrumb-nav';
    return 'body';
  }
  for (const match of html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/gi)) {
    const tag = match[0];
    const openTagMatch = tag.match(/<a\b[^>]*>/i);
    const openTag = openTagMatch ? openTagMatch[0] : tag;
    const href = attribute(openTag, 'href');
    const innerHtml = tag.replace(/^<a\b[^>]*>/i, '').replace(/<\/a>$/i, '');
    const visibleText = decodeHtml(innerHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
    const ariaLabel = attribute(openTag, 'aria-label');
    if (href && !href.startsWith('#')) linkTextEvidence.push({ href, visibleText, ariaLabel });
    const relTokens = attribute(openTag, 'rel').toLowerCase().split(/\s+/).filter(Boolean);
    if (href && !href.startsWith('#') && !/^(mailto:|tel:|javascript:)/i.test(href)) {
      let destinationUrl = null;
      let isMalformed = false;
      try { destinationUrl = new URL(href, pageUrl).href; } catch { isMalformed = true; }
      linkInventoryEvidence.push({
        href,
        destinationUrl,
        isMalformed,
        visibleText,
        context: classifyLinkContext(match.index),
        relTokens,
        relNofollow: relTokens.includes('nofollow'),
        relSponsored: relTokens.includes('sponsored'),
        relUgc: relTokens.includes('ugc'),
      });
    }
    if (!href || href.startsWith('#') || /^(mailto:|tel:|javascript:)/i.test(href)) continue;
    try {
      links.push(new URL(href, pageUrl).href);
    } catch {
      malformedLinks.push(href);
      links.push(href);
    }
  }

  const labelForTargets = new Set();
  for (const tag of html.match(/<label\b[^>]*>/gi) || []) {
    const forId = attribute(tag, 'for');
    if (forId) labelForTargets.add(forId);
  }
  const wrappingLabelBlocks = html.match(/<label\b[^>]*>[\s\S]*?<\/label>/gi) || [];
  const wrappedControlTags = new Set();
  for (const block of wrappingLabelBlocks) {
    for (const innerTag of block.match(/<(?:input|textarea|select)\b[^>]*?\/?>/gi) || []) {
      wrappedControlTags.add(innerTag);
    }
  }
  const formControlEvidence = [];
  const controlTagPattern = /<(input|textarea|select)\b[^>]*?\/?>/gi;
  let controlMatch;
  while ((controlMatch = controlTagPattern.exec(html)) !== null) {
    const tag = controlMatch[0];
    const tagName = controlMatch[1].toLowerCase();
    const type = (attribute(tag, 'type') || 'text').toLowerCase();
    if (tagName === 'input' && ['hidden', 'submit', 'button', 'reset', 'image'].includes(type)) continue;
    const id = attribute(tag, 'id');
    const ariaLabel = attribute(tag, 'aria-label');
    const ariaLabelledby = attribute(tag, 'aria-labelledby');
    formControlEvidence.push({
      tagName, type, id: id || null,
      hasForLabel: !!id && labelForTargets.has(id),
      hasWrappingLabel: wrappedControlTags.has(tag),
      hasAriaLabel: !!ariaLabel, hasAriaLabelledby: !!ariaLabelledby,
    });
  }

  let canonicalUrl = '';
  let canonicalIsMalformed = false;
  if (canonical) {
    try {
      canonicalUrl = new URL(canonical, pageUrl).href;
    } catch {
      canonicalIsMalformed = true;
    }
  }

  return {
    title,
    description,
    canonical,
    canonicalUrl,
    canonicalIsMalformed,
    robots,
    googlebot,
    h1Count,
    headings,
    schemaCount: schemaTags.length,
    schemaErrors,
    schemaNodes,
    imageCount: imageTags.length,
    imagesMissingAlt,
    imageAltEvidence,
    linkTextEvidence,
    linkInventoryEvidence,
    formControlEvidence,
    links: [...new Set(links)],
    malformedLinkCount: malformedLinks.length,
    visibleTextLength: stripVisibleText(html).length,
    normalizedVisibleText: normalizeVisibleText(html),
    visibleText: stripVisibleText(html),
    mixedContentCount: countMatches(html, /(?:src|href)=["']http:\/\//gi),
    hasHtmlLanguage: /<html\b[^>]*\slang=["'][^"']+["']/i.test(html),
    htmlLanguage: (html.match(/<html\b[^>]*\slang=["']([^"']+)["']/i) || [])[1] || '',
    hasViewport: !!metaContent(html, 'viewport'),
    hasDataNosnippet: /\sdata-nosnippet(?:\s|=|>)/i.test(html),
    hreflang: extractHreflangLinks(html),
    social: extractSocialTags(html),
    breadcrumbs: extractBreadcrumbEvidence(html),
  };
}

// Verbatim port, Heights seo-audit.js:389-425
function extractBreadcrumbEvidence(html) {
  const visible = [];
  const navMatch = html.match(/<nav\b[^>]*aria-label\s*=\s*["']Breadcrumb["'][^>]*>([\s\S]*?)<\/nav>/i);
  if (navMatch) {
    const listItemTags = navMatch[1].match(/<li\b[^>]*>([\s\S]*?)<\/li>/gi) || [];
    for (const li of listItemTags) {
      const anchorMatch = li.match(/<a\b[^>]*href\s*=\s*["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/i);
      if (anchorMatch) {
        visible.push({ text: decodeHtml(anchorMatch[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')), href: decodeHtml(anchorMatch[1]) });
      } else {
        const text = decodeHtml(li.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).replace(/^\/\s*/, '').trim();
        if (text) visible.push({ text, href: null });
      }
    }
  }

  const schemaItems = [];
  const schemaTags = html.match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const tag of schemaTags) {
    const payload = tag.replace(/^<script\b[^>]*>/i, '').replace(/<\/script>$/i, '').trim();
    try {
      const parsed = JSON.parse(payload);
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      for (const candidate of candidates) {
        if (candidate && candidate['@type'] === 'BreadcrumbList' && Array.isArray(candidate.itemListElement)) {
          for (const item of candidate.itemListElement) {
            schemaItems.push({ position: item.position, name: item.name, item: item.item });
          }
        }
      }
    } catch {
      // Malformed JSON-LD is already reported as INVALID_JSON_LD from analyzeHtml()'s own pass.
    }
  }
  return { visible, hasVisibleNav: !!navMatch, schemaItems, hasSchema: schemaItems.length > 0 };
}

// Verbatim port, Heights seo-audit.js:433-446
function extractSocialTags(html) {
  return {
    ogTitle: metaContent(html, 'og:title', true),
    ogDescription: metaContent(html, 'og:description', true),
    ogImage: metaContent(html, 'og:image', true),
    ogUrl: metaContent(html, 'og:url', true),
    ogType: metaContent(html, 'og:type', true),
    twitterCard: metaContent(html, 'twitter:card'),
    twitterTitle: metaContent(html, 'twitter:title'),
    twitterDescription: metaContent(html, 'twitter:description'),
    twitterImage: metaContent(html, 'twitter:image'),
    twitterUrl: metaContent(html, 'twitter:url'),
  };
}

// Verbatim port, Heights seo-audit.js:466-482
function evaluateSocialTags(rendered, expected = {}) {
  const errors = [];
  const mismatches = [];
  if (!rendered.ogTitle) errors.push('og:title is missing from the rendered response (required by the Open Graph protocol, https://ogp.me/).');
  if (!rendered.ogType) errors.push('og:type is missing from the rendered response (required by the Open Graph protocol, https://ogp.me/).');
  if (!rendered.ogImage) errors.push('og:image is missing from the rendered response (required by the Open Graph protocol, https://ogp.me/).');
  if (!rendered.ogUrl) errors.push('og:url is missing from the rendered response (required by the Open Graph protocol, https://ogp.me/).');
  if (rendered.twitterCard && !['summary', 'summary_large_image'].includes(rendered.twitterCard)) {
    errors.push(`twitter:card value "${rendered.twitterCard}" is not one of this site's supported card types (summary, summary_large_image).`);
  }
  if (expected.ogTitle && rendered.ogTitle !== expected.ogTitle) mismatches.push(`og:title configured as "${expected.ogTitle}" but rendered as "${rendered.ogTitle || '(missing)'}".`);
  if (expected.ogDescription && rendered.ogDescription !== expected.ogDescription) mismatches.push(`og:description configured as "${expected.ogDescription}" but rendered as "${rendered.ogDescription || '(missing)'}".`);
  if (expected.ogImage && rendered.ogImage !== expected.ogImage) mismatches.push(`og:image configured as "${expected.ogImage}" but rendered as "${rendered.ogImage || '(missing)'}".`);
  if (expected.ogUrl && rendered.ogUrl !== expected.ogUrl) mismatches.push(`og:url configured as "${expected.ogUrl}" but rendered as "${rendered.ogUrl || '(missing)'}".`);
  if (expected.twitterCard && rendered.twitterCard !== expected.twitterCard) mismatches.push(`twitter:card configured as "${expected.twitterCard}" but rendered as "${rendered.twitterCard || '(missing)'}".`);
  return { valid: errors.length === 0 && mismatches.length === 0, errors, mismatches };
}

function issue(code, category, severity, url, title, evidence, recommendation) {
  return { code, category, severity, url, title, evidence, recommendation };
}

// Verbatim port, Heights seo-audit.js:499-507
function extractHeadings(html) {
  const headingTags = html.match(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi) || [];
  return headingTags.map((tag) => {
    const match = tag.match(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/i);
    const level = Number(match[1]);
    const text = decodeHtml(match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
    return { level, text, isEmpty: text.trim().length === 0 };
  });
}

// Verbatim port, Heights seo-audit.js:540-552
function evaluateHeadingOutline(headings) {
  const emptyHeadings = headings.filter((h) => h.isEmpty).map((h) => ({ level: h.level }));
  const skippedLevels = [];
  let previousLevel = null;
  for (const heading of headings) {
    if (previousLevel !== null && heading.level > previousLevel + 1) {
      skippedLevels.push({ fromLevel: previousLevel, toLevel: heading.level });
    }
    previousLevel = heading.level;
  }
  const h1Text = headings.filter((h) => h.level === 1 && !h.isEmpty).map((h) => h.text.trim().toLowerCase());
  return { emptyHeadings, skippedLevels, h1Text };
}

// Verbatim port, Heights seo-audit.js:582-615
function evaluateBreadcrumbConsistency(evidence) {
  const { visible, hasVisibleNav, schemaItems, hasSchema } = evidence;
  const schemaWithoutVisible = hasSchema && !hasVisibleNav;
  const visibleWithoutSchema = hasVisibleNav && visible.length > 1 && !hasSchema;
  const countMismatch = hasVisibleNav && hasSchema && visible.length !== schemaItems.length;

  const malformedSchemaItems = [];
  const sortedSchemaItems = [...schemaItems].sort((a, b) => (Number(a.position) || 0) - (Number(b.position) || 0));
  sortedSchemaItems.forEach((item, index) => {
    const expectedPosition = index + 1;
    if (!Number.isInteger(Number(item.position)) || Number(item.position) !== expectedPosition) {
      malformedSchemaItems.push({ position: item.position, issue: `Expected sequential integer position ${expectedPosition}.` });
    }
    if (!item.name || typeof item.name !== 'string' || !item.name.trim()) {
      malformedSchemaItems.push({ position: item.position, issue: 'ListItem is missing a non-empty name.' });
    }
    const isLast = index === sortedSchemaItems.length - 1;
    if (!isLast && (!item.item || typeof item.item !== 'string')) {
      malformedSchemaItems.push({ position: item.position, issue: 'ListItem is missing its item URL (required on every entry except optionally the last).' });
    }
  });

  const labelMismatches = [];
  if (!schemaWithoutVisible && !visibleWithoutSchema && !countMismatch) {
    visible.forEach((crumb, index) => {
      const schemaItem = sortedSchemaItems[index];
      if (schemaItem && String(schemaItem.name || '').trim().toLowerCase() !== crumb.text.trim().toLowerCase()) {
        labelMismatches.push({ position: index + 1, visibleText: crumb.text, schemaName: String(schemaItem.name || '') });
      }
    });
  }

  return { schemaWithoutVisible, visibleWithoutSchema, countMismatch, labelMismatches, malformedSchemaItems };
}

// ---------------------------------------------------------------------------------------
// Schema.org / Google rich-result property validation (SEO-0604) — ported inline from
// HEIGHTSASTRO/src/lib/seo-schema-validation.js (376 lines, read in full 2026-07-23).
// Same Google-documented required/recommended property lists, same FAQPage/HowTo
// deprecation disclosure (both dated citations verified against that file's own header,
// stable facts not requiring re-verification for this port).
// ---------------------------------------------------------------------------------------
const EVENT_REQUIRED_PROPERTIES = Object.freeze([
  { path: 'name', label: 'name' },
  { path: 'location', label: 'location' },
  { path: 'location.address', label: 'location.address' },
  { path: 'startDate', label: 'startDate' },
]);
const EVENT_RECOMMENDED_PROPERTIES = Object.freeze([
  { path: 'description', label: 'description' },
  { path: 'endDate', label: 'endDate' },
  { path: 'eventStatus', label: 'eventStatus' },
  { path: 'image', label: 'image' },
  { path: 'location.name', label: 'location.name' },
  { path: 'offers', label: 'offers' },
  { path: 'organizer', label: 'organizer' },
  { path: 'performer', label: 'performer' },
]);
const BREADCRUMB_LISTITEM_REQUIRED_PROPERTIES = Object.freeze([
  { path: 'position', label: 'position' },
  { path: 'name', label: 'name' },
]);
const LOCAL_BUSINESS_REQUIRED_PROPERTIES = Object.freeze([
  { path: 'name', label: 'name' },
  { path: 'address', label: 'address' },
]);
const LOCAL_BUSINESS_RECOMMENDED_PROPERTIES = Object.freeze([
  { path: 'geo', label: 'geo' },
  { path: 'openingHoursSpecification', label: 'openingHoursSpecification' },
  { path: 'priceRange', label: 'priceRange' },
  { path: 'telephone', label: 'telephone' },
  { path: 'url', label: 'url' },
]);
const DEPRECATED_GOOGLE_RICH_RESULT_TYPES = new Map([
  ['FAQPage', 'Google removed the FAQ rich result feature (changelog entry dated 2026-06-15, deprecation effective 2026-05-07: "Removed documentation for the FAQ rich result feature" — https://developers.google.com/search/updates). This markup is still valid schema.org, but it can no longer produce a Google Search rich result.'],
  ['HowTo', 'Google removed the HowTo rich result feature in 2023 (changelog entry dated 2023-09-14: "Removed the How-to structured data documentation..., as this rich result is no longer shown in search results, on both desktop and mobile devices" — https://developers.google.com/search/updates, announcement: https://developers.google.com/search/blog/2023/08/howto-faq-changes). This markup is still valid schema.org, but it can no longer produce a Google Search rich result.'],
]);

function getByPath(node, path) {
  return path.split('.').reduce((value, segment) => (value && typeof value === 'object' ? value[segment] : undefined), node);
}

function hasRealValue(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function validateEventSchemaProperties(node) {
  const missingRequired = EVENT_REQUIRED_PROPERTIES.filter((p) => !hasRealValue(getByPath(node, p.path))).map((p) => p.label);
  const missingRecommended = EVENT_RECOMMENDED_PROPERTIES.filter((p) => !hasRealValue(getByPath(node, p.path))).map((p) => p.label);
  return { missingRequired, missingRecommended };
}

function validateBreadcrumbListSchemaProperties(node) {
  const items = Array.isArray(node?.itemListElement) ? node.itemListElement : [];
  const missingRequired = [];
  items.forEach((item, index) => {
    const position = index + 1;
    const isLast = position === items.length;
    for (const prop of BREADCRUMB_LISTITEM_REQUIRED_PROPERTIES) {
      if (!hasRealValue(getByPath(item, prop.path))) missingRequired.push(`item ${position} is missing ${prop.label}`);
    }
    if (!isLast && !hasRealValue(item?.item)) missingRequired.push(`item ${position} is missing item (required on every entry except the final one)`);
  });
  if (items.length < 2) missingRequired.push('itemListElement has fewer than 2 items (Google requires at least two ListItems for breadcrumb rich-result eligibility)');
  return { missingRequired };
}

function validateLocalBusinessSchemaProperties(node) {
  const missingRequired = LOCAL_BUSINESS_REQUIRED_PROPERTIES.filter((p) => !hasRealValue(getByPath(node, p.path))).map((p) => p.label);
  const missingRecommended = LOCAL_BUSINESS_RECOMMENDED_PROPERTIES.filter((p) => !hasRealValue(getByPath(node, p.path))).map((p) => p.label);
  return { missingRequired, missingRecommended };
}

function validateSchemaNodeForRichResults(node) {
  const rawType = node?.['@type'];
  const types = Array.isArray(rawType) ? rawType.filter((t) => typeof t === 'string') : (typeof rawType === 'string' ? [rawType] : []);
  const missingRequired = [];
  const missingRecommended = [];
  const deprecatedTypes = [];
  const deprecatedTypeReasons = [];
  for (const type of types) {
    if (type === 'Event') {
      const result = validateEventSchemaProperties(node);
      missingRequired.push(...result.missingRequired);
      missingRecommended.push(...result.missingRecommended);
    } else if (type === 'BreadcrumbList') {
      const result = validateBreadcrumbListSchemaProperties(node);
      missingRequired.push(...result.missingRequired);
    } else if (type === 'NightClub' || type === 'LocalBusiness') {
      const result = validateLocalBusinessSchemaProperties(node);
      missingRequired.push(...result.missingRequired);
      missingRecommended.push(...result.missingRecommended);
    } else if (DEPRECATED_GOOGLE_RICH_RESULT_TYPES.has(type)) {
      deprecatedTypes.push(type);
      deprecatedTypeReasons.push(DEPRECATED_GOOGLE_RICH_RESULT_TYPES.get(type));
    }
  }
  return {
    types,
    missingRequired: [...new Set(missingRequired)],
    missingRecommended: [...new Set(missingRecommended)],
    deprecatedTypes: [...new Set(deprecatedTypes)],
    deprecatedTypeReasons: [...new Set(deprecatedTypeReasons)],
  };
}

function validateSchemaNodesForRichResults(schemaNodes) {
  const perNode = (schemaNodes || []).map((node) => validateSchemaNodeForRichResults(node)).filter((result) => result.types.length > 0);
  return {
    perNode,
    anyMissingRequired: perNode.some((result) => result.missingRequired.length > 0),
    anyMissingRecommended: perNode.some((result) => result.missingRecommended.length > 0),
    anyDeprecatedTypes: perNode.some((result) => result.deprecatedTypes.length > 0),
  };
}

// ---------------------------------------------------------------------------------------
// Schema regression detection (SEO-0607) — ported inline from
// HEIGHTSASTRO/src/lib/seo-schema-diff.js (294 lines, read in full 2026-07-23). Only the
// regression-classification piece; see the module header above for what was left out.
// ---------------------------------------------------------------------------------------
const SCHEMA_REGRESSION_ELIGIBLE_CODES = Object.freeze(['SCHEMA_MISSING_REQUIRED_PROPERTY', 'SCHEMA_DEPRECATED_RICH_RESULT_TYPE']);

function classifySchemaRegression(previousCodesForUrl, currentCodesForUrl, hasPreviousRun) {
  if (!hasPreviousRun) return { isRegression: false, newlyFailingCodes: [] };
  const previousSet = new Set((previousCodesForUrl || []).filter((code) => SCHEMA_REGRESSION_ELIGIBLE_CODES.includes(code)));
  const currentSet = new Set((currentCodesForUrl || []).filter((code) => SCHEMA_REGRESSION_ELIGIBLE_CODES.includes(code)));
  const newlyFailingCodes = [...currentSet].filter((code) => !previousSet.has(code)).sort();
  return { isRegression: newlyFailingCodes.length > 0, newlyFailingCodes };
}

// ---------------------------------------------------------------------------------------
// Hreflang (SEO-0107) — ported inline from HEIGHTSASTRO/src/lib/hreflang.js (296 lines,
// read in full 2026-07-23). Only the crawl-time functions runSeoAudit() needs
// (validateLanguageTag, checkReciprocalHreflang, checkHreflangCanonicalCompatibility,
// buildHreflangClusters); the save-time validateHreflangEntries() is an admin-editor
// concern (no BLVD resource-editor save path exists yet to call it from) and is not
// ported here.
// ---------------------------------------------------------------------------------------
const ALPHA = 'a-zA-Z';
const LANGUAGE_RE = new RegExp(`^(?:[${ALPHA}]{2,3}(?:-[${ALPHA}]{3}){0,3}|[${ALPHA}]{4}|[${ALPHA}]{5,8})$`);
const SCRIPT_RE = new RegExp(`^[${ALPHA}]{4}$`);
const REGION_RE = /^(?:[a-zA-Z]{2}|[0-9]{3})$/;
const VARIANT_RE = /^(?:[a-zA-Z0-9]{5,8}|[0-9][a-zA-Z0-9]{3})$/;
const X_DEFAULT = 'x-default';

function validateLanguageTag(code) {
  if (typeof code !== 'string' || !code.trim()) {
    return { valid: false, reason: 'Hreflang code is empty.' };
  }
  const trimmed = code.trim();
  if (trimmed.toLowerCase() === X_DEFAULT) {
    return { valid: true, isXDefault: true };
  }
  if (/\s/.test(trimmed) || trimmed.includes('_') || trimmed.startsWith('-') || trimmed.endsWith('-') || trimmed.includes('--')) {
    return { valid: false, reason: `"${trimmed}" is not a valid BCP47 language tag (RFC 5646 §2.1).` };
  }
  const subtags = trimmed.split('-');
  const language = subtags.shift();
  if (!LANGUAGE_RE.test(language)) {
    return { valid: false, reason: `"${language}" is not a valid BCP47 primary language subtag (2-8 ALPHA per RFC 5646 §2.1).` };
  }
  let script = null;
  let region = null;
  let cursor = 0;
  if (subtags[cursor] && SCRIPT_RE.test(subtags[cursor])) {
    script = subtags[cursor];
    cursor += 1;
  }
  if (subtags[cursor] && REGION_RE.test(subtags[cursor])) {
    region = subtags[cursor];
    cursor += 1;
  }
  const trailing = subtags.slice(cursor);
  for (const variant of trailing) {
    if (!VARIANT_RE.test(variant)) {
      return { valid: false, reason: `"${variant}" in "${trimmed}" is not a valid BCP47 subtag (RFC 5646 §2.1).` };
    }
  }
  return { valid: true, language: language.toLowerCase(), script, region: region ? region.toUpperCase() : null, isXDefault: false };
}

function normalizeUrl(value) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname.replace(/\/+$/, '') || '/'}`;
  } catch {
    return String(value || '');
  }
}

function checkReciprocalHreflang(entriesByUrl) {
  const broken = [];
  const normalizedIndex = new Map();
  for (const [url, entries] of entriesByUrl.entries()) {
    normalizedIndex.set(normalizeUrl(url), { url, entries: Array.isArray(entries) ? entries : [] });
  }
  for (const [normalizedSelf, { url, entries }] of normalizedIndex.entries()) {
    for (const entry of entries) {
      if (!entry?.url || !entry?.lang) continue;
      const normalizedTarget = normalizeUrl(entry.url);
      if (normalizedTarget === normalizedSelf) continue;
      const target = normalizedIndex.get(normalizedTarget);
      if (!target) continue;
      const pointsBack = target.entries.some((back) => back?.url && normalizeUrl(back.url) === normalizedSelf);
      if (!pointsBack) {
        broken.push({ url, targetUrl: entry.url, lang: entry.lang, reason: `${target.url} does not list ${url} back in its own hreflang set.` });
      }
    }
  }
  return broken;
}

function checkHreflangCanonicalCompatibility(entries, canonicalKeyByNormalizedUrl) {
  const mismatches = [];
  if (!Array.isArray(entries)) return mismatches;
  for (const entry of entries) {
    if (!entry?.url) continue;
    const normalizedTarget = normalizeUrl(entry.url);
    const declaredCanonical = canonicalKeyByNormalizedUrl.get(normalizedTarget);
    if (declaredCanonical && declaredCanonical !== normalizedTarget) {
      mismatches.push({ lang: entry.lang, url: entry.url, declaredCanonical });
    }
  }
  return mismatches;
}

function buildHreflangClusters(entriesByUrl) {
  const parent = new Map();
  const find = (key) => {
    let root = key;
    while (parent.has(root) && parent.get(root) !== root) root = parent.get(root);
    parent.set(key, root);
    return root;
  };
  const union = (a, b) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootA, rootB);
  };
  const allUrls = new Set();
  for (const [url, entries] of entriesByUrl.entries()) {
    const normalizedSelf = normalizeUrl(url);
    allUrls.add(normalizedSelf);
    if (!parent.has(normalizedSelf)) parent.set(normalizedSelf, normalizedSelf);
    for (const entry of Array.isArray(entries) ? entries : []) {
      if (!entry?.url) continue;
      const normalizedTarget = normalizeUrl(entry.url);
      allUrls.add(normalizedTarget);
      if (!parent.has(normalizedTarget)) parent.set(normalizedTarget, normalizedTarget);
      union(normalizedSelf, normalizedTarget);
    }
  }
  const clusters = new Map();
  for (const url of allUrls) {
    const root = find(url);
    if (!clusters.has(root)) clusters.set(root, { urls: [], entries: [] });
    clusters.get(root).urls.push(url);
  }
  for (const [url, entries] of entriesByUrl.entries()) {
    const root = find(normalizeUrl(url));
    const cluster = clusters.get(root);
    if (!cluster) continue;
    for (const entry of Array.isArray(entries) ? entries : []) {
      if (!entry?.url || !entry?.lang) continue;
      cluster.entries.push({ lang: entry.lang, url: entry.url, sourceUrl: url });
    }
  }
  for (const [root, cluster] of clusters.entries()) {
    if (cluster.urls.length < 2) clusters.delete(root);
  }
  return clusters;
}

// ---------------------------------------------------------------------------------------
// SEO-0207 — readability (Flesch/Flesch-Kincaid). Verbatim port, Heights seo-audit.js:669-812.
// Same primary-source citations: Flesch (1948) DOI 10.1037/h0057532; Kincaid, Fishburne,
// Rogers, Chissom (1975), DTIC ADA006655.
// ---------------------------------------------------------------------------------------
const READABILITY_VOWEL_GROUPS = /[aeiouy]+/gi;

function countSyllables(word) {
  const clean = String(word || '').toLowerCase().replace(/[^a-z]/g, '');
  if (!clean) return 0;
  const groups = clean.match(READABILITY_VOWEL_GROUPS) || [];
  let count = groups.length;
  if (clean.endsWith('e') && !clean.endsWith('le') && count > 1) count -= 1;
  return Math.max(count, 1);
}

function splitTextForReadability(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return { sentences: [], words: [] };
  const sentences = trimmed.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  const words = trimmed.split(/\s+/).map((w) => w.replace(/^[^a-zA-Z0-9']+|[^a-zA-Z0-9']+$/g, '')).filter(Boolean);
  return { sentences: sentences.length ? sentences : (words.length ? [trimmed] : []), words };
}

function computeFleschReadingEase(text) {
  const { sentences, words } = splitTextForReadability(text);
  if (!words.length || !sentences.length) return null;
  const syllableCount = words.reduce((sum, word) => sum + countSyllables(word), 0);
  const score = 206.835 - 1.015 * (words.length / sentences.length) - 84.6 * (syllableCount / words.length);
  return { score: Math.round(score * 10) / 10, wordCount: words.length, sentenceCount: sentences.length, syllableCount };
}

function computeFleschKincaidGradeLevel(text) {
  const { sentences, words } = splitTextForReadability(text);
  if (!words.length || !sentences.length) return null;
  const syllableCount = words.reduce((sum, word) => sum + countSyllables(word), 0);
  const gradeLevel = 0.39 * (words.length / sentences.length) + 11.8 * (syllableCount / words.length) - 15.59;
  return { gradeLevel: Math.round(gradeLevel * 10) / 10, wordCount: words.length, sentenceCount: sentences.length, syllableCount };
}

const FLESCH_DIFFICULT_THRESHOLD = 50;

function evaluateReadability(text, language) {
  const primarySubtag = String(language || '').split('-')[0].toLowerCase();
  if (primarySubtag !== 'en') {
    return {
      skipped: true,
      reason: `Declared language "${language || '(none)'}" is not English; the Flesch/Kincaid formulas (Flesch 1948, Kincaid et al. 1975) were derived from and validated against English text, so scoring non-English content would misrepresent it.`,
      language: language || '',
      fleschReadingEase: null, fleschKincaidGradeLevel: null, wordCount: 0, sentenceCount: 0, band: null,
    };
  }
  const ease = computeFleschReadingEase(text);
  const grade = computeFleschKincaidGradeLevel(text);
  if (!ease || !grade) {
    return {
      skipped: true,
      reason: 'Not enough visible text to compute a meaningful sentence/word/syllable ratio.',
      language: language || '', fleschReadingEase: null, fleschKincaidGradeLevel: null, wordCount: 0, sentenceCount: 0, band: null,
    };
  }
  let band;
  if (ease.score >= 90) band = 'Very Easy';
  else if (ease.score >= 80) band = 'Easy';
  else if (ease.score >= 70) band = 'Fairly Easy';
  else if (ease.score >= 60) band = 'Standard';
  else if (ease.score >= 50) band = 'Fairly Difficult';
  else if (ease.score >= 30) band = 'Difficult';
  else band = 'Very Confusing';
  return {
    skipped: false, reason: null, language: language || '',
    fleschReadingEase: ease.score, fleschKincaidGradeLevel: grade.gradeLevel,
    wordCount: ease.wordCount, sentenceCount: ease.sentenceCount, band,
  };
}

// ---------------------------------------------------------------------------------------
// SEO-0207 — accessibility (WCAG/WAI). Verbatim port, Heights seo-audit.js:847-940.
// ---------------------------------------------------------------------------------------
const GENERIC_LINK_PHRASES = new Set([
  'click here', 'click', 'here', 'more', 'read more', 'learn more',
  'more info', 'more information', 'details', 'link', 'this link', 'this page',
]);
const FILENAME_LIKE_ALT = /\.(jpe?g|png|gif|webp|svg|avif|bmp)(\?.*)?$/i;
const GENERIC_ALT_WORDS = new Set(['image', 'photo', 'picture', 'img', 'graphic', 'icon']);

function evaluateImageAltQuality(imageAltEvidence) {
  const findings = [];
  for (const entry of imageAltEvidence) {
    if (!entry.hasAlt) continue;
    const alt = String(entry.alt || '').trim();
    if (!alt) continue;
    if (FILENAME_LIKE_ALT.test(alt)) {
      findings.push({ src: entry.src, alt, reason: 'Alt text looks like a filename, not a description of the image content.' });
      continue;
    }
    if (GENERIC_ALT_WORDS.has(alt.toLowerCase())) {
      findings.push({ src: entry.src, alt, reason: 'Alt text is a generic placeholder word, not a description of the image content.' });
    }
  }
  return findings;
}

function evaluateLinkText(linkTextEvidence) {
  const findings = [];
  for (const entry of linkTextEvidence) {
    if (entry.ariaLabel && entry.ariaLabel.trim()) continue;
    const text = String(entry.visibleText || '').trim();
    if (!text) {
      findings.push({ href: entry.href, visibleText: text, reason: 'Link has no visible text and no aria-label — its purpose cannot be determined from the link alone.' });
      continue;
    }
    const normalized = text.toLowerCase().replace(/\s+/g, ' ');
    if (GENERIC_LINK_PHRASES.has(normalized)) {
      findings.push({ href: entry.href, visibleText: text, reason: `Link text "${text}" is a generic phrase WAI explicitly advises against ("Avoid using 'click here' or 'more'").` });
      continue;
    }
    if (/^https?:\/\//i.test(text) || /^www\./i.test(text)) {
      findings.push({ href: entry.href, visibleText: text, reason: 'Link text is a bare URL, which is not a description of the link\'s purpose or destination.' });
    }
  }
  return findings;
}

function evaluateFormLabels(formControlEvidence) {
  return formControlEvidence
    .filter((entry) => !entry.hasForLabel && !entry.hasWrappingLabel && !entry.hasAriaLabel && !entry.hasAriaLabelledby)
    .map((entry) => ({ tagName: entry.tagName, type: entry.type, id: entry.id }));
}

// ---------------------------------------------------------------------------------------
// SEO-0106/SEO-0204 — duplicate/near-duplicate content. Verbatim port, Heights
// seo-audit.js:942-1092 (Broder 1997/2000 shingle-set Jaccard resemblance).
// ---------------------------------------------------------------------------------------
function clusterByKey(entries) {
  const byKey = new Map();
  for (const { key, url } of entries) {
    if (!key) continue;
    byKey.set(key, [...(byKey.get(key) || []), url]);
  }
  for (const [key, urls] of byKey.entries()) {
    if (urls.length < 2) byKey.delete(key);
  }
  return byKey;
}

function normalizeVisibleText(html) {
  return stripVisibleText(html).toLowerCase();
}

function shingleText(normalizedText, size = 5) {
  const tokens = normalizedText.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return new Set();
  if (tokens.length <= size) return new Set([tokens.join(' ')]);
  const shingles = new Set();
  for (let i = 0; i <= tokens.length - size; i += 1) {
    shingles.add(tokens.slice(i, i + size).join(' '));
  }
  return shingles;
}

function jaccardSimilarity(setA, setB) {
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersectionSize = 0;
  const [smaller, larger] = setA.size <= setB.size ? [setA, setB] : [setB, setA];
  for (const shingle of smaller) {
    if (larger.has(shingle)) intersectionSize += 1;
  }
  const unionSize = setA.size + setB.size - intersectionSize;
  return unionSize === 0 ? 1 : intersectionSize / unionSize;
}

function findNearDuplicateContentPairs(pages, threshold = 0.6, shingleSize = 5) {
  const withShingles = pages
    .filter((page) => page.normalizedText && page.normalizedText.length > 0)
    .map((page) => ({ ...page, shingles: shingleText(page.normalizedText, shingleSize) }));
  const pairs = [];
  for (let i = 0; i < withShingles.length; i += 1) {
    for (let j = i + 1; j < withShingles.length; j += 1) {
      const pageA = withShingles[i];
      const pageB = withShingles[j];
      const similarity = jaccardSimilarity(pageA.shingles, pageB.shingles);
      if (similarity >= threshold && similarity < 1) {
        const overlap = [...pageA.shingles].filter((shingle) => pageB.shingles.has(shingle));
        pairs.push({
          urlA: pageA.url, urlB: pageB.url,
          similarity: Math.round(similarity * 1000) / 1000,
          sampleOverlap: overlap.slice(0, 5),
          lengthA: pageA.normalizedText.length, lengthB: pageB.normalizedText.length,
        });
      }
    }
  }
  return pairs;
}

// ---------------------------------------------------------------------------------------
// SEO-0205 — query-intent/cannibalization overlap. Verbatim port, Heights
// seo-audit.js:1095-1147. Added post-merge: this was originally omitted from the
// deferral list at this file's own header (lines 108-119) even though it has zero
// unmet dependency — targetQueryNotes is a real seo_resources column (confirmed in
// backend/lib/seo-resources.js's SEO_RESOURCE_COLUMNS) and findNearDuplicateContentPairs()
// (the only primitive it needs) already exists above. Compares every pair of
// resources' admin-authored targetQueryNotes free-text field for overlapping stated
// search intent — a REAL, non-fabricated signal (an admin's own typed note, not
// invented keyword/ranking data), using the same shingle/Jaccard primitive as the
// near-duplicate title/description/heading passes above. Resources with no
// targetQueryNotes (the common case until an admin fills the field in) are excluded
// up front so two blank notes are never reported as "100% identical intent."
// ---------------------------------------------------------------------------------------
function findQueryIntentOverlaps(resources, threshold = 0.6) {
  const withNotes = resources
    .filter((resource) => resource.targetQueryNotes && String(resource.targetQueryNotes).trim())
    .map((resource) => ({
      url: resource.path,
      note: String(resource.targetQueryNotes).trim(),
      normalizedText: String(resource.targetQueryNotes).trim().toLowerCase(),
    }));
  const noteByUrl = new Map(withNotes.map((entry) => [entry.url, entry.note]));
  const pairs = findNearDuplicateContentPairs(withNotes, threshold, 2);
  return pairs.map((pair) => ({
    urlA: pair.urlA,
    urlB: pair.urlB,
    similarity: pair.similarity,
    sampleOverlap: pair.sampleOverlap,
    noteA: noteByUrl.get(pair.urlA) || '',
    noteB: noteByUrl.get(pair.urlB) || '',
  }));
}

// ---------------------------------------------------------------------------------------
// SEO-0106/SEO-0406 — canonical chains and crawl depth. Verbatim port, Heights
// seo-audit.js:1398-1444.
// ---------------------------------------------------------------------------------------
function findCanonicalChain(canonicalKeyByPath, startPath, maxDepth = 25) {
  const visited = new Set([startPath]);
  const chain = [startPath];
  let cursor = canonicalKeyByPath.get(startPath);
  let loopFound = false;
  while (typeof cursor === 'string') {
    chain.push(cursor);
    if (cursor.startsWith('external:') || cursor.startsWith('invalid:')) break;
    if (visited.has(cursor)) { loopFound = true; break; }
    visited.add(cursor);
    const next = canonicalKeyByPath.get(cursor);
    if (next === undefined) break;
    if (next === cursor) break;
    if (chain.length > maxDepth) { loopFound = true; break; }
    cursor = next;
  }
  return { chain, loopFound };
}

function computeCrawlDepths(adjacency, startPath) {
  const depthByPath = new Map();
  if (!adjacency.has(startPath)) return depthByPath;
  depthByPath.set(startPath, 0);
  const queue = [startPath];
  while (queue.length) {
    const current = queue.shift();
    const currentDepth = depthByPath.get(current);
    for (const next of adjacency.get(current) || []) {
      if (!depthByPath.has(next)) {
        depthByPath.set(next, currentDepth + 1);
        queue.push(next);
      }
    }
  }
  return depthByPath;
}

// ---------------------------------------------------------------------------------------
// SEO-0408 — pagination/parameter/faceted-navigation crawl-trap heuristic. Verbatim port,
// Heights seo-audit.js:1489-1554 (disclosed non-Google-sourced defensive heuristic).
// ---------------------------------------------------------------------------------------
const URL_TRAP_MAX_SAFE_PARAM_COUNT = 2;
const URL_TRAP_SUSPECT_PARAM_NAMES = new Set([
  'page', 'p', 'offset', 'start', 'filter', 'facet', 'facets', 'tag', 'tags',
  'category', 'sort', 'sortby', 'sort_by', 'view', 'q', 'search', 'query',
]);

function evaluateUrlTrapRisk(url) {
  let searchParams;
  try {
    searchParams = new URL(String(url || ''), 'https://placeholder.invalid').searchParams;
  } catch {
    return { isSuspectedTrap: false, paramCount: 0, suspectParams: [], reasons: [] };
  }
  const paramNames = [...searchParams.keys()];
  const paramCount = paramNames.length;
  const suspectParams = paramNames.filter((name) => URL_TRAP_SUSPECT_PARAM_NAMES.has(name.toLowerCase()));
  const reasons = [];
  if (paramCount > URL_TRAP_MAX_SAFE_PARAM_COUNT) {
    reasons.push(`URL carries ${paramCount} query parameters, more than this project's defensive safety threshold of ${URL_TRAP_MAX_SAFE_PARAM_COUNT} (a disclosed heuristic, not a Google-published number).`);
  }
  if (suspectParams.length >= 2) {
    reasons.push(`URL combines ${suspectParams.length} pagination/faceted-style parameters (${suspectParams.join(', ')}), the same "large number of possible combinations of filters" pattern Google's faceted-navigation guidance describes as generating a very large/infinite URL space.`);
  }
  return { isSuspectedTrap: reasons.length > 0, paramCount, suspectParams, reasons };
}

// ---------------------------------------------------------------------------------------
// SEO-0605 (adapted subset) — Event schema-vs-database truthfulness. Adapted from
// HEIGHTSASTRO/src/lib/seo-content-consistency.js's evaluateEventSchemaAgainstDatabase()
// (read in full 2026-07-23) to BLVD's real `events` table shape (title/date/status —
// confirmed via backend/init-db.js — no djName/performer column exists on BLVD's events
// table, so the Heights version's performer/organizer entity-truthfulness check is not
// ported; see module header for the full disclosure).
// ---------------------------------------------------------------------------------------
function evaluateEventSchemaAgainstDatabase(schemaNode, dbEvent, todayIso) {
  const result = { nameMismatch: null, dateMismatch: null, staleScheduledEvent: null };
  if (!schemaNode || typeof schemaNode !== 'object' || !dbEvent) return result;

  const schemaName = String(schemaNode.name || '').trim();
  const dbName = String(dbEvent.title || '').trim();
  if (schemaName && dbName && schemaName !== dbName) {
    result.nameMismatch = { schemaValue: schemaName, dbValue: dbName };
  }

  const schemaDate = String(schemaNode.startDate || '').trim().slice(0, 10);
  const dbDate = String(dbEvent.date || '').trim();
  if (schemaDate && dbDate && schemaDate !== dbDate) {
    result.dateMismatch = { schemaValue: schemaDate, dbValue: dbDate };
  }

  const eventStatusValue = String(schemaNode.eventStatus || '');
  const declaresScheduled = eventStatusValue.includes('EventScheduled');
  const dbIsCancelled = ['cancelled', 'completed'].includes(String(dbEvent.status || ''));
  if (declaresScheduled && !dbIsCancelled && dbDate && todayIso && dbDate < todayIso) {
    result.staleScheduledEvent = { schemaStartDate: schemaDate || dbDate, clubDateIso: todayIso };
  }

  return result;
}

// ---------------------------------------------------------------------------------------
// runSeoAudit() — the crawl engine itself. Adapted from Heights seo-audit.js:1953-3079.
// ---------------------------------------------------------------------------------------

function fingerprint(entry) {
  return crypto.createHash('sha256').update(`${entry.code}\n${entry.url}`).digest('hex');
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

// Adapted: reads BLVD's own seo_site_settings.canonicalOrigin (via getSeoSiteSettings())
// then SEO_AUDIT_BASE_URL / FRONTEND_URL / SITE_URL env vars, falling back to BLVD's real
// production origin 'https://blvdpark.com' (confirmed backend/server.js:120's
// siteUrlBase() default) instead of Heights' heightssocialhtx.com default.
function configuredAuditOrigin(db) {
  const settings = getSeoSiteSettings(db) || {};
  const configured = process.env.SEO_AUDIT_BASE_URL || settings.canonicalOrigin || process.env.FRONTEND_URL || process.env.SITE_URL || 'https://blvdpark.com';
  const url = new URL(configured);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('SEO audit origin must use HTTP or HTTPS.');
  if (url.username || url.password) throw new Error('SEO audit origin cannot contain credentials.');
  return url.origin;
}

const AUDIT_USER_AGENT = 'BLVDPark-SEO-Audit/1.0';

// Live, on-demand Open Graph / Twitter Card verification for exactly one path. Adapted
// from Heights' verifySocialTagsLive(); same behavior, BLVD user-agent string.
async function verifySocialTagsLive(db, path, expected = {}) {
  const baseUrl = configuredAuditOrigin(db);
  const url = new URL(path, baseUrl).href;
  const checkedAt = new Date().toISOString();
  let response;
  let body = '';
  try {
    response = await fetchWithTimeout(url, { redirect: 'manual', headers: { 'user-agent': AUDIT_USER_AGENT } });
    body = await response.text();
  } catch (error) {
    return { ok: false, url, statusCode: null, fetchError: error.message, rendered: null, evaluation: null, checkedAt };
  }
  if (response.status !== 200) {
    return { ok: false, url, statusCode: response.status, fetchError: `Expected HTTP 200; received ${response.status}.`, rendered: null, evaluation: null, checkedAt };
  }
  const rendered = extractSocialTags(body);
  const evaluation = evaluateSocialTags(rendered, expected);
  return { ok: evaluation.valid, url, statusCode: response.status, fetchError: null, rendered, evaluation, checkedAt };
}

// Real, live broken-source-link check for stored seo_citations rows. Adapted from
// Heights' checkCitationSources(); the seo_citations table exists in BLVD's schema
// (backend/lib/seo-schema.js) with camelCase columns identical to Heights', but no CRUD
// layer creates rows yet (see module header) — this will simply find zero rows until one
// is built, which is the honest behavior, not a stub.
async function checkCitationSources(db, citations) {
  const list = Array.isArray(citations)
    ? citations
    : db.prepare('SELECT * FROM seo_citations WHERE isActive = 1').all();
  const checkedAt = new Date().toISOString();
  const results = [];
  const byUrl = new Map();
  for (const citation of list) {
    if (!byUrl.has(citation.sourceUrl)) byUrl.set(citation.sourceUrl, []);
    byUrl.get(citation.sourceUrl).push(citation);
  }
  for (const [sourceUrl, rows] of byUrl.entries()) {
    let status = 'ok';
    let statusCode = null;
    let errorMessage = null;
    try {
      let response = await fetchWithTimeout(sourceUrl, { method: 'HEAD', redirect: 'follow', headers: { 'user-agent': AUDIT_USER_AGENT } });
      if (response.status === 405 || response.status === 501) {
        response = await fetchWithTimeout(sourceUrl, { method: 'GET', redirect: 'follow', headers: { 'user-agent': AUDIT_USER_AGENT } });
      }
      statusCode = response.status;
      if (response.status >= 400) status = 'broken';
    } catch (error) {
      status = 'error';
      errorMessage = error.message;
    }
    for (const citation of rows) {
      try {
        db.prepare('UPDATE seo_citations SET lastVerifiedAt = ?, lastVerifiedStatus = ?, lastVerifiedStatusCode = ? WHERE id = ?')
          .run(checkedAt, status, statusCode, citation.id);
      } catch (_e) { /* best-effort — citation row may have been removed mid-run */ }
      results.push({ id: citation.id, seoResourceId: citation.seoResourceId, sourceUrl, sourceName: citation.sourceName, status, statusCode, error: errorMessage });
    }
  }
  return { checkedAt, results };
}

// Builds link-inventory rows for one already-crawled page. Verbatim port of Heights'
// buildLinkInventoryRows(), Heights seo-audit.js:1728-1800.
function buildLinkInventoryRows(check, baseUrl, knownByUrl, canonicalKeyByPath) {
  const rows = [];
  const evidence = check?.analysis?.linkInventoryEvidence || [];
  for (const link of evidence) {
    if (link.isMalformed) {
      rows.push({
        sourceUrl: check.url, destinationUrl: null, isExternal: false,
        anchorText: link.visibleText, context: link.context,
        relNofollow: link.relNofollow, relSponsored: link.relSponsored, relUgc: link.relUgc,
        relRaw: link.relTokens.join(' '), canonicalDestination: null, status: 'malformed',
      });
      continue;
    }
    let destination;
    try { destination = new URL(link.destinationUrl); } catch { continue; }
    const isExternal = destination.origin !== baseUrl;
    let status = 'unknown';
    let canonicalDestination = null;
    if (isExternal) {
      status = 'external-unchecked';
    } else {
      const key = destination.pathname.replace(/\/+$/, '') || '/';
      const target = knownByUrl.get(key);
      if (!target) {
        status = 'unknown';
      } else if (target.statusCode >= 300 && target.statusCode < 400) {
        status = 'redirect';
      } else if (target.statusCode >= 400 || target.statusCode === 0) {
        status = 'broken';
      } else {
        status = 'live';
      }
      const declaredKey = canonicalKeyByPath.get(key);
      if (declaredKey && !declaredKey.startsWith('external:') && !declaredKey.startsWith('invalid:')) {
        canonicalDestination = `${baseUrl}${declaredKey === '/' ? '' : declaredKey}`;
      } else if (declaredKey && declaredKey.startsWith('external:')) {
        canonicalDestination = declaredKey.slice('external:'.length);
      }
    }
    rows.push({
      sourceUrl: check.url, destinationUrl: destination.href, isExternal,
      anchorText: link.visibleText, context: link.context,
      relNofollow: link.relNofollow, relSponsored: link.relSponsored, relUgc: link.relUgc,
      relRaw: link.relTokens.join(' '), canonicalDestination, status,
    });
  }
  return rows;
}

/**
 * Runs a full (or scoped) live-site SEO crawl. Single entry point for both the admin
 * panel's manual "Run audit" trigger and any future scheduler — the SEO-0501
 * bounding/concurrency/cancellation/history behavior applies identically to every caller.
 * @param {import('better-sqlite3').Database} db
 * @param {{id?:string|number, username?:string, email?:string}} [actor]
 * @param {{triggerType?:'manual'|'scheduled', scopeType?:'all'|'prefix', scopePrefix?:string|null, maxPages?:number, maxDurationMs?:number}} [options]
 */
async function runSeoAudit(db, actor = {}, options = {}) {
  const triggerType = options.triggerType === 'scheduled' ? 'scheduled' : 'manual';
  const scopeType = options.scopeType === 'prefix' ? 'prefix' : 'all';
  const scopePrefix = scopeType === 'prefix' ? String(options.scopePrefix || '') : null;
  if (scopeType === 'prefix' && !scopePrefix.startsWith('/')) throw new Error('scopePrefix must start with "/" when scopeType is "prefix".');
  const maxPages = Number.isInteger(options.maxPages) && options.maxPages > 0 ? options.maxPages : 500;
  const maxDurationMs = Number.isInteger(options.maxDurationMs) && options.maxDurationMs > 0 ? options.maxDurationMs : 600000;

  if (activeCrawlLock) {
    db.prepare(`
      INSERT INTO seo_crawl_runs (triggerType, status, scopeType, scopePrefix, maxPages, maxDurationMs, createdBy)
      VALUES (?, 'rejected_concurrent', ?, ?, ?, ?, ?)
    `).run(triggerType, scopeType, scopePrefix, maxPages, maxDurationMs, actor.username || actor.email || actor.id || 'admin');
    throw Object.assign(new Error('A crawl is already running. Wait for it to finish or cancel it before starting another.'), { status: 409, code: 'CRAWL_ALREADY_RUNNING' });
  }

  const runId0 = new Date().toISOString();
  const startedAtMs = Date.now();
  const baseUrl = configuredAuditOrigin(db);

  const previousCompletedRun = db.prepare("SELECT id, completedAt FROM seo_audit_runs WHERE status = 'completed' ORDER BY startedAt DESC LIMIT 1").get();
  const hasPreviousSchemaRun = !!previousCompletedRun;
  const previousSchemaCodesByUrl = new Map();
  if (previousCompletedRun) {
    const previousSchemaIssues = db.prepare(
      `SELECT url, code FROM seo_issues WHERE runId = ? AND code IN (${SCHEMA_REGRESSION_ELIGIBLE_CODES.map(() => '?').join(', ')})`
    ).all(previousCompletedRun.id, ...SCHEMA_REGRESSION_ELIGIBLE_CODES);
    for (const row of previousSchemaIssues) {
      if (!previousSchemaCodesByUrl.has(row.url)) previousSchemaCodesByUrl.set(row.url, []);
      previousSchemaCodesByUrl.get(row.url).push(row.code);
    }
  }

  const runInsert = db.prepare(`
    INSERT INTO seo_audit_runs (baseUrl, status, triggerType, scopeType, scopePrefix, maxPages, maxDurationMs, startedAt, totalUrls, issueCount, createdBy)
    VALUES (?, 'running', ?, ?, ?, ?, ?, ?, 0, 0, ?)
  `).run(baseUrl, triggerType, scopeType, scopePrefix, maxPages, maxDurationMs, runId0, actor.username || actor.email || actor.id || 'admin');
  const runId = runInsert.lastInsertRowid;

  const crawlRunInsert = db.prepare(`
    INSERT INTO seo_crawl_runs (auditRunId, triggerType, status, scopeType, scopePrefix, maxPages, maxDurationMs, createdBy)
    VALUES (?, ?, 'running', ?, ?, ?, ?, ?)
  `).run(runId, triggerType, scopeType, scopePrefix, maxPages, maxDurationMs, actor.username || actor.email || actor.id || 'admin');
  const crawlRunId = crawlRunInsert.lastInsertRowid;

  activeCrawlLock = { crawlRunId, startedAt: startedAtMs, cancelRequested: false };

  function isPastDeadline() { return Date.now() - startedAtMs > maxDurationMs; }
  function checkCancellation() {
    if (activeCrawlLock?.cancelRequested) throw new CrawlCancelledError();
  }

  let wasBounded = false;

  try {
    let resources = listSeoResources(db).filter((resource) => resource.isActive && !resource.path.startsWith('/admin') && !resource.path.startsWith('/api'));
    if (scopeType === 'prefix') {
      resources = resources.filter((resource) => resource.path === scopePrefix || resource.path.startsWith(`${scopePrefix.replace(/\/+$/, '')}/`));
    }
    if (resources.length > maxPages) {
      wasBounded = true;
      resources = resources.slice(0, maxPages);
    }
    const checks = [];
    const issues = [];

    const redirects = db.prepare('SELECT fromPath, toPath, statusCode FROM redirects WHERE isActive = 1').all();
    const redirectMap = new Map(redirects.map((redirect) => [redirect.fromPath, redirect]));
    for (const redirect of redirects) {
      const visited = new Set([redirect.fromPath]);
      const chain = [redirect.fromPath];
      let cursor = redirect.toPath;
      while (typeof cursor === 'string' && cursor.startsWith('/')) {
        const p = new URL(cursor, baseUrl).pathname;
        chain.push(p);
        if (visited.has(p)) {
          issues.push(issue('REDIRECT_LOOP', 'redirects', 'critical', new URL(redirect.fromPath, baseUrl).href, 'Redirect loop detected', chain.join(' → '), 'Deactivate or retarget one redirect in the loop before deployment.'));
          break;
        }
        visited.add(p);
        const next = redirectMap.get(p);
        if (!next) break;
        cursor = next.toPath;
        if (chain.length > 25) {
          issues.push(issue('REDIRECT_LOOP', 'redirects', 'critical', new URL(redirect.fromPath, baseUrl).href, 'Redirect chain exceeds safety limit', chain.join(' → '), 'Shorten the chain and check for a loop.'));
          break;
        }
      }
      if (chain.length > 2 && !issues.some((entry) => entry.code === 'REDIRECT_LOOP' && entry.url === new URL(redirect.fromPath, baseUrl).href)) {
        issues.push(issue('REDIRECT_CHAIN', 'redirects', 'warning', new URL(redirect.fromPath, baseUrl).href, 'Redirect chain detected', chain.join(' → '), 'Point the original redirect directly at the final canonical URL.'));
      }
    }

    for (const resource of resources) {
      checkCancellation();
      if (isPastDeadline()) { wasBounded = true; break; }
      const url = new URL(resource.path, baseUrl).href;
      const requestStarted = performance.now();
      let response;
      let body = '';
      try {
        response = await fetchWithTimeout(url, { redirect: 'manual', headers: { 'user-agent': AUDIT_USER_AGENT } });
        body = await response.text();
      } catch (error) {
        const responseTimeMs = Math.round(performance.now() - requestStarted);
        checks.push({ resource, url, statusCode: 0, contentType: '', responseTimeMs, responseBytes: 0, analysis: null, error: error.message });
        issues.push(issue('FETCH_FAILED', 'crawl', 'critical', url, 'URL could not be fetched', error.message, 'Confirm DNS, TLS, uptime, and that the configured audit origin is reachable.'));
        continue;
      }

      const responseTimeMs = Math.round(performance.now() - requestStarted);
      const contentType = response.headers.get('content-type') || '';
      const isHtml = contentType.includes('text/html');
      const analysis = isHtml ? analyzeHtml(body, url) : null;
      const check = {
        resource, url, statusCode: response.status, contentType, responseTimeMs,
        responseBytes: Buffer.byteLength(body), analysis,
        location: response.headers.get('location') || '',
        xRobotsTag: response.headers.get('x-robots-tag') || '',
      };
      checks.push(check);

      if (resource.indexState === 'index' && response.status !== 200) {
        issues.push(issue('INDEXABLE_NON_200', 'indexing', 'critical', url, 'Indexable URL does not return 200', `Expected 200; received ${response.status}${check.location ? ` to ${check.location}` : ''}.`, 'Restore a 200 response or change the intended index state before deployment.'));
      }
      if (resource.httpStatus !== response.status && !(resource.httpStatus === 200 && response.status >= 300 && response.status < 400)) {
        issues.push(issue('STATUS_MISMATCH', 'indexing', 'warning', url, 'Live HTTP status differs from intended status', `Intended ${resource.httpStatus}; received ${response.status}.`, 'Review the resource status or server route behavior.'));
      }
      if (response.status >= 300 && response.status < 400 && !check.location) {
        issues.push(issue('REDIRECT_WITHOUT_LOCATION', 'redirects', 'critical', url, 'Redirect is missing a Location header', `HTTP ${response.status} returned without Location.`, 'Add a valid redirect target.'));
      }
      if (responseTimeMs > 1200) {
        issues.push(issue('SLOW_TTFB', 'performance', responseTimeMs > 2500 ? 'critical' : 'warning', url, 'Slow server response', `Response completed in ${responseTimeMs} ms.`, 'Inspect origin latency, database work, caching, and third-party dependencies.'));
      }
      const trapRisk = evaluateUrlTrapRisk(resource.path);
      if (trapRisk.isSuspectedTrap) {
        issues.push(issue('SUSPECTED_URL_TRAP', 'crawl', 'warning', url, 'URL shape resembles a pagination/parameter/faceted crawl trap', trapRisk.reasons.join(' '), 'Give each paginated/filtered variant its own canonical rather than pointing it at the first/unfiltered page, or block the parameter combination in robots.txt if it has no unique indexable value.'));
      }
      if (!analysis) continue;

      const combinedRobots = `${analysis.robots},${check.xRobotsTag}`.toLowerCase();
      if (!analysis.title) issues.push(issue('MISSING_TITLE', 'content', 'critical', url, 'Missing title element', 'No rendered <title> was found.', 'Add a unique, descriptive title to the rendered HTML.'));
      if (!analysis.description) issues.push(issue('MISSING_DESCRIPTION', 'content', 'warning', url, 'Missing meta description', 'No rendered meta description was found.', 'Add a useful page-specific description.'));
      if (analysis.h1Count !== 1) issues.push(issue('H1_COUNT', 'content', 'warning', url, 'Page does not have exactly one H1', `Rendered H1 count: ${analysis.h1Count}.`, 'Expose one clear primary H1 and use lower heading levels for subsections.'));

      const { emptyHeadings, skippedLevels } = evaluateHeadingOutline(analysis.headings);
      for (const empty of emptyHeadings) {
        issues.push(issue('EMPTY_HEADING', 'content', 'warning', url, `Empty H${empty.level} heading found`, `An <h${empty.level}> element has no visible text.`, 'Add descriptive visible text to every heading, or remove the empty heading element.'));
      }
      for (const skip of skippedLevels) {
        issues.push(issue('SKIPPED_HEADING_LEVEL', 'content', 'warning', url, 'Heading levels are skipped', `An H${skip.toLevel} follows an H${skip.fromLevel} with no intermediate level(s) used.`, `Use H${skip.fromLevel + 1} before H${skip.toLevel} so the outline is not skipping levels.`));
      }
      if (resource.indexState === 'index' && !analysis.canonical) issues.push(issue('MISSING_CANONICAL', 'canonical', 'warning', url, 'Indexable page has no canonical', 'No rendered canonical link was found.', 'Render a self-canonical or an intentional canonical override.'));
      if (analysis.canonical) {
        try {
          const declared = new URL(analysis.canonical, url);
          if (declared.protocol !== 'https:' && baseUrl.startsWith('https:')) issues.push(issue('INSECURE_CANONICAL', 'canonical', 'warning', url, 'Canonical does not use HTTPS', declared.href, 'Use the production HTTPS canonical origin.'));
          if (declared.origin !== baseUrl) issues.push(issue('CROSS_DOMAIN_CANONICAL', 'canonical', 'warning', url, 'Canonical points to a different domain', `Page origin ${baseUrl} declares canonical ${declared.href}.`, 'Confirm this cross-domain canonical is intentional (e.g. syndicated content). If not, point the canonical back at this domain.'));
        } catch {
          issues.push(issue('INVALID_CANONICAL', 'canonical', 'critical', url, 'Canonical URL is invalid', analysis.canonical, 'Correct the rendered canonical URL.'));
        }
      }
      if (resource.indexState === 'index' && combinedRobots.includes('noindex')) issues.push(issue('ROBOTS_CONFLICT', 'indexing', 'critical', url, 'Indexability conflicts with live robots directives', combinedRobots, 'Align the admin index state with the rendered meta/header directives.'));
      if (resource.indexState === 'noindex' && !combinedRobots.includes('noindex')) issues.push(issue('NOINDEX_NOT_RENDERED', 'indexing', 'critical', url, 'Intended noindex is not present in the live response', combinedRobots || 'No robots directive found.', 'Render noindex in HTML or X-Robots-Tag.'));
      if (resource.nosnippet && !combinedRobots.includes('nosnippet')) issues.push(issue('NOSNIPPET_NOT_RENDERED', 'indexing', 'warning', url, 'Intended nosnippet is not present', combinedRobots || 'No robots directive found.', 'Render the saved snippet directive.'));
      if (resource.maxSnippet !== null && resource.maxSnippet !== undefined && !combinedRobots.includes(`max-snippet:${Number(resource.maxSnippet)}`)) {
        issues.push(issue('MAX_SNIPPET_NOT_RENDERED', 'indexing', 'warning', url, 'Intended max-snippet value is not present', combinedRobots || 'No robots directive found.', 'Render the saved max-snippet directive in meta robots or X-Robots-Tag.'));
      }
      if (resource.maxImagePreview && !combinedRobots.includes(`max-image-preview:${resource.maxImagePreview}`)) {
        issues.push(issue('MAX_IMAGE_PREVIEW_NOT_RENDERED', 'indexing', 'warning', url, 'Intended max-image-preview value is not present', combinedRobots || 'No robots directive found.', 'Render the saved max-image-preview directive in meta robots or X-Robots-Tag.'));
      }
      if (resource.maxVideoPreview !== null && resource.maxVideoPreview !== undefined && !combinedRobots.includes(`max-video-preview:${Number(resource.maxVideoPreview)}`)) {
        issues.push(issue('MAX_VIDEO_PREVIEW_NOT_RENDERED', 'indexing', 'warning', url, 'Intended max-video-preview value is not present', combinedRobots || 'No robots directive found.', 'Render the saved max-video-preview directive in meta robots or X-Robots-Tag.'));
      }
      if (Array.isArray(resource.googlebotDirectives) && resource.googlebotDirectives.length) {
        const renderedGooglebot = (analysis.googlebot || '').toLowerCase();
        const missing = resource.googlebotDirectives.filter((directive) => !renderedGooglebot.includes(String(directive).toLowerCase()) && !combinedRobots.includes(String(directive).toLowerCase()));
        if (missing.length) issues.push(issue('GOOGLEBOT_DIRECTIVE_NOT_RENDERED', 'indexing', 'warning', url, 'Intended Googlebot-only directive is not present', `Missing: ${missing.join(', ')}. Rendered googlebot meta: ${analysis.googlebot || '(none)'}.`, 'Confirm the <meta name="googlebot"> tag renders every saved Googlebot-only directive.'));
      }
      if (Array.isArray(resource.dataNosnippetSelectors) && resource.dataNosnippetSelectors.length && !analysis.hasDataNosnippet) {
        issues.push(issue('DATA_NOSNIPPET_REQUIRES_BROWSER_CRAWL', 'indexing', 'info', url, 'data-nosnippet cannot be verified by this raw-HTML crawler', `${resource.dataNosnippetSelectors.length} selector(s) configured. This attribute is applied by client-side script after page load, so it never appears in the server's raw HTML — this crawler only fetches raw HTML.`, 'No action needed unless a separate browser-rendered check fails.'));
      }
      if (analysis.schemaErrors.length) issues.push(issue('INVALID_JSON_LD', 'structured-data', 'critical', url, 'Rendered JSON-LD is invalid', analysis.schemaErrors.join('; '), 'Fix the JSON-LD syntax and rerun validation.'));
      if (!analysis.schemaCount && resource.indexState === 'index') issues.push(issue('MISSING_JSON_LD', 'structured-data', 'warning', url, 'Indexable page has no JSON-LD', 'No application/ld+json script was found.', 'Add truthful schema that matches visible page content.'));

      const breadcrumbCheck = evaluateBreadcrumbConsistency(analysis.breadcrumbs);
      if (breadcrumbCheck.schemaWithoutVisible) {
        issues.push(issue('BREADCRUMB_SCHEMA_WITHOUT_VISIBLE', 'structured-data', 'critical', url, 'BreadcrumbList schema has no matching visible breadcrumb trail', 'BreadcrumbList JSON-LD was found, but no visible <nav aria-label="Breadcrumb"> trail was rendered on this page.', 'Render a visible breadcrumb trail matching the structured data, or remove the BreadcrumbList markup.'));
      }
      if (breadcrumbCheck.visibleWithoutSchema) {
        issues.push(issue('BREADCRUMB_VISIBLE_WITHOUT_SCHEMA', 'structured-data', 'warning', url, 'Visible breadcrumb trail has no matching BreadcrumbList schema', 'A visible breadcrumb trail was rendered, but no BreadcrumbList JSON-LD was found on this page.', 'Add BreadcrumbList structured data matching the visible trail to become eligible for breadcrumb rich results.'));
      }
      if (breadcrumbCheck.countMismatch) {
        issues.push(issue('BREADCRUMB_COUNT_MISMATCH', 'structured-data', 'critical', url, 'Visible breadcrumb count does not match schema item count', `Visible trail has ${analysis.breadcrumbs.visible.length} item(s); BreadcrumbList schema has ${analysis.breadcrumbs.schemaItems.length} item(s).`, 'Make the visible breadcrumb trail and the BreadcrumbList schema list the exact same items.'));
      }
      for (const mismatch of breadcrumbCheck.labelMismatches) {
        issues.push(issue('BREADCRUMB_LABEL_MISMATCH', 'structured-data', 'warning', url, 'Breadcrumb label does not match its schema name', `Position ${mismatch.position}: visible text "${mismatch.visibleText}" but schema name "${mismatch.schemaName}".`, 'Use the exact same label in the visible breadcrumb and its corresponding BreadcrumbList ListItem name.'));
      }
      for (const malformed of breadcrumbCheck.malformedSchemaItems) {
        issues.push(issue('BREADCRUMB_SCHEMA_MALFORMED', 'structured-data', 'critical', url, 'BreadcrumbList ListItem is malformed', `Position ${malformed.position ?? '(missing)'}: ${malformed.issue}`, 'Each ListItem needs a sequential integer position (starting at 1), a non-empty name, and an item URL (optional only on the final entry) per schema.org/BreadcrumbList.'));
      }

      const richResultCheck = validateSchemaNodesForRichResults(analysis.schemaNodes);
      for (const nodeResult of richResultCheck.perNode) {
        if (nodeResult.missingRequired.length) {
          issues.push(issue('SCHEMA_MISSING_REQUIRED_PROPERTY', 'structured-data', 'critical', url, `${nodeResult.types.join('/')} structured data is missing a Google-required property`, `Missing required propert${nodeResult.missingRequired.length === 1 ? 'y' : 'ies'}: ${nodeResult.missingRequired.join(', ')}.`, `Add the missing propert${nodeResult.missingRequired.length === 1 ? 'y' : 'ies'} to this page's ${nodeResult.types.join('/')} JSON-LD, using only truthful data already visible on the page.`));
        }
        if (nodeResult.missingRecommended.length) {
          issues.push(issue('SCHEMA_MISSING_RECOMMENDED_PROPERTY', 'structured-data', 'warning', url, `${nodeResult.types.join('/')} structured data is missing a Google-recommended property`, `Missing recommended propert${nodeResult.missingRecommended.length === 1 ? 'y' : 'ies'}: ${nodeResult.missingRecommended.join(', ')}.`, `Consider adding the missing propert${nodeResult.missingRecommended.length === 1 ? 'y' : 'ies'} to this page's ${nodeResult.types.join('/')} JSON-LD, using only truthful data already visible on the page.`));
        }
        for (let i = 0; i < nodeResult.deprecatedTypes.length; i += 1) {
          issues.push(issue('SCHEMA_DEPRECATED_RICH_RESULT_TYPE', 'structured-data', 'info', url, `${nodeResult.deprecatedTypes[i]} is no longer a Google rich-result type`, nodeResult.deprecatedTypeReasons[i], `This markup is still valid schema.org and safe to leave in place, but it can no longer earn a Google Search rich result.`));
        }
      }

      const currentSchemaCodesForUrl = richResultCheck.perNode.flatMap((nodeResult) => [
        ...(nodeResult.missingRequired.length ? ['SCHEMA_MISSING_REQUIRED_PROPERTY'] : []),
        ...(nodeResult.deprecatedTypes.length ? ['SCHEMA_DEPRECATED_RICH_RESULT_TYPE'] : []),
      ]);
      const regressionResult = classifySchemaRegression(previousSchemaCodesByUrl.get(url) || [], currentSchemaCodesForUrl, hasPreviousSchemaRun);
      if (regressionResult.isRegression) {
        issues.push(issue(
          'SCHEMA_REGRESSION_DETECTED', 'structured-data', 'critical', url,
          'Structured data on this page regressed since the previous crawl',
          `This page passed the previous completed crawl's schema validation for ${regressionResult.newlyFailingCodes.join(', ')}, but now fails it. Previous run completed at ${previousCompletedRun.completedAt}.`,
          'Review the recent schema/template change to this page and compare versions to find what changed, then fix the regression or intentionally accept the new state.'
        ));
      }

      // Event schema-vs-database truthfulness (adapted SEO-0605 subset — see module
      // header for the full BLVD-schema-limitation disclosure).
      if (resource.resourceType === 'event') {
        const dbEvent = db.prepare('SELECT * FROM events WHERE id = ?').get(resource.resourceId);
        const todayIso = new Date().toISOString().slice(0, 10);
        for (const node of analysis.schemaNodes) {
          const rawType = node?.['@type'];
          const nodeTypes = Array.isArray(rawType) ? rawType.filter((t) => typeof t === 'string') : (typeof rawType === 'string' ? [rawType] : []);
          if (!nodeTypes.includes('Event')) continue;
          const eventCheck = evaluateEventSchemaAgainstDatabase(node, dbEvent, todayIso);
          if (eventCheck.nameMismatch) {
            issues.push(issue('SCHEMA_EVENT_NAME_MISMATCH', 'structured-data', 'critical', url, 'Event schema name does not match the stored event title', `Schema declares name "${eventCheck.nameMismatch.schemaValue}"; the stored event record's real title is "${eventCheck.nameMismatch.dbValue}".`, 'Confirm the event page renders this event\'s current title, or correct the stored event title if it changed after the schema was generated.'));
          }
          if (eventCheck.dateMismatch) {
            issues.push(issue('SCHEMA_EVENT_DATE_MISMATCH', 'structured-data', 'critical', url, 'Event schema startDate does not match the stored event date', `Schema declares startDate "${eventCheck.dateMismatch.schemaValue}"; the stored event record's real date is "${eventCheck.dateMismatch.dbValue}".`, 'Confirm the event page renders this event\'s current date, or correct the stored event date if it changed after the schema was generated.'));
          }
          if (eventCheck.staleScheduledEvent) {
            issues.push(issue('SCHEMA_STALE_EVENT_DATE', 'structured-data', 'warning', url, 'Event schema still claims EventScheduled for a date that has already passed', `Schema startDate "${eventCheck.staleScheduledEvent.schemaStartDate}" is before today's real date (${eventCheck.staleScheduledEvent.clubDateIso}), but eventStatus still declares EventScheduled and the stored event is not marked cancelled/completed.`, 'This event has passed; consider removing or unpublishing this page/resource, or confirm the stored event date is correct.'));
          }
        }
      }

      if (analysis.imagesMissingAlt) issues.push(issue('MISSING_IMAGE_ALT', 'media', 'warning', url, 'Images are missing alt attributes', `${analysis.imagesMissingAlt} of ${analysis.imageCount} images have no alt attribute.`, 'Add descriptive alt text or an explicit empty alt for decorative images.'));
      for (const finding of evaluateImageAltQuality(analysis.imageAltEvidence)) {
        issues.push(issue('LOW_QUALITY_IMAGE_ALT', 'media', 'warning', url, 'Image alt text is not meaningfully descriptive', `<img src="${finding.src}" alt="${finding.alt}">: ${finding.reason}`, 'Replace the alt text with a concise description of what the image conveys, or use alt="" if it is purely decorative.'));
      }
      for (const finding of evaluateLinkText(analysis.linkTextEvidence)) {
        issues.push(issue('NON_DESCRIPTIVE_LINK_TEXT', 'accessibility', 'warning', url, 'Link text is not descriptive of its destination', `<a href="${finding.href}">${finding.visibleText || '(empty)'}</a>: ${finding.reason}`, 'Rewrite the link text (or add an aria-label) so its purpose is clear out of context.'));
      }
      for (const finding of evaluateFormLabels(analysis.formControlEvidence)) {
        issues.push(issue('UNLABELED_FORM_CONTROL', 'accessibility', 'critical', url, 'Form control has no accessible label', `<${finding.tagName}${finding.type ? ` type="${finding.type}"` : ''}${finding.id ? ` id="${finding.id}"` : ''}> has no <label>, aria-label, or aria-labelledby.`, 'Add a <label for> referencing this control\'s id, wrap it in a <label>, or add an aria-label/aria-labelledby attribute.'));
      }
      const readability = evaluateReadability(analysis.visibleText, resource.language);
      if (!readability.skipped && readability.fleschReadingEase !== null && readability.fleschReadingEase < FLESCH_DIFFICULT_THRESHOLD) {
        issues.push(issue(
          'LOW_READABILITY_SCORE', 'content', 'info', url,
          `Readability score is in the "${readability.band}" band`,
          `Flesch Reading Ease ${readability.fleschReadingEase} (Flesch 1948 formula; Flesch-Kincaid Grade Level ${readability.fleschKincaidGradeLevel}, Kincaid et al. 1975), computed over ${readability.wordCount} words / ${readability.sentenceCount} sentences of visible text. This score is directional evidence, not a certified reading-level measurement.`,
          'Review whether the copy on this page is appropriately clear for its intended audience. A low score is a prompt for human review, not an automatic defect.'
        ));
      }
      if (analysis.mixedContentCount) issues.push(issue('MIXED_CONTENT', 'performance', 'critical', url, 'Page references insecure HTTP resources', `${analysis.mixedContentCount} insecure resource reference(s) found.`, 'Use HTTPS asset URLs.'));
      if (!analysis.hasHtmlLanguage) issues.push(issue('MISSING_LANGUAGE', 'international', 'warning', url, 'HTML language is missing', 'No lang attribute was found on the html element.', 'Set a valid page language such as en-US.'));
      if (analysis.visibleTextLength < 180 && resource.indexState === 'index') issues.push(issue('THIN_CONTENT', 'content', 'warning', url, 'Indexable page has very little visible text', `${analysis.visibleTextLength} visible characters detected.`, 'Confirm the page provides enough useful visible information for its purpose.'));
      if (/\b(not found|404 error|page unavailable)\b/i.test(body) && response.status === 200) issues.push(issue('SOFT_404', 'indexing', 'critical', url, 'Possible soft 404', 'The page returned 200 but contains not-found language.', 'Return a real 404/410 or restore substantive content.'));
    }

    const htmlChecks = checks.filter((check) => check.analysis);
    const byTitle = clusterByKey(htmlChecks.map((check) => ({ key: check.analysis.title.toLowerCase(), url: check.url })));
    const byDescription = clusterByKey(htmlChecks.map((check) => ({ key: check.analysis.description.toLowerCase(), url: check.url })));
    for (const urls of byTitle.values()) {
      for (const url of urls) issues.push(issue('DUPLICATE_TITLE', 'content', 'warning', url, 'Duplicate title', urls.join(', '), 'Give each indexable page a unique title.'));
    }
    for (const urls of byDescription.values()) {
      for (const url of urls) issues.push(issue('DUPLICATE_DESCRIPTION', 'content', 'warning', url, 'Duplicate meta description', urls.join(', '), 'Write a page-specific description.'));
    }
    for (const [titleKey, urls] of byTitle.entries()) {
      const clusterKey = [...urls].sort().join('|');
      const sampleTitle = htmlChecks.find((check) => check.analysis.title.toLowerCase() === titleKey)?.analysis.title || titleKey;
      issues.push(issue('DUPLICATE_TITLE_CLUSTER', 'content', 'warning', `cluster:${clusterKey}`, `Duplicate title cluster (${urls.length} URLs)`, `Title "${sampleTitle}" is shared by: ${urls.join(', ')}`, 'Give each URL in this cluster a unique, page-specific title.'));
    }
    for (const [descKey, urls] of byDescription.entries()) {
      const clusterKey = [...urls].sort().join('|');
      const sampleDescription = htmlChecks.find((check) => check.analysis.description.toLowerCase() === descKey)?.analysis.description || descKey;
      issues.push(issue('DUPLICATE_DESCRIPTION_CLUSTER', 'content', 'warning', `cluster:${clusterKey}`, `Duplicate description cluster (${urls.length} URLs)`, `Description "${sampleDescription}" is shared by: ${urls.join(', ')}`, 'Write a unique, page-specific description for each URL in this cluster.'));
    }

    const byH1 = clusterByKey(htmlChecks.map((check) => ({ key: evaluateHeadingOutline(check.analysis.headings).h1Text[0] || '', url: check.url })));
    for (const [h1Key, urls] of byH1.entries()) {
      const clusterKey = [...urls].sort().join('|');
      issues.push(issue('DUPLICATE_H1_CLUSTER', 'content', 'warning', `cluster:${clusterKey}`, `Duplicate H1 cluster (${urls.length} URLs)`, `H1 "${h1Key}" is shared by: ${urls.join(', ')}`, 'Give each URL in this cluster a unique, page-specific H1.'));
    }

    const pagesWithVisibleText = htmlChecks.map((check) => ({ url: check.url, normalizedText: check.analysis.normalizedVisibleText || '' }));
    const byVisibleContent = clusterByKey(pagesWithVisibleText.map((page) => ({ key: page.normalizedText, url: page.url })));
    for (const [contentKey, urls] of byVisibleContent.entries()) {
      const clusterKey = [...urls].sort().join('|');
      issues.push(issue('EXACT_DUPLICATE_CONTENT', 'content', 'critical', `cluster:${clusterKey}`, `Exact duplicate visible content (${urls.length} URLs)`, `${contentKey.length} normalized visible characters are byte-identical across: ${urls.join(', ')}`, 'Differentiate the visible body content of each URL in this cluster, or consolidate them into one canonical page with redirects for the rest.'));
    }

    const nearDuplicateContentPairs = findNearDuplicateContentPairs(pagesWithVisibleText);
    for (const pair of nearDuplicateContentPairs) {
      const clusterKey = [pair.urlA, pair.urlB].sort().join('|');
      issues.push(issue('NEAR_DUPLICATE_CONTENT', 'content', 'warning', `cluster:${clusterKey}`, `Near-duplicate visible content (${Math.round(pair.similarity * 100)}% similarity)`, `${pair.urlA} (${pair.lengthA} chars) and ${pair.urlB} (${pair.lengthB} chars) share ${Math.round(pair.similarity * 100)}% of their 5-word content shingles (Jaccard resemblance). Sample overlapping phrases: ${pair.sampleOverlap.map((s) => `"${s}"`).join('; ') || '(none captured)'}`, 'Review whether this much shared visible content is intentional (e.g. a template block) or should be differentiated to avoid diluting ranking signals between the two pages.'));
    }

    const TITLE_SHINGLE_SIZE = 2;
    const titlesWithText = htmlChecks.filter((check) => check.analysis.title).map((check) => ({ url: check.url, normalizedText: check.analysis.title.toLowerCase() }));
    for (const pair of findNearDuplicateContentPairs(titlesWithText, 0.6, TITLE_SHINGLE_SIZE)) {
      const clusterKey = [pair.urlA, pair.urlB].sort().join('|');
      issues.push(issue('NEAR_DUPLICATE_TITLE', 'content', 'warning', `cluster:${clusterKey}`, `Near-duplicate titles (${Math.round(pair.similarity * 100)}% similarity)`, `${pair.urlA} and ${pair.urlB} have titles sharing ${Math.round(pair.similarity * 100)}% of their 2-word phrase shingles. Sample overlapping phrases: ${pair.sampleOverlap.map((s) => `"${s}"`).join('; ') || '(none captured)'}`, 'Confirm these titles are distinct enough to be understood as two different pages in search results.'));
    }

    const descriptionsWithText = htmlChecks.filter((check) => check.analysis.description).map((check) => ({ url: check.url, normalizedText: check.analysis.description.toLowerCase() }));
    for (const pair of findNearDuplicateContentPairs(descriptionsWithText, 0.6, TITLE_SHINGLE_SIZE)) {
      const clusterKey = [pair.urlA, pair.urlB].sort().join('|');
      issues.push(issue('NEAR_DUPLICATE_DESCRIPTION', 'content', 'warning', `cluster:${clusterKey}`, `Near-duplicate meta descriptions (${Math.round(pair.similarity * 100)}% similarity)`, `${pair.urlA} and ${pair.urlB} have descriptions sharing ${Math.round(pair.similarity * 100)}% of their 2-word phrase shingles. Sample overlapping phrases: ${pair.sampleOverlap.map((s) => `"${s}"`).join('; ') || '(none captured)'}`, 'Write more differentiated, page-specific descriptions if these two pages serve different search intents.'));
    }

    const headingsWithText = htmlChecks
      .map((check) => ({ url: check.url, normalizedText: (check.analysis.headings || []).filter((h) => !h.isEmpty).map((h) => h.text).join(' ').toLowerCase() }))
      .filter((entry) => entry.normalizedText.length > 0);
    for (const pair of findNearDuplicateContentPairs(headingsWithText, 0.6, TITLE_SHINGLE_SIZE)) {
      const clusterKey = [pair.urlA, pair.urlB].sort().join('|');
      issues.push(issue('NEAR_DUPLICATE_HEADINGS', 'content', 'warning', `cluster:${clusterKey}`, `Near-duplicate heading outlines (${Math.round(pair.similarity * 100)}% similarity)`, `${pair.urlA} and ${pair.urlB} have heading text (H1-H6, in order) sharing ${Math.round(pair.similarity * 100)}% of their 2-word phrase shingles. Sample overlapping phrases: ${pair.sampleOverlap.map((s) => `"${s}"`).join('; ') || '(none captured)'}`, 'Confirm the two pages\' heading structures reflect genuinely distinct content, not a copied outline.'));
    }

    for (const pair of findQueryIntentOverlaps(resources)) {
      const queryClusterKey = [pair.urlA, pair.urlB].sort().join('|');
      issues.push(issue(
        'QUERY_INTENT_OVERLAP',
        'content',
        'warning',
        `cluster:${queryClusterKey}`,
        `Overlapping target-query intent (${Math.round(pair.similarity * 100)}% similarity)`,
        `${pair.urlA} (target-query notes: "${pair.noteA}") and ${pair.urlB} (target-query notes: "${pair.noteB}") share ${Math.round(pair.similarity * 100)}% of their 2-word phrase shingles. Sample overlapping phrases: ${pair.sampleOverlap.map(s => `"${s}"`).join('; ') || '(none captured)'}. This compares admin-authored target-query notes only; it is not informed by real Search Console query data, which is not connected in this environment (see fetchSearchConsoleQueryData()).`,
        'Review whether these two pages are intentionally targeting the same search intent (e.g. a hub page and a detail page) or should be differentiated/consolidated to avoid competing against each other in search results.'
      ));
    }

    const knownByUrl = new Map(checks.map((check) => [new URL(check.url).pathname.replace(/\/+$/, '') || '/', check]));
    const incoming = new Map();
    const outgoingInternalCount = new Map();
    const externalLinkTargets = new Set();
    const externalLinkSources = new Map();
    for (const check of htmlChecks) {
      let internalOutgoing = 0;
      for (const href of check.analysis.links) {
        let linked;
        try { linked = new URL(href); } catch {
          issues.push(issue('MALFORMED_LINK', 'architecture', 'warning', check.url, 'Malformed link found', href, 'Correct or remove the invalid href.'));
          continue;
        }
        if (linked.origin !== baseUrl) {
          externalLinkTargets.add(linked.href);
          externalLinkSources.set(linked.href, [...(externalLinkSources.get(linked.href) || []), check.url]);
          continue;
        }
        internalOutgoing += 1;
        const key = linked.pathname.replace(/\/+$/, '') || '/';
        incoming.set(key, (incoming.get(key) || 0) + 1);
        const target = knownByUrl.get(key);
        if (target && target.statusCode >= 300) issues.push(issue('INTERNAL_LINK_TO_NON_200', 'architecture', 'warning', check.url, 'Internal link points to a redirect or error', `${href} returned ${target.statusCode}.`, 'Update the internal link to the final canonical URL.'));
        if (target?.analysis?.canonical) {
          try {
            const targetCanonical = new URL(target.analysis.canonical, target.url);
            const targetCanonicalKey = targetCanonical.origin === baseUrl ? (targetCanonical.pathname.replace(/\/+$/, '') || '/') : null;
            if (targetCanonicalKey && targetCanonicalKey !== key) {
              issues.push(issue('LINK_TO_NONCANONICAL', 'architecture', 'warning', check.url, 'Internal link points to a non-canonical URL', `${href} declares canonical ${targetCanonical.href}.`, 'Point the internal link directly at the declared canonical URL.'));
            }
          } catch { /* Target's own canonical is malformed; INVALID_CANONICAL already covers that. */ }
        }
      }
      outgoingInternalCount.set(check.url, internalOutgoing);
    }
    for (const check of htmlChecks) {
      const pathname = new URL(check.url).pathname.replace(/\/+$/, '') || '/';
      if (pathname !== '/' && check.resource.indexState === 'index' && !incoming.get(pathname)) {
        issues.push(issue('ORPHAN_PAGE', 'architecture', 'warning', check.url, 'Indexable page has no discovered internal links', 'No crawled page linked to this URL.', 'Add a crawlable internal link from an appropriate page or navigation surface.'));
      }
    }

    const EXCESSIVE_INTERNAL_LINK_SAFETY_NET = 300;
    for (const check of htmlChecks) {
      if (check.resource.indexState !== 'index') continue;
      const internalOutgoing = outgoingInternalCount.get(check.url) || 0;
      if (internalOutgoing === 0) {
        issues.push(issue('NO_INTERNAL_LINKS', 'architecture', 'warning', check.url, 'Indexable page has no outgoing internal links', 'This page links to zero other pages on this site.', 'Add at least one crawlable internal link (navigation, related content, or a footer link) so crawlers and users can reach other pages from here.'));
      } else if (internalOutgoing > EXCESSIVE_INTERNAL_LINK_SAFETY_NET) {
        issues.push(issue('EXCESSIVE_INTERNAL_LINKS', 'architecture', 'info', check.url, 'Page has an unusually high number of internal links', `${internalOutgoing} internal links found, above the ${EXCESSIVE_INTERNAL_LINK_SAFETY_NET}-link informational safety net used by this audit.`, 'Review whether every linked destination on this page is genuinely useful to a visitor or crawler.'));
      }
    }

    checkCancellation();

    const EXTERNAL_LINK_CHECK_LIMIT = 40;
    const externalTargetsToCheck = [...externalLinkTargets].slice(0, EXTERNAL_LINK_CHECK_LIMIT);
    for (const target of externalTargetsToCheck) {
      const sources = externalLinkSources.get(target) || [];
      let response;
      let method = 'HEAD';
      try {
        response = await fetchWithTimeout(target, { method: 'HEAD', redirect: 'follow', headers: { 'user-agent': AUDIT_USER_AGENT } });
        if (response.status === 405 || response.status === 501) {
          method = 'GET';
          response = await fetchWithTimeout(target, { method: 'GET', redirect: 'follow', headers: { 'user-agent': AUDIT_USER_AGENT } });
        }
      } catch (error) {
        for (const sourceUrl of sources) {
          issues.push(issue('BROKEN_EXTERNAL_LINK', 'architecture', 'warning', sourceUrl, 'External link could not be reached', `${target} failed: ${error.message}`, 'Confirm the destination is online, or remove/replace the outbound link.'));
        }
        continue;
      }
      if (response.status >= 400) {
        for (const sourceUrl of sources) {
          issues.push(issue('BROKEN_EXTERNAL_LINK', 'architecture', 'warning', sourceUrl, 'External link returns an error status', `${target} returned HTTP ${response.status} via ${method}.`, 'Update or remove the outbound link.'));
        }
      }
    }
    if (externalLinkTargets.size > EXTERNAL_LINK_CHECK_LIMIT) {
      issues.push(issue('EXTERNAL_LINK_CHECK_TRUNCATED', 'architecture', 'info', baseUrl, 'External link liveness check was truncated', `${externalLinkTargets.size} unique external links were found; only the first ${EXTERNAL_LINK_CHECK_LIMIT} were checked in this run to bound audit runtime.`, 'Rerun the audit to sample additional external links.'));
    }

    const canonicalKeyByPath = new Map();
    for (const check of htmlChecks) {
      const pathname = new URL(check.url).pathname.replace(/\/+$/, '') || '/';
      let canonicalKey = pathname;
      if (check.analysis.canonical) {
        try {
          const declared = new URL(check.analysis.canonical, check.url);
          canonicalKey = declared.origin === baseUrl ? (declared.pathname.replace(/\/+$/, '') || '/') : `external:${declared.href}`;
        } catch {
          canonicalKey = `invalid:${pathname}`;
        }
      }
      canonicalKeyByPath.set(pathname, canonicalKey);
    }
    for (const check of htmlChecks) {
      const pathname = new URL(check.url).pathname.replace(/\/+$/, '') || '/';
      const declaredKey = canonicalKeyByPath.get(pathname);
      if (declaredKey === pathname || declaredKey.startsWith('external:') || declaredKey.startsWith('invalid:')) continue;
      const { chain, loopFound } = findCanonicalChain(canonicalKeyByPath, pathname);
      if (loopFound) {
        issues.push(issue('CANONICAL_LOOP', 'canonical', 'critical', check.url, 'Canonical loop or conflict detected', chain.join(' → '), 'Break the cycle: exactly one URL in this chain should be the true canonical, and every other URL in the chain should point directly at it.'));
        continue;
      }
      const targetCheck = knownByUrl.get(declaredKey);
      if (!targetCheck) {
        issues.push(issue('CANONICAL_TARGET_NOT_OK', 'canonical', 'critical', check.url, 'Canonical target was not found in this crawl', `Declared canonical path ${declaredKey} does not match any crawled resource.`, 'Confirm the canonical target is a real, active URL on this site.'));
        continue;
      }
      if (targetCheck.statusCode !== 200) {
        issues.push(issue('CANONICAL_TARGET_NOT_OK', 'canonical', 'critical', check.url, 'Canonical target does not return 200', `Canonical target ${targetCheck.url} returned HTTP ${targetCheck.statusCode}.`, 'Point the canonical at a URL that returns 200, or update this page’s intended canonical target.'));
        continue;
      }
      if (targetCheck.resource?.indexState === 'noindex') {
        issues.push(issue('CANONICAL_TARGET_NOT_OK', 'canonical', 'critical', check.url, 'Canonical target is set to noindex', `Canonical target ${targetCheck.url} is configured as noindex.`, 'A canonical target should be indexable. Choose a different canonical or change the target’s index state.'));
        continue;
      }
      const targetOwnKey = canonicalKeyByPath.get(declaredKey);
      if (targetOwnKey !== undefined && targetOwnKey !== declaredKey && !targetOwnKey.startsWith('invalid:')) {
        issues.push(issue('CANONICAL_TARGET_NOT_OK', 'canonical', 'warning', check.url, 'Canonical target is itself not self-canonical', `Canonical target ${targetCheck.url} declares a different canonical (chain depth > 1).`, 'Point this page directly at the final canonical URL rather than through an intermediate hop.'));
      }
    }

    const hreflangEntriesByUrl = new Map();
    for (const check of htmlChecks) {
      const entries = check.analysis.hreflang || [];
      if (!entries.length) continue;
      hreflangEntriesByUrl.set(check.url, entries);
      for (const entry of entries) {
        const tag = validateLanguageTag(entry.lang);
        if (!tag.valid) {
          issues.push(issue('HREFLANG_INVALID_CODE', 'international', 'critical', check.url, 'Rendered hreflang code is not valid BCP47', `hreflang="${entry.lang}" for ${entry.url}: ${tag.reason}`, 'Correct the hreflang code to a valid BCP47 language[-region] value or x-default.'));
        }
      }
      const pathname = new URL(check.url).pathname.replace(/\/+$/, '') || '/';
      const selfKey = `${baseUrl}${pathname}`;
      const hasSelfReference = entries.some((entry) => {
        try { return new URL(entry.url).href.replace(/\/+$/, '') === selfKey.replace(/\/+$/, ''); } catch { return false; }
      });
      if (!hasSelfReference) {
        issues.push(issue('HREFLANG_MISSING_SELF_REFERENCE', 'international', 'warning', check.url, 'Hreflang set does not list itself', `Declared hreflang targets: ${entries.map((e) => `${e.lang}:${e.url}`).join(', ')}.`, 'Add this page\'s own URL to its hreflang set, per Google: each language version must list itself as well as all other language versions.'));
      }
    }
    for (const broken of checkReciprocalHreflang(hreflangEntriesByUrl)) {
      issues.push(issue('HREFLANG_NOT_RECIPROCAL', 'international', 'warning', broken.url, 'Hreflang link is not reciprocated', `${broken.url} declares hreflang="${broken.lang}" pointing to ${broken.targetUrl}, but ${broken.reason}`, 'Google ignores hreflang annotations that are not reciprocated — add the missing back-link on the target page, or remove this one-way entry.'));
    }
    const canonicalKeyByNormalizedUrl = new Map();
    for (const [pathname, canonicalKey] of canonicalKeyByPath.entries()) {
      const normalizedSelf = `${baseUrl}${pathname === '/' ? '' : pathname}`;
      const normalizedCanonical = canonicalKey.startsWith('external:') || canonicalKey.startsWith('invalid:')
        ? canonicalKey
        : `${baseUrl}${canonicalKey === '/' ? '' : canonicalKey}`;
      canonicalKeyByNormalizedUrl.set(normalizedSelf, normalizedCanonical);
    }
    for (const check of htmlChecks) {
      const entries = check.analysis.hreflang || [];
      if (!entries.length) continue;
      for (const mismatch of checkHreflangCanonicalCompatibility(entries, canonicalKeyByNormalizedUrl)) {
        issues.push(issue('HREFLANG_CANONICAL_MISMATCH', 'international', 'warning', check.url, 'Hreflang target disagrees with its own canonical', `hreflang="${mismatch.lang}" points to ${mismatch.url}, which itself declares canonical ${mismatch.declaredCanonical}.`, 'Point the hreflang entry at the target\'s declared canonical URL instead of a non-canonical copy.'));
      }
    }
    for (const [, cluster] of buildHreflangClusters(hreflangEntriesByUrl).entries()) {
      const clusterKey = [...cluster.urls].sort().join('|');
      const languages = [...new Set(cluster.entries.map((entry) => entry.lang))].sort();
      issues.push(issue('HREFLANG_CLUSTER_SUMMARY', 'international', 'info', `cluster:${clusterKey}`, `Hreflang cluster (${cluster.urls.length} URLs, ${languages.length} language${languages.length === 1 ? '' : 's'})`, `Languages: ${languages.join(', ')}. URLs: ${cluster.urls.join(', ')}.`, 'Review this cluster as a whole: every URL should list every other URL, plus itself, and at most one x-default.'));
    }

    const adjacency = new Map();
    for (const check of htmlChecks) {
      const fromPath = new URL(check.url).pathname.replace(/\/+$/, '') || '/';
      const targets = new Set();
      for (const href of check.analysis.links) {
        try {
          const linked = new URL(href);
          if (linked.origin === baseUrl) targets.add(linked.pathname.replace(/\/+$/, '') || '/');
        } catch { /* malformed hrefs already reported above */ }
      }
      adjacency.set(fromPath, targets);
    }
    const depthByPath = computeCrawlDepths(adjacency, '/');
    const CRAWL_DEPTH_WARNING_THRESHOLD = 4;
    for (const check of htmlChecks) {
      const pathname = new URL(check.url).pathname.replace(/\/+$/, '') || '/';
      if (check.resource.indexState !== 'index' || pathname === '/') continue;
      const depth = depthByPath.get(pathname);
      if (depth === undefined) {
        issues.push(issue('CRAWL_DEPTH_UNREACHABLE', 'architecture', 'warning', check.url, 'Page is not reachable from the homepage by internal links', 'No internal-link path from / to this URL was found in this crawl.', 'Add an internal link path from the homepage (directly or through navigation/category pages) so the page is discoverable by crawling.'));
      } else if (depth > CRAWL_DEPTH_WARNING_THRESHOLD) {
        issues.push(issue('CRAWL_DEPTH_EXCESSIVE', 'architecture', 'warning', check.url, 'Page is many clicks from the homepage', `Shortest discovered internal-link path from / is ${depth} clicks.`, 'Add a shorter internal-link path (e.g. from navigation, a hub page, or related content) to bring this page closer to the homepage.'));
      }
    }

    const resourceByPath = new Map(resources.map((entry) => [entry.path, entry]));
    for (const resource of resources) {
      if (!resource.parentPath) continue;
      const parentPath = resource.parentPath;
      if (parentPath === resource.path) {
        issues.push(issue('BREADCRUMB_BROKEN_PARENT_CHAIN', 'architecture', 'critical', new URL(resource.path, baseUrl).href, 'Resource is its own breadcrumb parent', `parentPath is set to its own path: ${parentPath}.`, 'Set a different parentPath, or clear it if this resource has no parent.'));
        continue;
      }
      const parent = resourceByPath.get(parentPath);
      if (!parent) {
        issues.push(issue('BREADCRUMB_BROKEN_PARENT_CHAIN', 'architecture', 'warning', new URL(resource.path, baseUrl).href, 'Breadcrumb parent path does not resolve to a known resource', `parentPath "${parentPath}" does not match any active seo_resources path.`, 'Point parentPath at an existing, active resource path, or clear it.'));
        continue;
      }
      const visited = new Set([resource.path]);
      let cursor = parentPath;
      let hops = 0;
      let cycleFound = false;
      while (cursor && hops < 50) {
        if (visited.has(cursor)) { cycleFound = true; break; }
        visited.add(cursor);
        const ancestor = resourceByPath.get(cursor);
        if (!ancestor) break;
        cursor = ancestor.parentPath || null;
        hops += 1;
      }
      if (cycleFound) {
        issues.push(issue('BREADCRUMB_BROKEN_PARENT_CHAIN', 'architecture', 'critical', new URL(resource.path, baseUrl).href, 'Breadcrumb parent chain contains a cycle', `Walking parentPath from ${resource.path} loops back through ${cursor}.`, 'Break the cycle: at least one resource in this chain must point at a real ancestor, not back into the loop.'));
      }
    }

    const citationCheck = await checkCitationSources(db);
    for (const result of citationCheck.results) {
      if (result.status === 'ok') continue;
      const owningResource = resources.find((entry) => String(entry.id) === String(result.seoResourceId)) || null;
      const evidenceUrl = owningResource ? new URL(owningResource.path, baseUrl).href : `citation:${result.id}`;
      issues.push(issue(
        'BROKEN_CITATION_SOURCE', 'content', result.status === 'error' ? 'critical' : 'warning', evidenceUrl,
        result.status === 'error' ? 'Citation source could not be reached' : 'Citation source returns an error status',
        `"${result.sourceName}" (${result.sourceUrl}) ${result.status === 'error' ? `failed: ${result.error}` : `returned HTTP ${result.statusCode}`}.`,
        'Update or remove the citation, or confirm the source is temporarily unavailable and recheck later.'
      ));
    }

    const uniqueIssues = [...new Map(issues.map((entry) => [fingerprint(entry), entry])).entries()];
    const completedAt = new Date().toISOString();
    const transaction = db.transaction(() => {
      const insertCheck = db.prepare(`
        INSERT INTO seo_page_checks (
          runId, url, statusCode, contentType, responseTimeMs, responseBytes,
          title, description, canonical, robots, h1Count, schemaCount, imageCount,
          imagesMissingAlt, internalLinkCount, summaryJson, checkedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const check of checks) {
        const analysis = check.analysis || {};
        const fromPathname = new URL(check.url).pathname.replace(/\/+$/, '') || '/';
        const outgoingInternalPaths = [...(adjacency.get(fromPathname) || [])];
        insertCheck.run(
          runId, check.url, check.statusCode, check.contentType,
          check.responseTimeMs, check.responseBytes, analysis.title || null,
          analysis.description || null, analysis.canonical || null,
          [analysis.robots, check.xRobotsTag].filter(Boolean).join(', ') || null,
          analysis.h1Count || 0, analysis.schemaCount || 0, analysis.imageCount || 0,
          analysis.imagesMissingAlt || 0, analysis.links?.length || 0,
          JSON.stringify({ error: check.error || null, location: check.location || null, googlebot: analysis.googlebot || null, headings: analysis.headings || [], outgoingInternalPaths }),
          completedAt
        );
      }

      db.prepare('DELETE FROM seo_links').run();
      const insertLink = db.prepare(`
        INSERT INTO seo_links (
          runId, sourceUrl, destinationUrl, isExternal, anchorText, context,
          relNofollow, relSponsored, relUgc, relRaw, canonicalDestination, status, lastVerifiedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const check of checks) {
        if (!check.analysis) continue;
        for (const row of buildLinkInventoryRows(check, baseUrl, knownByUrl, canonicalKeyByPath)) {
          insertLink.run(
            runId, row.sourceUrl, row.destinationUrl, row.isExternal ? 1 : 0,
            row.anchorText || '', row.context, row.relNofollow ? 1 : 0, row.relSponsored ? 1 : 0,
            row.relUgc ? 1 : 0, row.relRaw || '', row.canonicalDestination, row.status, completedAt
          );
        }
      }

      const upsertIssue = db.prepare(`
        INSERT INTO seo_issues (
          runId, fingerprint, category, severity, code, url, title, evidence,
          recommendation, status, firstSeenAt, lastSeenAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
        ON CONFLICT(fingerprint) DO UPDATE SET
          runId = excluded.runId,
          category = excluded.category,
          severity = excluded.severity,
          title = excluded.title,
          evidence = excluded.evidence,
          recommendation = excluded.recommendation,
          status = CASE WHEN seo_issues.status = 'ignored' THEN 'ignored' ELSE 'open' END,
          lastSeenAt = excluded.lastSeenAt,
          resolvedAt = NULL
      `);
      for (const [hash, entry] of uniqueIssues) {
        upsertIssue.run(runId, hash, entry.category, entry.severity, entry.code, entry.url, entry.title, entry.evidence, entry.recommendation, completedAt, completedAt);
      }
      db.prepare("UPDATE seo_issues SET status = 'resolved', resolvedAt = ? WHERE lastSeenAt < ? AND status NOT IN ('resolved', 'ignored')").run(completedAt, runId0);
      const summary = {
        critical: uniqueIssues.filter(([, entry]) => entry.severity === 'critical').length,
        warning: uniqueIssues.filter(([, entry]) => entry.severity === 'warning').length,
        info: uniqueIssues.filter(([, entry]) => entry.severity === 'info').length,
        averageResponseTimeMs: checks.length ? Math.round(checks.reduce((sum, check) => sum + check.responseTimeMs, 0) / checks.length) : 0,
        triggerType, scopeType, scopePrefix, maxPages, maxDurationMs, wasBounded,
        resourcesInScope: resources.length,
      };
      db.prepare(`
        UPDATE seo_audit_runs SET status = 'completed', completedAt = ?, totalUrls = ?,
          issueCount = ?, summaryJson = ? WHERE id = ?
      `).run(completedAt, checks.length, uniqueIssues.length, JSON.stringify(summary), runId);
    });
    transaction();
    db.prepare("UPDATE seo_crawl_runs SET auditRunId = ?, status = 'completed', resourceCount = ?, issueCount = ?, completedAt = ? WHERE id = ?")
      .run(runId, checks.length, uniqueIssues.length, completedAt, crawlRunId);
    return db.prepare('SELECT * FROM seo_audit_runs WHERE id = ?').get(runId);
  } catch (error) {
    const isCancellation = error instanceof CrawlCancelledError;
    const finishedAt = new Date().toISOString();
    db.prepare("UPDATE seo_audit_runs SET status = 'failed', completedAt = ?, error = ? WHERE id = ?")
      .run(finishedAt, isCancellation ? 'Crawl was cancelled by an administrator.' : error.message, runId);
    db.prepare("UPDATE seo_crawl_runs SET status = ?, cancelledAt = ?, cancelledBy = ?, error = ?, completedAt = ? WHERE id = ?")
      .run(
        isCancellation ? 'cancelled' : 'failed',
        isCancellation ? finishedAt : null,
        isCancellation ? (activeCrawlLock?.cancelledBy || actor.username || actor.email || actor.id || 'admin') : null,
        isCancellation ? null : error.message,
        finishedAt,
        crawlRunId
      );
    if (isCancellation) return db.prepare('SELECT * FROM seo_audit_runs WHERE id = ?').get(runId);
    throw error;
  } finally {
    activeCrawlLock = null;
  }
}

module.exports = {
  // Concurrency lock
  getCrawlLockStatus,
  requestCrawlCancellation,
  CrawlCancelledError,
  // Raw extraction / pure evidence functions (unit-testable without a live crawl)
  analyzeHtml,
  extractHeadings,
  evaluateHeadingOutline,
  extractBreadcrumbEvidence,
  evaluateBreadcrumbConsistency,
  extractSocialTags,
  evaluateSocialTags,
  evaluateImageAltQuality,
  evaluateLinkText,
  evaluateFormLabels,
  clusterByKey,
  normalizeVisibleText,
  shingleText,
  jaccardSimilarity,
  findNearDuplicateContentPairs,
  findCanonicalChain,
  computeCrawlDepths,
  evaluateUrlTrapRisk,
  countSyllables,
  splitTextForReadability,
  computeFleschReadingEase,
  computeFleschKincaidGradeLevel,
  evaluateReadability,
  validateSchemaNodeForRichResults,
  validateSchemaNodesForRichResults,
  validateEventSchemaProperties,
  validateBreadcrumbListSchemaProperties,
  validateLocalBusinessSchemaProperties,
  SCHEMA_REGRESSION_ELIGIBLE_CODES,
  classifySchemaRegression,
  validateLanguageTag,
  checkReciprocalHreflang,
  checkHreflangCanonicalCompatibility,
  buildHreflangClusters,
  evaluateEventSchemaAgainstDatabase,
  buildLinkInventoryRows,
  // Live/DB-touching entrypoints
  configuredAuditOrigin,
  verifySocialTagsLive,
  checkCitationSources,
  runSeoAudit,
};
