// Related-entity coverage — content-level scope: "which named real-world
// entities does a given piece of content reference." Ported from
// HEIGHTSASTRO/src/lib/db/seo-entities.js (read in full 2026-07-23) to BLVD's
// Express/SQLite backend. Adapted to this backend's real conventions (confirmed
// by reading backend/lib/seo-resources.js in full before writing this):
//   - function(db, ...) — no module-level connectToDatabase() singleton
//   - INTEGER AUTOINCREMENT ids (seo_entities.id, seo_entity_references.id —
//     both already defined this way in backend/lib/seo-schema.js)
//   - errors thrown as `Object.assign(new Error(message), { status })`
//   - CommonJS
//
// NOT the same as the Phase-6 master entity database (seo-master-entities.js):
// this table is a lightweight, reusable registry (an admin names a real
// person/organization/place/service once, then references it from multiple
// resources) — not a knowledge-graph entity with a stable public @id. See
// seo-master-entities.js's own header comment for the full boundary.
//
// role is restricted to a fixed, schema.org-verified vocabulary — never a
// free-text string an admin could invent — so every reference maps directly to
// a real JSON-LD property a page's schema block can safely emit:
//   'mentions'   -> CreativeWork.mentions   (https://schema.org/mentions)
//   'about'      -> CreativeWork/Event.about (https://schema.org/about)
//   'performer'  -> Event.performer          (https://schema.org/Event)
//   'organizer'  -> Event.organizer          (https://schema.org/Event)
//   'sponsor'    -> Event.sponsor            (https://schema.org/Event)
// (Same primary sources Heights' db/seo-entities.js cites, fetched there
// 2026-07-22 — schema.org's own vocabulary is stable enough not to need
// re-verification for this port.)

