// Redirects middleware — resolves GET/HEAD requests against the redirects manager
// before Astro renders the route. Skips /admin, /api, /uploads, and extensioned
// requests (assets) entirely. The active-redirect count is cached for 30s so the
// common case (no redirects configured) costs one cheap in-memory check per request
// instead of a network round-trip. See backend/lib/redirects.js for the resolver.
import { defineMiddleware } from "astro:middleware";

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

export const onRequest = defineMiddleware(async (context, next) => {
  const { request } = context;
  const method = request.method;

  if (method !== "GET" && method !== "HEAD") return next();

  const url = new URL(request.url);
  const pathname = url.pathname;

  if (SKIP_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return next();
  if (hasExtension(pathname)) return next();

  const activeCount = await getActiveRedirectCount();
  if (activeCount === 0) return next();

  try {
    const res = await fetch(`${INTERNAL_API}/api/redirects/resolve?path=${encodeURIComponent(pathname)}`);
    if (res.ok) {
      const { toPath, statusCode } = await res.json();
      if (toPath) {
        return context.redirect(toPath, statusCode || 301);
      }
    }
  } catch (_e) {
    // Resolve call failed — fall through to normal rendering rather than break the request.
  }

  return next();
});
