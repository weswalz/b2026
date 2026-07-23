// Master entity database with stable @id values. Ported from
// HEIGHTSASTRO/src/lib/db/seo-master-entities.js (read in full 2026-07-23) to
// BLVD's Express/SQLite backend. Adapted to this backend's real conventions
// (confirmed by reading backend/lib/seo-resources.js and backend/lib/seo-entities.js
// in full before writing this): function(db, ...), INTEGER AUTOINCREMENT ids
// (seo_master_entities.id, already defined this way in backend/lib/seo-schema.js),
// errors thrown as `Object.assign(new Error(message), { status })`, CommonJS.
//
// The one canonical, stable-@id record per real-world entity — the venue itself
// as a NightClub/LocalBusiness/Organization, a real named recurring performer as
// a Person, a recurring service as a Service — that a future JSON-LD schema
// builder can REFERENCE by stable @id instead of re-declaring a full inline copy
// every time.
//
// Why @id: schema.org's own data-model documentation states plainly that
// JSON-LD's built-in identifier mechanism is exactly this — "All schema.org
// syntaxes already have built-in representation for URIs and URLs, e.g. ... in
// JSON-LD, '@id'." (https://schema.org/docs/datamodel.html — same primary
// source Heights' db/seo-master-entities.js cites, fetched there 2026-07-22,
// stable enough not to need re-verification for this port). Google's own
// structured-data policy page documents @id's use for linking related items on
// one page (https://developers.google.com/search/docs/appearance/structured-data/sd-policies).
//
// Deliberately DISTINCT from seo-entities.js (SEO-0206-equivalent, resource-scoped,
// no stable public @id) and seo-taxonomy.js (classification, not a real-world
// entity). This module ships with ZERO pre-seeded rows — an admin must
// explicitly create every entity, matching seo-entities.js's/seo-taxonomy.js's
// identical "never invent a roster with no real content behind it" convention.
// BLVD's real venue content (confirmed by reading backend/init-db.js's events
// table in full) has no staff/performer roster table — free-text event fields
// only — so the realistic entity set here is the venue itself plus whatever an
// admin chooses to record.