function throwErr(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

const ENTITY_TYPES = Object.freeze(['Person', 'Organization', 'Place', 'Service']);

// role -> the real schema.org property it renders as. 'performer'/'organizer'/
// 'sponsor' are Event-scoped properties — only emitted when the resource's own
// JSON-LD block is an Event; on a non-Event resource those roles still store
// correctly but render as 'mentions' instead (see buildEntityJsonLdProperties).
const ENTITY_REFERENCE_ROLES = Object.freeze(['mentions', 'about', 'performer', 'organizer', 'sponsor']);

const SEO_ENTITY_COLUMNS = new Set(['entityType', 'name', 'description', 'sameAs', 'schemaType', 'isActive', 'updatedAt', 'updatedBy']);

function pickAllowedColumns(data, allowedColumns) {
  const picked = {};
  for (const key of Object.keys(data || {})) {
    if (allowedColumns.has(key)) picked[key] = data[key];
  }
  return picked;
}

function actorLabel(actor = {}) {
  return actor.username || actor.email || actor.id || 'admin';
}

function validateEntityInput(data) {
  const entityType = String(data.entityType || '').trim();
  const name = String(data.name || '').trim();
  if (!ENTITY_TYPES.includes(entityType)) {
    throwErr(`Entity type must be one of: ${ENTITY_TYPES.join(', ')}.`);
  }
  if (!name) throwErr('Entity name is required.');
  let sameAs = null;
  if (data.sameAs) {
    let parsed;
    try { parsed = new URL(String(data.sameAs).trim()); } catch { throwErr(`"${data.sameAs}" is not a valid URL.`); }
    if (!['http:', 'https:'].includes(parsed.protocol)) throwErr('Entity sameAs URLs must use HTTP or HTTPS.');
    sameAs = parsed.href;
  }
  return { entityType, name, sameAs };
}

function validateEntityReferenceInput(data) {
  const seoResourceId = data.seoResourceId;
  const seoEntityId = data.seoEntityId;
  const role = String(data.role || '').trim();
  if (!seoResourceId) throwErr('An SEO resource is required.');
  if (!seoEntityId) throwErr('An entity is required.');
  if (!ENTITY_REFERENCE_ROLES.includes(role)) throwErr(`Role must be one of: ${ENTITY_REFERENCE_ROLES.join(', ')}.`);
  return { seoResourceId: Number(seoResourceId), seoEntityId: Number(seoEntityId), role };
}

// All active entities, alphabetical — used to populate the "attach an existing
// entity" picker so an admin reuses a recurring DJ's entity row instead of
// accidentally creating a duplicate every time.
function listSeoEntities(db) {
  return db.prepare('SELECT * FROM seo_entities WHERE isActive = 1 ORDER BY name').all();
}

function getSeoEntity(db, id) {
  return db.prepare('SELECT * FROM seo_entities WHERE id = ?').get(id);
}

function createSeoEntity(db, input, actor = {}) {
  const { entityType, name, sameAs } = validateEntityInput(input);
  const now = new Date().toISOString();
  const info = db.prepare(`
    INSERT INTO seo_entities (entityType, name, description, sameAs, schemaType, isActive, createdAt, updatedAt, updatedBy)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
  `).run(
    entityType, name,
    input.description?.toString().trim() || null,
    sameAs,
    input.schemaType?.toString().trim() || null,
    now, now, actorLabel(actor)
  );
  return getSeoEntity(db, info.lastInsertRowid);
}

function saveSeoEntity(db, id, input, actor = {}) {
  const current = getSeoEntity(db, id);
  if (!current) throwErr('Entity was not found.', 404);
  const { entityType, name, sameAs } = validateEntityInput({ ...current, ...input });
  const data = {
    entityType, name, sameAs,
    description: input.description?.toString().trim() || null,
    schemaType: input.schemaType?.toString().trim() || null,
    isActive: input.isActive === undefined ? current.isActive : (input.isActive ? 1 : 0),
    updatedAt: new Date().toISOString(),
    updatedBy: actorLabel(actor),
  };
  const allowed = pickAllowedColumns(data, SEO_ENTITY_COLUMNS);
  const fields = Object.keys(allowed);
  if (fields.length) {
    db.prepare(`UPDATE seo_entities SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`).run(...fields.map((f) => allowed[f]), id);
  }
  return getSeoEntity(db, id);
}

// Soft-delete (isActive = 0) — recoverable and auditable rather than a hard
// DELETE. Existing references to this entity are left in place (filtered out of
// rendering, not silently orphaned/deleted).
function deleteSeoEntity(db, id, actor = {}) {
  const current = getSeoEntity(db, id);
  if (!current) throwErr('Entity was not found.', 404);
  db.prepare('UPDATE seo_entities SET isActive = 0, updatedAt = ?, updatedBy = ? WHERE id = ?').run(new Date().toISOString(), actorLabel(actor), id);
  return true;
}

// Active entity references for one resource, joined to the entity itself, in
// display order. A reference whose entity was later deactivated is excluded, so
// a retired entity can never keep rendering publicly.
function listEntityReferencesForResource(db, seoResourceId) {
  return db.prepare(`
    SELECT ref.id, ref.role, ref.displayOrder, ref.createdAt, ref.createdBy,
           ent.id AS entityId, ent.entityType, ent.name, ent.description, ent.sameAs, ent.schemaType
    FROM seo_entity_references ref
    JOIN seo_entities ent ON ent.id = ref.seoEntityId
    WHERE ref.seoResourceId = ? AND ent.isActive = 1
    ORDER BY ref.displayOrder, ref.createdAt
  `).all(seoResourceId);
}

function createEntityReference(db, input, actor = {}) {
  const { seoResourceId, seoEntityId, role } = validateEntityReferenceInput(input);
  const resource = db.prepare('SELECT id FROM seo_resources WHERE id = ?').get(seoResourceId);
  if (!resource) throwErr('SEO resource was not found.', 404);
  const entity = db.prepare('SELECT id FROM seo_entities WHERE id = ? AND isActive = 1').get(seoEntityId);
  if (!entity) throwErr('Entity was not found.', 404);
  const existing = db.prepare('SELECT id FROM seo_entity_references WHERE seoResourceId = ? AND seoEntityId = ? AND role = ?').get(seoResourceId, seoEntityId, role);
  if (existing) throwErr('This entity is already declared in that role on this resource.', 409);
  const now = new Date().toISOString();
  const info = db.prepare(`
    INSERT INTO seo_entity_references (seoResourceId, seoEntityId, role, displayOrder, createdAt, createdBy)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(seoResourceId, seoEntityId, role, Number.isInteger(Number(input.displayOrder)) ? Number(input.displayOrder) : 0, now, actorLabel(actor));
  return db.prepare('SELECT * FROM seo_entity_references WHERE id = ?').get(info.lastInsertRowid);
}

// Hard delete — this is a pure join-row declaration ("resource X references
// entity Y as role Z"), not a record with its own history worth soft-deleting.
function deleteEntityReference(db, id, actor = {}) {
  const current = db.prepare('SELECT * FROM seo_entity_references WHERE id = ?').get(id);
  if (!current) throwErr('Entity reference was not found.', 404);
  db.prepare('DELETE FROM seo_entity_references WHERE id = ?').run(id);
  return true;
}

// role -> real schema.org JSON-LD property name this reference renders as.
// 'performer'/'organizer'/'sponsor' are only meaningful in Event JSON-LD — the
// caller is responsible for only emitting those onto an Event-typed schema
// block; buildEntityJsonLdProperties() below handles that fallback.
const ROLE_TO_EVENT_PROPERTY = Object.freeze({
  mentions: 'mentions',
  about: 'about',
  performer: 'performer',
  organizer: 'organizer',
  sponsor: 'sponsor',
});

// One schema.org Thing node for an entity reference row (as returned by
// listEntityReferencesForResource). @type is entityType unless a more specific
// schemaType override was set. sameAs is included only when set.
function entityToThing(ref) {
  return {
    '@type': ref.schemaType || ref.entityType,
    name: ref.name,
    ...(ref.sameAs ? { sameAs: ref.sameAs } : {}),
  };
}

// Groups a resource's active entity references into real schema.org JSON-LD
// properties, ready to spread onto a CreativeWork/Event schema block. Each role
// becomes its own property; a role with multiple entities becomes an array.
// 'performer'/'organizer'/'sponsor' are only included when isEventContext is
// true; on a non-Event resource those three roles fold into 'mentions' instead
// of being dropped.
function buildEntityJsonLdProperties(references, options = {}) {
  const { isEventContext = false } = options;
  const grouped = {};
  for (const ref of references || []) {
    const isEventOnlyRole = ['performer', 'organizer', 'sponsor'].includes(ref.role);
    const property = (isEventOnlyRole && !isEventContext) ? 'mentions' : ROLE_TO_EVENT_PROPERTY[ref.role];
    if (!property) continue;
    const thing = entityToThing(ref);
    if (grouped[property] === undefined) {
      grouped[property] = thing;
    } else if (Array.isArray(grouped[property])) {
      grouped[property].push(thing);
    } else {
      grouped[property] = [grouped[property], thing];
    }
  }
  return grouped;
}

module.exports = {
  ENTITY_TYPES, ENTITY_REFERENCE_ROLES,
  validateEntityInput, validateEntityReferenceInput,
  listSeoEntities, getSeoEntity, createSeoEntity, saveSeoEntity, deleteSeoEntity,
  listEntityReferencesForResource, createEntityReference, deleteEntityReference,
  buildEntityJsonLdProperties,
};
