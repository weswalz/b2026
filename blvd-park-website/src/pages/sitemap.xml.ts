import type { APIRoute } from 'astro';
import { sitemapIndexResponse } from '../lib/sitemap-family';

// The canonical sitemap URL is an index. Keeping the index at /sitemap.xml
// preserves the URL already advertised in robots.txt and Search Console.
export const GET: APIRoute = () => sitemapIndexResponse();
