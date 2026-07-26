import type { APIRoute } from 'astro';
import { pageSitemapResponse } from '../lib/sitemap-family';

export const GET: APIRoute = () => pageSitemapResponse();
