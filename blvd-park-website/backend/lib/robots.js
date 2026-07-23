// robots.txt default text, syntax validator, and per-user-agent path tester.
// Ported from HEIGHTSASTRO/src/lib/robots.js (read in full 2026-07-23) to
// BLVD's Express/SQLite backend. These three functions are pure (no DB, no I/O)
// so they translate verbatim in logic — only DEFAULT_ROBOTS_TEXT's content
// changes, adapted to BLVD's real domain and real route surface.
//
// Domain: BLVD's real production domain is blvdpark.com (confirmed by reading
// backend/server.js's siteUrlBase()/FRONTEND_URL default at backend/server.js:120,
// backend/init-db.js's default admin email 'admin@blvdpark.com', and
// backend/lib/seo-schema.js's seo_site_settings seed default — all three agree).
//
// Admin path: BLVD's real admin routes live under /admin/* on the SSR frontend
// and /api/* on the Express backend (confirmed by reading
// blvd-park-website/CLAUDE.md's "Backend API Surface" table and
// src/pages/admin/ directory structure) — same shape as Heights'
// /admin + /api disallow pair, not a coincidence of copying but a genuinely
// matching architecture (both are Astro admin + separate API backend).
//
// Sitemap surface: BLVD has exactly ONE real sitemap file, src/pages/sitemap.xml.ts
// (confirmed by reading that file in full — a single urlset combining static
// paths + published CMS pages + active events; no sitemap-images.xml,
// sitemap-videos.xml, or true sitemap index exists). src/pages/sitemap-index.xml.ts
// is NOT a real sitemap index — it is a 301 redirect to /sitemap.xml for a
// legacy URL (confirmed by reading that file in full: `new Response(null, {
// status: 301, headers: { Location: "/sitemap.xml" } })`). So this default
// robots.txt advertises only the one real Sitemap: line BLVD actually serves —
// listing the legacy redirect URL or fabricated image/video sitemap URLs here
// would be advertising URLs that don't serve real sitemap content, which is
// exactly the kind of fabrication this project's rules forbid.
const DEFAULT_ROBOTS_TEXT = `# robots.txt for BLVD Park

User-agent: *
Allow: /
Disallow: /admin
Disallow: /api

# AI search and user-initiated retrieval bots
User-agent: OAI-SearchBot
User-agent: ChatGPT-User
User-agent: Claude-SearchBot
User-agent: Claude-User
User-agent: PerplexityBot
User-agent: Perplexity-User
User-agent: Google-Extended
User-agent: Gemini-Deep-Research
User-agent: Google-NotebookLM
User-agent: Bingbot
User-agent: DuckAssistBot
User-agent: Bravebot
User-agent: YouBot
User-agent: PhindBot
User-agent: TavilyBot
User-agent: MistralAI-User
Allow: /
Disallow: /admin/
Disallow: /api/

# Standard search crawlers
User-agent: Googlebot
Allow: /
Disallow: /admin/
Disallow: /api/

User-agent: SemrushBot
Allow: /
Crawl-delay: 10
Disallow: /admin
Disallow: /api

# Low-value bulk harvesting crawlers
User-agent: AhrefsBot
User-agent: MJ12bot
User-agent: DotBot
User-agent: Bytespider
User-agent: CCBot
User-agent: FacebookBot
User-agent: Meta-ExternalAgent
User-agent: TikTokSpider
User-agent: DeepSeekBot
Disallow: /

Sitemap: https://blvdpark.com/sitemap.xml
`;

function validateRobotsText(text) {
  const errors = [];
  const warnings = [];
  const lines = String(text || '').split(/\r?\n/);
  let hasUserAgent = false;
  lines.forEach((raw, index) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const match = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!match) {
      errors.push(`Line ${index + 1}: expected Directive: value`);
      return;
    }
    const directive = match[1].toLowerCase();
    const value = match[2].trim();
    if (!['user-agent', 'allow', 'disallow', 'crawl-delay', 'sitemap', 'host', 'clean-param'].includes(directive)) {
      warnings.push(`Line ${index + 1}: unknown directive ${match[1]}`);
    }
    if (directive === 'user-agent') hasUserAgent = true;
    if (!value && !['allow', 'disallow'].includes(directive)) errors.push(`Line ${index + 1}: ${match[1]} requires a value`);
    if (directive === 'sitemap') {
      try { new URL(value); } catch { errors.push(`Line ${index + 1}: Sitemap must be an absolute URL`); }
    }
  });
  if (!hasUserAgent) errors.push('At least one User-agent group is required.');
  return { valid: errors.length === 0, errors, warnings };
}

function parseGroups(text) {
  const groups = [];
  let current = null;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const match = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!match) continue;
    const directive = match[1].toLowerCase();
    const value = match[2].trim();
    if (directive === 'user-agent') {
      if (!current || current.rules.length) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if (current && ['allow', 'disallow'].includes(directive)) {
      current.rules.push({ directive, value });
    }
  }
  return groups;
}

function testRobotsPath(text, userAgent, path) {
  const agent = String(userAgent || '*').toLowerCase();
  const pathname = String(path || '/').startsWith('/') ? String(path || '/') : `/${path}`;
  const groups = parseGroups(text);
  const exact = groups.filter((group) => group.agents.some((value) => value !== '*' && agent.includes(value)));
  const candidates = exact.length ? exact : groups.filter((group) => group.agents.includes('*'));
  const matches = candidates.flatMap((group) => group.rules)
    .filter((rule) => rule.value && pathname.startsWith(rule.value))
    .sort((a, b) => b.value.length - a.value.length || (a.directive === 'allow' ? -1 : 1));
  return { allowed: !matches.length || matches[0].directive === 'allow', matchedRule: matches[0] || null };
}

module.exports = { DEFAULT_ROBOTS_TEXT, validateRobotsText, testRobotsPath };
