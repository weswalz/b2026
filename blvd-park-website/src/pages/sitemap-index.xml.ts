import type { APIRoute } from 'astro';
import { sitemapIndexResponse } from '../lib/sitemap-family';

// Explicit alias for operators and sitemap validators. This is a real 200 XML
// sitemap index, not the former redirect to /sitemap.xml.
export const GET: APIRoute = () => sitemapIndexResponse();
