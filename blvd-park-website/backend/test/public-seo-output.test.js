const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const helpersPromise = import(pathToFileURL(path.join(__dirname, '..', '..', 'src', 'lib', 'public-seo.mjs')).href);
const sitemapEligibilityPromise = import(pathToFileURL(path.join(__dirname, '..', '..', 'src', 'lib', 'sitemap-eligibility.mjs')).href);

test('page resource schemaJson is serialized once and cannot terminate its JSON-LD script', async () => {
  const { buildPageJsonLd } = await helpersPromise;
  const marker = 'RESOURCE-SCHEMA-PAGE-ONCE';
  const output = buildPageJsonLd({
    page: { json_ld: JSON.stringify({ '@type': 'WebPage', name: 'legacy schema' }) },
    resource: {
      schemaJson: {
        '@context': 'https://schema.org',
        '@type': 'AboutPage',
        identifier: marker,
        name: '</script><script>alert(1)</script>',
      },
    },
    entityJsonLd: {},
    terms: [],
  });

  assert.strictEqual((output.match(new RegExp(marker, 'g')) || []).length, 1);
  assert.ok(!output.includes('</script>'));
  assert.ok(output.includes('\\u003c/script>'));
  assert.strictEqual(JSON.parse(output)['@type'], 'AboutPage', 'resource schema must supersede the legacy page JSON-LD');
});

test('event resource schemaJson is merged once into the generated Event output and safely escaped', async () => {
  const { buildEventJsonLd } = await helpersPromise;
  const marker = 'RESOURCE-SCHEMA-EVENT-ONCE';
  const output = buildEventJsonLd({
    event: { title: 'QA Event', date: '2030-01-02', time: '19:00', status: 'active' },
    resource: { schemaJson: { identifier: marker, description: '</script><script>alert(2)</script>' } },
    entityJsonLd: {},
    terms: [{ name: 'Pickleball' }],
  });
  const parsed = JSON.parse(output);

  assert.strictEqual((output.match(new RegExp(marker, 'g')) || []).length, 1);
  assert.ok(!output.includes('</script>'));
  assert.strictEqual(parsed['@type'], 'Event');
  assert.strictEqual(parsed.identifier, marker);
  assert.deepStrictEqual(parsed.keywords, ['Pickleball']);
});

test('sitemap eligibility consistently requires inclusion, indexability, HTTP 200, and an active resource', async () => {
  const { isSitemapEligible } = await sitemapEligibilityPromise;
  assert.strictEqual(isSitemapEligible(undefined), true, 'unmanaged static routes retain their default eligibility');
  assert.strictEqual(isSitemapEligible({ includeSitemap: 1, indexState: 'index', httpStatus: 200, isActive: 1 }), true);
  assert.strictEqual(isSitemapEligible({ includeSitemap: 0, indexState: 'index', httpStatus: 200, isActive: 1 }), false);
  assert.strictEqual(isSitemapEligible({ includeSitemap: 1, indexState: 'noindex', httpStatus: 200, isActive: 1 }), false);
  assert.strictEqual(isSitemapEligible({ includeSitemap: 1, indexState: 'index', httpStatus: 410, isActive: 1 }), false);
  assert.strictEqual(isSitemapEligible({ includeSitemap: 1, indexState: 'index', httpStatus: 200, isActive: 0 }), false);
});
