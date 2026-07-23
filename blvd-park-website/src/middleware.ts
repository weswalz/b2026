// Redirects middleware — resolves GET/HEAD requests against the redirects manager
// before Astro renders the route. Skips /admin, /api, /uploads, and extensioned
// requests (assets) entirely. The active-redirect count is cached for 30s so the
// common case (no redirects configured) costs one cheap in-memory check per request
// instead of a network round-trip. See backend/lib/redirects.js for the resolver.
//
// Also applies the hostname-mismatch noindex guard (Wave-2 item #1, ported from
// HEIGHTSASTRO/src/lib/seo-directives.js's isRequestHostAuthorized() + its
// middleware.ts wiring, read in full 2026-07-23) to EVERY response this
// middleware handles — including the early-return paths above (skipped
// prefixes, extensioned assets, redirected requests) — since a mismatched
// Host is a property of the request, not of which branch handled it. BLVD's
// real deploy topology is a single production environment with no staging
// (confirmed by reading blvd-park-website/CLAUDE.md's Deployment section:
// "Single production environment — no staging") — this guard makes any
// future non-production deployment of this exact codebase (a staging box, a
// preview container, a fork exposed accidentally) search-safe by default.
// Unlike Heights/Colorado, BLVD's SSR frontend has NO direct database access
// (this container only reaches SQLite through the Express backend's /api/*
// surface) — so the configured canonicalOrigin is fetched from the backend's
// public, minimal-exposure GET /api/seo/public-settings endpoint
// (backend/server.js), never opened directly. Same 30s-TTL in-memory cache
// pattern as the redirect count below, and the same
// fail-open-on-unreachable-API posture (a backend outage must never make
// every page on the live site suddenly noindex).
//
// isRequestHostAuthorized() is INLINED here rather than imported from
// backend/lib/seo-directives.js: that file is CommonJS
// (`module.exports = {...}`) inside BLVD's separately-deployed Express
// backend (its own package.json/node_modules, built into a different Docker
// image than this SSR frontend per blvd-park-website/CLAUDE.md's
// Architecture Overview — confirmed the frontend deploy rsync does NOT
// exclude backend/, so the file WOULD physically exist in the frontend
// build tree, but importing another service's CJS source across that
// deploy boundary into this ESM/TypeScript Vite build is fragile and
// conflates two independently-deployed units for no real benefit — the
// function is ~15 lines, pure, and has zero dependencies). Kept byte-for-byte
// identical in logic to backend/lib/seo-directives.js's own copy; if either
// changes, update both.
import { defineMiddleware } from "astro:middleware";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

function isRequestHostAuthorized(requestHost: string | null | undefined, configuredOrigin: string | null | undefined): boolean {
  const rawHost = String(requestHost || "").trim().toLowerCase();
  if (!rawHost) return true;
  let hostname = rawHost;
  if (rawHost.startsWith("[")) {
    hostname = rawHost.slice(1, rawHost.indexOf("]") > -1 ? rawHost.indexOf("]") : undefined);
  } else if ((rawHost.match(/:/g) || []).length === 1) {
    hostname = rawHost.split(":")[0];
  }
  if (LOOPBACK_HOSTS.has(hostname)) return true;

  const origin = String(configuredOrigin || "").trim();
  if (!origin) return true;
  let configuredHost;
  try {
    configuredHost = new URL(origin).host.toLowerCase();
  } catch {
    return true;
  }
  return rawHost === configuredHost;
}

const INTERNAL_API = process.env.INTERNAL_API_URL || import.meta.env.PUBLIC_API_URL || "https://blvdpark.com";
const SKIP_PREFIXES = ["/admin", "/api", "/uploads"];
const CACHE_TTL_MS = 30_000;

let countCache: { count: number; expiresAt: number } | null = null;