function throwErr(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

// The venue's own stable @id slug — used by getOrganizationEntity() below and
// by a future JSON-LD renderer. Fixed, not admin-editable.
const VENUE_ORGANIZATION_SLUG = 'organization';

// Per-type real schema.org property allowlists. Every key here is a documented
// direct or commonly-inherited property of that exact schema.org type.
// validateMasterEntityInput() rejects any propertiesJson key not present in the
// allowlist for at least one of the entity's declared @types.
//
// NightClub (https://schema.org/NightClub): NightClub itself defines no
// properties of its own — it is a subtype of LocalBusiness, which descends from
// both Organization and Place. BLVD is a bar/lounge/live-music venue; the same
// inherited LocalBusiness/Place/Organization property set Heights' venue used
// applies equally here (this is schema.org's own generic LocalBusiness surface,
// not Heights-specific content).
const NIGHTCLUB_PROPERTIES = [
  'telephone', 'address', 'geo', 'openingHoursSpecification', 'areaServed',
  'knowsAbout', 'foundingDate', 'image', 'logo', 'url', 'hasMap',
  'currenciesAccepted', 'paymentAccepted', 'priceRange', 'description', 'alternateName',
];
// Organization (https://schema.org/Organization).
const ORGANIZATION_PROPERTIES = [
  'name', 'legalName', 'logo', 'url', 'sameAs', 'foundingDate', 'address',
  'contactPoint', 'description', 'alternateName',
];
// Person (https://schema.org/Person): direct properties for a real named
// recurring performer/staff member.
const PERSON_PROPERTIES = [
  'name', 'jobTitle', 'worksFor', 'image', 'description', 'url', 'sameAs', 'alternateName',
];
// Service (https://schema.org/Service): direct properties for a real recurring
// bookable service (e.g. VIP table service, private event hosting).
const SERVICE_PROPERTIES = [
  'serviceType', 'provider', 'areaServed', 'description', 'offers', 'name', 'url',
];

const ENTITY_PROPERTY_ALLOWLIST = Object.freeze({
  NightClub: [...new Set([...NIGHTCLUB_PROPERTIES, ...ORGANIZATION_PROPERTIES])],
  EventVenue: NIGHTCLUB_PROPERTIES,
  LocalBusiness: [...new Set([...NIGHTCLUB_PROPERTIES, ...ORGANIZATION_PROPERTIES])],
  Organization: ORGANIZATION_PROPERTIES,
  Person: PERSON_PROPERTIES,
  Service: SERVICE_PROPERTIES,
});

const MASTER_ENTITY_TYPES = Object.freeze(Object.keys(ENTITY_PROPERTY_ALLOWLIST));

const SEO_MASTER_ENTITY_COLUMNS = new Set(['entityTypesJson', 'name', 'idSlug', 'description', 'propertiesJson', 'sameAs', 'isActive', 'updatedAt', 'updatedBy']);

function actorLabel(actor = {}) {
  return actor.username || actor.email || actor.id || 'admin';
}

function pickAllowedColumns(data, allowedColumns) {
  const picked = {};
  for (const key of Object.keys(data || {})) {
    if (allowedColumns.has(key)) picked[key] = data[key];
  }
  return picked;
}

// Same slug shape as seo-taxonomy.js's slugify() — this fragment becomes the
// literal end of a real, permanent URI (e.g. `${siteOrigin}/#${idSlug}`).
function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function validateMasterEntityInput(data) {
  const entityTypes = Array.isArray(data.entityTypes)
    ? data.entityTypes.map((value) => String(value).trim()).filter(Boolean)
    : String(data.entityTypes || '').split(',').map((value) => value.trim()).filter(Boolean);
  if (!entityTypes.length) throwErr('At least one entity @type is required.');
  for (const type of entityTypes) {
    if (!MASTER_ENTITY_TYPES.includes(type)) {
      throwErr(`Entity @type must be one of: ${MASTER_ENTITY_TYPES.join(', ')}. Got "${type}".`);
    }
  }
  const name = String(data.name || '').trim();
  if (!name) throwErr('Entity name is required.');
  const slugSource = data.idSlug ? String(data.idSlug) : name;
  const idSlug = slugify(slugSource);
  if (!idSlug) throwErr('A stable @id slug could not be derived from the name; provide a slug directly.');
  const allowedProperties = new Set(entityTypes.flatMap((type) => ENTITY_PROPERTY_ALLOWLIST[type]));
  let properties = {};
  if (data.propertiesJson !== undefined && data.propertiesJson !== null && data.propertiesJson !== '') {
    let parsed;
    try {
      parsed = typeof data.propertiesJson === 'string' ? JSON.parse(data.propertiesJson) : data.propertiesJson;
    } catch {
      throwErr('Entity properties must be valid JSON.');
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throwErr('Entity properties must be a JSON object.');
    for (const key of Object.keys(parsed)) {
      if (!allowedProperties.has(key)) {
        throwErr(`"${key}" is not a real, documented schema.org property of ${entityTypes.join('/')}. Allowed: ${[...allowedProperties].join(', ')}.`);
      }
    }
    properties = parsed;
  }
  let sameAs = [];
  if (data.sameAs) {
    const rawList = Array.isArray(data.sameAs) ? data.sameAs : String(data.sameAs).split(/\r?\n|,/).map((value) => value.trim()).filter(Boolean);
    for (const raw of rawList) {
      let parsedUrl;
      try { parsedUrl = new URL(String(raw).trim()); } catch { throwErr(`"${raw}" is not a valid URL.`); }
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) throwErr('sameAs URLs must use HTTP or HTTPS.');
      sameAs.push(parsedUrl.href);
    }
  }
  return { entityTypes, name, idSlug, properties, sameAs };
}

function deserializeMasterEntity(row) {
  if (!row) return row;
  return {
    ...row,
    entityTypes: JSON.parse(row.entityTypesJson || '[]'),
    properties: row.propertiesJson ? JSON.parse(row.propertiesJson) : {},
    sameAs: row.sameAs ? JSON.parse(row.sameAs) : [],
  };
}

function listMasterEntities(db) {
  return db.prepare('SELECT * FROM seo_master_entities WHERE isActive = 1 ORDER BY name').all().map(deserializeMasterEntity);
}

function getMasterEntity(db, id) {
  const row = db.prepare('SELECT * FROM seo_master_entities WHERE id = ?').get(id);
  return row ? deserializeMasterEntity(row) : null;
}

function getMasterEntityBySlug(db, idSlug) {
  const row = db.prepare('SELECT * FROM seo_master_entities WHERE idSlug = ? AND isActive = 1').get(idSlug);
  return row ? deserializeMasterEntity(row) : null;
}

function createMasterEntity(db, input, actor = {}) {
  const { entityTypes, name, idSlug, properties, sameAs } = validateMasterEntityInput(input);
  const existingSlug = db.prepare('SELECT id FROM seo_master_entities WHERE idSlug = ?').get(idSlug);
  if (existingSlug) throwErr(`A master entity already uses the stable @id slug "${idSlug}".`, 409);
  const now = new Date().toISOString();
  const info = db.prepare(`
    INSERT INTO seo_master_entities (entityTypesJson, name, idSlug, description, propertiesJson, sameAs, isActive, createdAt, updatedAt, updatedBy)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
  `).run(
    JSON.stringify(entityTypes), name, idSlug,
    input.description?.toString().trim() || null,
    JSON.stringify(properties),
    JSON.stringify(sameAs),
    now, now, actorLabel(actor)
  );
  return getMasterEntity(db, info.lastInsertRowid);
}

function saveMasterEntity(db, id, input, actor = {}) {
  const current = db.prepare('SELECT * FROM seo_master_entities WHERE id = ?').get(id);
  if (!current) throwErr('Master entity was not found.', 404);
  const currentDeserialized = deserializeMasterEntity(current);
  const merged = {
    entityTypes: input.entityTypes !== undefined ? input.entityTypes : currentDeserialized.entityTypes,
    name: input.name !== undefined ? input.name : currentDeserialized.name,
    idSlug: input.idSlug !== undefined ? input.idSlug : current.idSlug,
    propertiesJson: input.propertiesJson !== undefined ? input.propertiesJson : currentDeserialized.properties,
    sameAs: input.sameAs !== undefined ? input.sameAs : currentDeserialized.sameAs,
  };
  const { entityTypes, name, idSlug, properties, sameAs } = validateMasterEntityInput(merged);
  const existingSlug = db.prepare('SELECT id FROM seo_master_entities WHERE idSlug = ? AND id != ?').get(idSlug, id);
  if (existingSlug) throwErr(`A master entity already uses the stable @id slug "${idSlug}".`, 409);
  const data = {
    entityTypesJson: JSON.stringify(entityTypes),
    name, idSlug,
    description: input.description !== undefined ? (input.description?.toString().trim() || null) : current.description,
    propertiesJson: JSON.stringify(properties),
    sameAs: JSON.stringify(sameAs),
    isActive: input.isActive === undefined ? current.isActive : (input.isActive ? 1 : 0),
    updatedAt: new Date().toISOString(),
    updatedBy: actorLabel(actor),
  };
  const allowed = pickAllowedColumns(data, SEO_MASTER_ENTITY_COLUMNS);
  const fields = Object.keys(allowed);
  if (fields.length) {
    db.prepare(`UPDATE seo_master_entities SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`).run(...fields.map((f) => allowed[f]), id);
  }
  return getMasterEntity(db, id);
}

// Soft-delete (isActive = 0) — recoverable and auditable rather than a hard
// DELETE. A retired master entity's @id simply stops resolving to an active
// record; any JSON-LD block still hardcoding a reference to it is unaffected by
// this table.
function deleteMasterEntity(db, id, actor = {}) {
  const current = db.prepare('SELECT * FROM seo_master_entities WHERE id = ?').get(id);
  if (!current) throwErr('Master entity was not found.', 404);
  db.prepare('UPDATE seo_master_entities SET isActive = 0, updatedAt = ?, updatedBy = ? WHERE id = ?').run(new Date().toISOString(), actorLabel(actor), id);
  return true;
}

// Builds the real, permanent @id URI for a master entity: `${siteOrigin}/#${idSlug}`.
function buildMasterEntityId(siteOrigin, entity) {
  return `${String(siteOrigin).replace(/\/+$/, '')}/#${entity.idSlug}`;
}

// Renders one master entity row as a real schema.org JSON-LD node, with its
// stable @id.
function buildMasterEntityJsonLd(siteOrigin, entity) {
  if (!entity) return null;
  return {
    '@type': entity.entityTypes.length > 1 ? entity.entityTypes : entity.entityTypes[0],
    '@id': buildMasterEntityId(siteOrigin, entity),
    name: entity.name,
    ...(entity.description ? { description: entity.description } : {}),
    ...(entity.sameAs.length ? { sameAs: entity.sameAs.length === 1 ? entity.sameAs[0] : entity.sameAs } : {}),
    ...entity.properties,
  };
}

// The venue's own master entity row, if an admin has created it yet. Returns
// null — never a fabricated fallback object — when it does not exist yet.
function getOrganizationEntity(db) {
  return getMasterEntityBySlug(db, VENUE_ORGANIZATION_SLUG);
}

module.exports = {
  VENUE_ORGANIZATION_SLUG, MASTER_ENTITY_TYPES,
  validateMasterEntityInput,
  listMasterEntities, getMasterEntity, getMasterEntityBySlug,
  createMasterEntity, saveMasterEntity, deleteMasterEntity,
  buildMasterEntityId, buildMasterEntityJsonLd, getOrganizationEntity,
};
