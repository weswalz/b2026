// Legacy sitemap URL (advertised in older robots.txt / search consoles) — permanent redirect.
import type { APIRoute } from "astro";

export const GET: APIRoute = () =>
  new Response(null, { status: 301, headers: { Location: "/sitemap.xml" } });
