import type { APIRoute } from 'astro';
import { imageSitemapResponse } from '../lib/sitemap-family';

export const GET: APIRoute = () => imageSitemapResponse();
