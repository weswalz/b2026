import type { APIRoute } from 'astro';
import { videoSitemapResponse } from '../lib/sitemap-family';

export const GET: APIRoute = async () => videoSitemapResponse();
