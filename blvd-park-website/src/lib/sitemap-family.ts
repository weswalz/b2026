import { isSitemapEligible } from './sitemap-eligibility.mjs';

const ORIGIN = 'https://blvdpark.com';
const STATIC_PATHS = ['/', '/menu', '/menu/lunch', '/book', '/contact', '/private-events', '/privacy', '/terms'];

type SitemapEligibility = { path: string; includeSitemap?: number; indexState?: string; httpStatus?: number; isActive?: number };
type CmsPage = SitemapEligibility & { slug: string; updated_at?: string; robots?: string };
type Event = SitemapEligibility & { slug: string | null; updatedAt?: string; status: string; deleted_at: string | null; image?: string | null; title?: string };
type GalleryImage = { url: string; alt?: string };

const xml = (body: string) =>
  new Response(`<?xml version="1.0" encoding="UTF-8"?>\n${body}\n`, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
    },
  });

export const escapeXml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const absolute = (path: string) => new URL(path, ORIGIN).href;
const validDate = (value?: string) => {
  if (!value) return null;
  const date = new Date(value.endsWith('Z') ? value : `${value}Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

async function apiJson<T>(path: string, fallback: T): Promise<T> {
  const internalApi = process.env.INTERNAL_API_URL || import.meta.env.PUBLIC_API_URL || ORIGIN;
  try {
    const response = await fetch(`${internalApi}${path}`);
    return response.ok ? await response.json() : fallback;
  } catch {
    return fallback;
  }
}

export function sitemapIndexResponse() {
  const lastmod = new Date().toISOString();
  const entries = ['sitemap-pages.xml', 'sitemap-images.xml', 'sitemap-videos.xml']
    .map((name) => `  <sitemap><loc>${ORIGIN}/${name}</loc><lastmod>${lastmod}</lastmod></sitemap>`)
    .join('\n');
  return xml(`<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</sitemapindex>`);
}

export async function pageSitemapResponse() {
  const [pages, events, eligibilityRows] = await Promise.all([
    apiJson<CmsPage[]>('/api/pages/public-list', []),
    apiJson<Event[]>('/api/events', []),
    apiJson<SitemapEligibility[]>('/api/seo/public/sitemap-eligibility', []),
  ]);
  const eligibility = new Map(eligibilityRows.map((row) => [row.path, row]));
  const rows = [
    ...STATIC_PATHS
      .filter((path) => isSitemapEligible(eligibility.get(path)))
      .map((path) => ({ loc: absolute(path), lastmod: null })),
    ...pages
      .filter((page) => isSitemapEligible(page) && !String(page.robots || '').includes('noindex'))
      .map((page) => ({ loc: absolute(`/${page.slug}`), lastmod: validDate(page.updated_at) })),
    ...events
      .filter((event) => event.slug && event.status === 'active' && !event.deleted_at && isSitemapEligible(event))
      .map((event) => ({ loc: absolute(`/events/${event.slug}`), lastmod: validDate(event.updatedAt) })),
  ];
  const entries = rows
    .map(({ loc, lastmod }) => `  <url><loc>${escapeXml(loc)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`)
    .join('\n');
  return xml(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>`);
}

export async function imageSitemapResponse() {
  const [gallery, events, eligibilityRows] = await Promise.all([
    apiJson<GalleryImage[]>('/api/gallery', []),
    apiJson<Event[]>('/api/events', []),
    apiJson<SitemapEligibility[]>('/api/seo/public/sitemap-eligibility', []),
  ]);
  const eligibility = new Map(eligibilityRows.map((row) => [row.path, row]));
  const grouped = new Map<string, { loc: string; title: string }[]>();
  if (isSitemapEligible(eligibility.get('/'))) {
    for (const image of gallery) {
      if (!image.url) continue;
      const items = grouped.get(ORIGIN + '/') || [];
      items.push({ loc: absolute(image.url), title: image.alt || 'BLVD Park' });
      grouped.set(ORIGIN + '/', items);
    }
  }
  for (const event of events) {
    if (!event.slug || !event.image || event.status !== 'active' || event.deleted_at || !isSitemapEligible(event)) continue;
    grouped.set(absolute(`/events/${event.slug}`), [{ loc: absolute(event.image), title: event.title || 'BLVD Park event' }]);
  }
  const entries = [...grouped.entries()].map(([loc, images]) =>
    `  <url><loc>${escapeXml(loc)}</loc>${images.map((image) =>
      `<image:image><image:loc>${escapeXml(image.loc)}</image:loc><image:title>${escapeXml(image.title)}</image:title></image:image>`
    ).join('')}</url>`
  ).join('\n');
  return xml(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${entries}\n</urlset>`);
}

export async function videoSitemapResponse() {
  const eligibilityRows = await apiJson<SitemapEligibility[]>('/api/seo/public/sitemap-eligibility', []);
  const eligibility = new Map(eligibilityRows.map((row) => [row.path, row]));
  // BLVD's real CMS-controlled hero video is the current video inventory.
  const entry = isSitemapEligible(eligibility.get('/'))
    ? `  <url><loc>${ORIGIN}/</loc><video:video><video:thumbnail_loc>${ORIGIN}/images/hero-background.webp</video:thumbnail_loc><video:title>BLVD Park</video:title><video:description>The Heights&apos; playground, sports bar, and pickleball venue.</video:description><video:content_loc>${ORIGIN}/images/blvdhero.mp4</video:content_loc></video:video></url>`
    : '';
  return xml(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">\n${entry}\n</urlset>`);
}
