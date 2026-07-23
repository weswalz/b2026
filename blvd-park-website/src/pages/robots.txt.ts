// Dynamic robots.txt (Wave-2 item #6), replacing the static public/robots.txt
// (deleted in the same commit that added this route — the node adapter would
// otherwise shadow this dynamic route with the static file, and the seeded
// DB value must be the single source of truth an admin edits going forward).
//
// Fetches GET /api/seo/robots from the Express backend — a public,
// unauthenticated, plain-text endpoint (backend/server.js) that returns
// seo_site_settings.robotsText, seeded with this file's own prior real
// content, falling back to backend/lib/robots.js's DEFAULT_ROBOTS_TEXT only
// if that column is genuinely unset. Follows the exact INTERNAL_API fetch
// pattern already established by src/pages/[key].txt.ts and
// src/pages/sitemap.xml.ts (read both in full before writing this) — same
// env var resolution order, same try/catch-with-fallback shape, so a
// backend outage never serves a broken or empty robots.txt: this route
// falls back to the identical seed text baked in below.
import type { APIRoute } from "astro";

// Kept in sync by hand with backend/lib/seo-schema.js's seo_site_settings
// seed value (both are literal copies of the original public/robots.txt
// content) — this is the LAST-RESORT fallback for when the backend is
// completely unreachable, not the source of truth an admin edits.
const FALLBACK_ROBOTS_TEXT = `# robots.txt for BLVD Park
User-agent: *
Allow: /

# Sitemap location
Sitemap: https://blvdpark.com/sitemap.xml

# Block admin pages
Disallow: /admin/
`;

export const GET: APIRoute = async () => {
  const INTERNAL_API = process.env.INTERNAL_API_URL || import.meta.env.PUBLIC_API_URL || "https://blvdpark.com";

  let text = FALLBACK_ROBOTS_TEXT;
  try {
    const res = await fetch(`${INTERNAL_API}/api/seo/robots`);
    if (res.ok) {
      const body = await res.text();
      if (body && body.trim()) text = body;
    }
  } catch (_e) {
    // Backend unreachable — serve the fallback rather than a 500 or empty body.
  }

  return new Response(text, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
