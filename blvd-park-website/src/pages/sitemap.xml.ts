// Dynamic sitemap — static routes + published CMS pages whose robots is indexable.
// Replaces the build-time @astrojs/sitemap integration.
import type { APIRoute } from "astro";

const BASE = "https://blvdpark.com";
const STATIC_PATHS = ["/", "/menu", "/menu/lunch", "/book", "/contact", "/private-events", "/privacy", "/terms"];

export const GET: APIRoute = async () => {
  const INTERNAL_API = process.env.INTERNAL_API_URL || "https://blvdpark.com";
  let cms: { slug: string; updated_at: string; robots: string }[] = [];
  try {
    const r = await fetch(`${INTERNAL_API}/api/pages/public-list`);
    if (r.ok) cms = await r.json();
  } catch (_e) {}

  const urls = [
    ...STATIC_PATHS.map((p) => `  <url><loc>${BASE}${p === "/" ? "/" : p}</loc></url>`),
    ...cms
      .filter((p) => !String(p.robots || "").includes("noindex"))
      .map((p) => `  <url><loc>${BASE}/${p.slug}</loc><lastmod>${new Date(p.updated_at + "Z").toISOString()}</lastmod></url>`),
  ].join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
};
