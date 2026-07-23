// Robots meta directive builder + hostname-mismatch noindex guard. Ported from
// HEIGHTSASTRO/src/lib/seo-directives.js (read in full 2026-07-23) to BLVD's
// Express/SQLite backend. Pure functions — no DB, no I/O — so this is a
// near-verbatim port: BLVD's hydrated seo_resources shape (see
// backend/lib/seo-resources.js's hydrateResource()) already uses the exact
// same camelCase field names as Heights' resource shape
// (resource.indexState/resource.expiresAt/resource.followState/
// resource.nosnippet/resource.maxSnippet/resource.maxImagePreview/
// resource.maxVideoPreview/resource.googlebotDirectives — all confirmed present
// as real columns in backend/lib/seo-schema.js's seo_resources table and real
// hydrated fields in backend/lib/seo-resources.js's hydrateResource()), because
// BLVD's schema was itself ported from the same Heights source with camelCase
// preserved (not translated from Colorado's snake_case) — no field-name
// judgment calls were needed here.
function isSeoExpired(resource, now = new Date()) {
  if (!resource?.expiresAt) return false;
  const expires = new Date(resource.expiresAt);
  return !Number.isNaN(expires.getTime()) && expires <= now;
}

function buildRobotsDirectives(resource = {}, options = {}) {
  const noindex = !!options.noindex || !!options.emergencyNoindex || resource.indexState === 'noindex' || isSeoExpired(resource);
  // Preserve the site's original page-level noindex contract: legacy noindex
  // implies nofollow. An advanced resource that explicitly owns indexState can
  // still choose the independent noindex,follow combination.
  const follow = noindex && resource.indexState !== 'noindex'
    ? 'nofollow'
    : resource.followState === 'nofollow' ? 'nofollow' : 'follow';
  const directives = [noindex ? 'noindex' : 'index', follow];
  if (resource.nosnippet) directives.push('nosnippet');
  if (resource.maxSnippet !== null && resource.maxSnippet !== undefined && resource.maxSnippet !== '') {
    directives.push(`max-snippet:${Number(resource.maxSnippet)}`);
  }
  if (resource.maxImagePreview) directives.push(`max-image-preview:${resource.maxImagePreview}`);
  if (resource.maxVideoPreview !== null && resource.maxVideoPreview !== undefined && resource.maxVideoPreview !== '') {
    directives.push(`max-video-preview:${Number(resource.maxVideoPreview)}`);
  }
  return [...new Set(directives)].join(', ');
}

function buildGooglebotDirectives(resource = {}, options = {}) {
  const general = buildRobotsDirectives(resource, options).split(',').map((value) => value.trim()).filter(Boolean);
  const specific = Array.isArray(resource.googlebotDirectives) ? resource.googlebotDirectives : [];
  return [...new Set([...general, ...specific.map(String).map((value) => value.trim()).filter(Boolean)])].join(', ');
}

// Loopback hosts a reverse-proxy/health-check probe hits directly, never a real
// visitor or a real search-engine crawler.
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

// Environment protection: BLVD's real deploy topology is a single production
// environment — no staging (confirmed by reading blvd-park-website/CLAUDE.md's
// Deployment section: "Single production environment — no staging", and
// deploy.sh's own flags have no staging target). Rather than build protection
// for a staging environment that does not exist today, this is a
// hostname-mismatch guard: it forces every response to noindex whenever the
// request's Host does not match the single configured production hostname.
// That makes ANY future non-production deployment of this exact codebase (a
// staging box, a preview container, a fork run on a laptop and accidentally
// exposed) search-safe by default, with zero extra configuration required at
// the moment that future deployment is stood up.
//
// @param {string|null|undefined} requestHost - the incoming request's effective
//   host (hostname[:port]), e.g. from the Host header or X-Forwarded-Host.
// @param {string|null|undefined} configuredOrigin - the site's own configured
//   canonical origin (seo_site_settings.canonicalOrigin, or FRONTEND_URL).
// @returns {boolean} true when the request host is authorized to serve
//   indexable content.
function isRequestHostAuthorized(requestHost, configuredOrigin) {
  const rawHost = String(requestHost || '').trim().toLowerCase();
  if (!rawHost) return true; // No Host header at all — nothing to compare against; fail open rather than noindex a request this guard cannot evaluate.
  // Strip a trailing :port, but only for bracketed-IPv6 (`[::1]:4321`) or
  // single-colon hostname:port forms — a bare IPv6 literal (`::1`, no
  // brackets, no port) has multiple colons and must be left intact.
  let hostname = rawHost;
  if (rawHost.startsWith('[')) {
    hostname = rawHost.slice(1, rawHost.indexOf(']') > -1 ? rawHost.indexOf(']') : undefined);
  } else if ((rawHost.match(/:/g) || []).length === 1) {
    hostname = rawHost.split(':')[0];
  }
  if (LOOPBACK_HOSTS.has(hostname)) return true;

  const origin = String(configuredOrigin || '').trim();
  if (!origin) return true; // No canonical origin configured anywhere (fresh install) — nothing to compare against; fail open.
  let configuredHost;
  try {
    configuredHost = new URL(origin).host.toLowerCase();
  } catch {
    return true; // Unparseable configured origin — a config-validation problem for the admin UI to surface, not this guard's job to enforce against.
  }
  return rawHost === configuredHost;
}

module.exports = { isSeoExpired, buildRobotsDirectives, buildGooglebotDirectives, isRequestHostAuthorized };
