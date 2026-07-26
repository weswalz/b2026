const isRecord = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

const schemaObject = (value) => {
  if (isRecord(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

// JSON-LD is written into a script element with set:html. Escaping "<" keeps
// administrator-authored values such as "</script>" inside JSON data instead
// of allowing them to terminate the element. The line-separator escapes keep
// the payload valid in JavaScript-aware consumers as well.
export const serializeJsonLd = (value) =>
  JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

const enrichment = (entityJsonLd, terms) => ({
  ...(isRecord(entityJsonLd) ? entityJsonLd : {}),
  ...(Array.isArray(terms) && terms.length
    ? { keywords: terms.map((term) => term?.name).filter(Boolean) }
    : {}),
});

export function buildPageJsonLd({ page, resource, entityJsonLd, terms }) {
  const base =
    schemaObject(resource?.schemaJson) ||
    schemaObject(page?.json_ld) || {
      '@context': 'https://schema.org',
      '@type': resource?.schemaType || 'WebPage',
    };
  return serializeJsonLd({ ...base, ...enrichment(entityJsonLd, terms) });
}

export function buildEventJsonLd({ event, resource, entityJsonLd, terms }) {
  const startDateTime = event.time ? `${event.date}T${event.time}:00` : event.date;
  const generated = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.title,
    startDate: startDateTime,
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    eventStatus:
      event.status === 'cancelled'
        ? 'https://schema.org/EventCancelled'
        : 'https://schema.org/EventScheduled',
    location: {
      '@type': 'Place',
      name: 'BLVD Park',
      address: {
        '@type': 'PostalAddress',
        streetAddress: '1119 W 20th Street',
        addressLocality: 'Houston',
        addressRegion: 'TX',
        postalCode: '77008',
        addressCountry: 'US',
      },
    },
    ...(event.description ? { description: event.description } : {}),
    ...(event.image ? { image: [`https://blvdpark.com${event.image}`] } : {}),
    ...(event.ticketUrl ? { url: event.ticketUrl } : {}),
  };
  const configured = schemaObject(resource?.schemaJson);
  return serializeJsonLd({
    ...generated,
    ...(configured || {}),
    ...enrichment(entityJsonLd, terms),
  });
}