async function getActiveRedirectCount(): Promise<number> {
  const now = Date.now();
  if (countCache && countCache.expiresAt > now) return countCache.count;

  let count = 0;
  try {
    const res = await fetch(`${INTERNAL_API}/api/redirects/count`);
    if (res.ok) {
      const body = await res.json();
      count = Number(body.count) || 0;
    } else {
      // API responded but not OK — assume redirects may exist and re-check sooner
      // rather than silently skipping them for a full TTL window.
      countCache = { count: 1, expiresAt: now + 2_000 };
      return 1;
    }
  } catch (_e) {
    // API unreachable — fail closed on skipping (don't block rendering), but
    // retry soon instead of caching a false "zero" for the full 30s window.
    countCache = { count: 0, expiresAt: now + 2_000 };
    return 0;
  }

  countCache = { count, expiresAt: now + CACHE_TTL_MS };
  return count;
}

function hasExtension(pathname: string): boolean {
  const lastSegment = pathname.split("/").pop() || "";
  return lastSegment.includes(".");
}

let settingsCache: { canonicalOrigin: string | null; expiresAt: number } | null = null;
let hasWarnedNonAuthorizedHost = false;

async function getCanonicalOrigin(): Promise<string | null> {
  const now = Date.now();
  if (settingsCache && settingsCache.expiresAt > now) return settingsCache.canonicalOrigin;
  try {
    const res = await fetch(`${INTERNAL_API}/api/seo/public-settings`);
    if (res.ok) {
      const body = await res.json();
      const canonicalOrigin = typeof body.canonicalOrigin === "string" ? body.canonicalOrigin : null;
      settingsCache = { canonicalOrigin, expiresAt: now + CACHE_TTL_MS };
      return canonicalOrigin;
    }
  } catch (_e) {
    // API unreachable — fail open (return null; isRequestHostAuthorized treats
    // "no configured origin" as authorized) rather than noindex the live site
    // over a transient backend outage. Do not cache this — retry next request.
    return null;
  }
  return null;
}

function applyHostnameNoindexGuard(response: Response, requestHost: string | null, canonicalOrigin: string | null): Response {
  if (isRequestHostAuthorized(requestHost, canonicalOrigin)) return response;
  if (!hasWarnedNonAuthorizedHost) {
    hasWarnedNonAuthorizedHost = true;
    console.warn(`⚠️ Non-production hostname guard active: request Host "${requestHost}" does not match configured canonical origin "${canonicalOrigin}". Forcing noindex,nofollow on all responses this process serves.`);
  }
  const headers = new Headers(response.headers);
  headers.set("X-Robots-Tag", "noindex, nofollow");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { request } = context;
  const method = request.method;
  const requestHost = request.headers.get("host");
  const canonicalOrigin = await getCanonicalOrigin();

  if (method !== "GET" && method !== "HEAD") {
    return applyHostnameNoindexGuard(await next(), requestHost, canonicalOrigin);
  }

  const url = new URL(request.url);
  const pathname = url.pathname;

  if (SKIP_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return applyHostnameNoindexGuard(await next(), requestHost, canonicalOrigin);
  }
  if (hasExtension(pathname)) {
    return applyHostnameNoindexGuard(await next(), requestHost, canonicalOrigin);
  }

  const activeCount = await getActiveRedirectCount();
  if (activeCount === 0) {
    return applyHostnameNoindexGuard(await next(), requestHost, canonicalOrigin);
  }

  try {
    const res = await fetch(`${INTERNAL_API}/api/redirects/resolve?path=${encodeURIComponent(pathname)}`);
    if (res.ok) {
      const { toPath, statusCode } = await res.json();
      if (toPath) {
        return applyHostnameNoindexGuard(context.redirect(toPath, statusCode || 301), requestHost, canonicalOrigin);
      }
    }
  } catch (_e) {
    // Resolve call failed — fall through to normal rendering rather than break the request.
  }

  return applyHostnameNoindexGuard(await next(), requestHost, canonicalOrigin);
});
