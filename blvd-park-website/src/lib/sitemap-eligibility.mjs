export function isSitemapEligible(resource) {
  if (!resource) return true;
  return resource.includeSitemap !== 0
    && resource.indexState !== 'noindex'
    && Number(resource.httpStatus ?? 200) === 200
    && resource.isActive !== 0;
}
