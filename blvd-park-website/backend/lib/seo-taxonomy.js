// Managed taxonomy: categories/tags/collections/topics, pillar/cluster
// hierarchy, duplicate-term detection. Ported from
// HEIGHTSASTRO/src/lib/db/seo-taxonomy.js (read in full 2026-07-23) to BLVD's
// Express/SQLite backend. Adapted to this backend's real conventions (confirmed
// by reading backend/lib/seo-resources.js and backend/lib/seo-entities.js in
// full before writing this): function(db, ...), INTEGER AUTOINCREMENT ids
// (seo_taxonomy_terms.id, seo_resource_terms.id — already defined this way in
// backend/lib/seo-schema.js), errors thrown as
// `Object.assign(new Error(message), { status })`, CommonJS.
//
// Mirrors seo-entities.js's module shape and house style exactly — same
// validate/CRUD/soft-delete conventions — because both are "lightweight
// reusable registry + join table onto seo_resources" problems, not because
// taxonomy and entities are the same concept. NOT the same as
// seo_entities/seo_entity_references: those are real-world referenced THINGS
// rendered as schema.org Thing nodes; taxonomy terms are classification buckets
// (which category/tag/collection/topic a resource belongs to) — no schema.org
// property renders "this page's tags" as structured data the way an entity
// reference does.
//
// Shingle/Jaccard near-duplicate primitives: Heights' db/seo-taxonomy.js
// imports normalizeVisibleText/shingleText/jaccardSimilarity from its own
// src/lib/seo-audit.js (the crawler engine). BLVD's equivalent crawler port
// (backend/lib/seo-audit.js) is being built in parallel by a different agent
// and does not exist on disk yet as of this port (confirmed: no
// backend/lib/*audit* file present, and backend/lib/seo-resources.js — the only
// other already-built module — has no such exports either). Per this task's own
// ownership boundary ("do not touch backend/lib/seo-audit.js — the other agent
// owns it"), this module cannot import a not-yet-existing file it isn't
// authorized to create or shape. The three primitives below are therefore
// reimplemented directly in this file, self-contained — same algorithm
// (Broder 1997/2000 word-shingle resemblance; Jaccard 1912 set similarity),
// same behavior, just not cross-imported from a module outside this port's
// ownership. If/when backend/lib/seo-audit.js lands with equivalent exports,
// these three local functions are safe to delete and re-point at that module —
// they are pure, freestanding, and carry no other module-specific state.

function throwErr(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

const TAXONOMY_TERM_TYPES = Object.freeze(['category', 'tag', 'collection', 'topic']);

const SEO_TAXONOMY_TERM_COLUMNS = new Set(['name', 'slug', 'termType', 'description', 'parentTermId', 'indexEligible', 'isActive', 'updatedAt', 'updatedBy']);

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

// Same slugification shape as seo-master-entities.js's slugify() — lowercase,
// hyphen-separated, alnum only.
function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ---------------------------------------------------------------------------
// Shingle/Jaccard near-duplicate primitives (self-contained — see header note)
// ---------------------------------------------------------------------------

// Strips markup/whitespace noise down to plain visible-text words, lowercased,
// for shingle comparison. A taxonomy term name has no HTML in practice, but this
// stays defensive (an admin could paste rich text into a name field) rather than
// assuming clean input.
function normalizeVisibleText(text) {
  return String(text || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;/g, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Splits normalized text into a Set of word-shingles of the given size (a
// shingle is a contiguous run of `size` words joined by a space). Word-shingle
// resemblance detection: Broder, "On the resemblance and containment of
// documents" (1997) / "Identifying and Filtering Near-Duplicate Documents"
// (2000) — UNVERIFIED exact DOI, but this is the standard, widely-cited
// technique name; same citation Heights' seo-audit.js uses for the identical
// algorithm.
function shingleText(normalizedText, size = 5) {
  const words = String(normalizedText || '').split(' ').filter(Boolean);
  const shingles = new Set();
  if (!words.length) return shingles;
  if (words.length <= size) {
    shingles.add(words.join(' '));
    return shingles;
  }
  for (let i = 0; i <= words.length - size; i += 1) {
    shingles.add(words.slice(i, i + size).join(' '));
  }
  return shingles;
}

// Jaccard similarity coefficient (Jaccard, 1912): |A ∩ B| / |A ∪ B|, the
// standard set-overlap resemblance measure.
function jaccardSimilarity(setA, setB) {
  if (!setA.size && !setB.size) return 0;
  let intersectionSize = 0;
  for (const item of setA) {
    if (setB.has(item)) intersectionSize += 1;
  }
  const unionSize = setA.size + setB.size - intersectionSize;
  return unionSize === 0 ? 0 : intersectionSize / unionSize;
}

// ---------------------------------------------------------------------------
// Taxonomy term validation / CRUD
// ---------------------------------------------------------------------------

function validateTaxonomyTermInput(data) {
  const name = String(data.name || '').trim();
  const termType = String(data.termType || '').trim();
  if (!name) throwErr('Taxonomy term name is required.');
  if (!TAXONOMY_TERM_TYPES.includes(termType)) throwErr(`Term type must be one of: ${TAXONOMY_TERM_TYPES.join(', ')}.`);
  const slugSource = data.slug ? String(data.slug) : name;
  const slug = slugify(slugSource);
  if (!slug) throwErr('Taxonomy term slug could not be derived from the name; provide a slug directly.');
  return { name, termType, slug };
}

function validateTermAssignmentInput(data) {
  const seoResourceId = data.seoResourceId;
  const termId = data.termId;
  if (!seoResourceId) throwErr('An SEO resource is required.');
  if (!termId) throwErr('A taxonomy term is required.');
  return { seoResourceId: Number(seoResourceId), termId: Number(termId) };
}

function listTaxonomyTerms(db) {
  return db.prepare('SELECT * FROM seo_taxonomy_terms WHERE isActive = 1 ORDER BY termType, name').all();
}

function getTaxonomyTerm(db, id) {
  return db.prepare('SELECT * FROM seo_taxonomy_terms WHERE id = ?').get(id);
}

function createTaxonomyTerm(db, input, actor = {}) {
  const { name, termType, slug } = validateTaxonomyTermInput(input);
  const existingSlug = db.prepare('SELECT id FROM seo_taxonomy_terms WHERE slug = ?').get(slug);
  if (existingSlug) throwErr(`A taxonomy term already uses the slug "${slug}".`, 409);
  // Pillar/cluster relationship: parentTermId must reference a real, active
  // term and must not create a cycle.
  let parentTermId = input.parentTermId ? Number(input.parentTermId) : null;
  if (parentTermId) {
    const parent = db.prepare('SELECT id FROM seo_taxonomy_terms WHERE id = ? AND isActive = 1').get(parentTermId);
    if (!parent) throwErr('Parent taxonomy term was not found.');
  }
  const now = new Date().toISOString();
  const info = db.prepare(`
    INSERT INTO seo_taxonomy_terms (name, slug, termType, description, parentTermId, indexEligible, isActive, createdAt, updatedAt, updatedBy)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
  `).run(
    name, slug, termType,
    input.description?.toString().trim() || null,
    parentTermId,
    input.indexEligible === false ? 0 : 1,
    now, now, actorLabel(actor)
  );
  return getTaxonomyTerm(db, info.lastInsertRowid);
}

function saveTaxonomyTerm(db, id, input, actor = {}) {
  const current = getTaxonomyTerm(db, id);
  if (!current) throwErr('Taxonomy term was not found.', 404);
  const { name, termType, slug } = validateTaxonomyTermInput({ ...current, ...input });
  const existingSlug = db.prepare('SELECT id FROM seo_taxonomy_terms WHERE slug = ? AND id != ?').get(slug, id);
  if (existingSlug) throwErr(`A taxonomy term already uses the slug "${slug}".`, 409);
  let parentTermId = 'parentTermId' in input ? (input.parentTermId ? Number(input.parentTermId) : null) : current.parentTermId;
  if (parentTermId) {
    if (parentTermId === Number(id)) throwErr('A taxonomy term cannot be its own parent.');
    const visited = new Set([Number(id)]);
    let cursor = parentTermId;
    let hops = 0;
    while (cursor && hops < 50) {
      if (visited.has(cursor)) throwErr('Setting this parent would create a pillar/cluster cycle.');
      visited.add(cursor);
      const ancestor = db.prepare('SELECT parentTermId FROM seo_taxonomy_terms WHERE id = ?').get(cursor);
      if (!ancestor) throwErr('Parent taxonomy term was not found.');
      cursor = ancestor.parentTermId || null;
      hops += 1;
    }
  }
  const data = {
    name, termType, slug, parentTermId,
    description: input.description?.toString().trim() || null,
    indexEligible: input.indexEligible === undefined ? current.indexEligible : (input.indexEligible ? 1 : 0),
    isActive: input.isActive === undefined ? current.isActive : (input.isActive ? 1 : 0),
    updatedAt: new Date().toISOString(),
    updatedBy: actorLabel(actor),
  };
  const allowed = pickAllowedColumns(data, SEO_TAXONOMY_TERM_COLUMNS);
  const fields = Object.keys(allowed);
  if (fields.length) {
    db.prepare(`UPDATE seo_taxonomy_terms SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`).run(...fields.map((f) => allowed[f]), id);
  }
  return getTaxonomyTerm(db, id);
}

// Soft-delete (isActive = 0). A pillar term with active child cluster terms
// cannot be retired out from under them silently — an admin must re-parent or
// retire the children first.
function deleteTaxonomyTerm(db, id, actor = {}) {
  const current = getTaxonomyTerm(db, id);
  if (!current) throwErr('Taxonomy term was not found.', 404);
  const children = db.prepare('SELECT COUNT(*) AS count FROM seo_taxonomy_terms WHERE parentTermId = ? AND isActive = 1').get(id).count;
  if (children > 0) throwErr(`This term is the pillar for ${children} active cluster term(s). Re-parent or remove them first.`);
  db.prepare('UPDATE seo_taxonomy_terms SET isActive = 0, updatedAt = ?, updatedBy = ? WHERE id = ?').run(new Date().toISOString(), actorLabel(actor), id);
  return true;
}

function listTermsForResource(db, seoResourceId) {
  return db.prepare(`
    SELECT a.id AS assignmentId, a.createdAt AS assignedAt,
           t.id, t.name, t.slug, t.termType, t.description, t.parentTermId, t.indexEligible
    FROM seo_resource_terms a
    JOIN seo_taxonomy_terms t ON t.id = a.termId
    WHERE a.seoResourceId = ? AND t.isActive = 1
    ORDER BY t.termType, t.name
  `).all(seoResourceId);
}

function listResourcesForTerm(db, termId) {
  return db.prepare(`
    SELECT r.id, r.path, r.resourceType, r.resourceId, r.indexState, r.httpStatus, r.isActive
    FROM seo_resource_terms a
    JOIN seo_resources r ON r.id = a.seoResourceId
    WHERE a.termId = ?
    ORDER BY r.path
  `).all(termId);
}

function assignTermToResource(db, input, actor = {}) {
  const { seoResourceId, termId } = validateTermAssignmentInput(input);
  const resource = db.prepare('SELECT id FROM seo_resources WHERE id = ?').get(seoResourceId);
  if (!resource) throwErr('SEO resource was not found.', 404);
  const term = db.prepare('SELECT id FROM seo_taxonomy_terms WHERE id = ? AND isActive = 1').get(termId);
  if (!term) throwErr('Taxonomy term was not found.', 404);
  const existing = db.prepare('SELECT id FROM seo_resource_terms WHERE seoResourceId = ? AND termId = ?').get(seoResourceId, termId);
  if (existing) throwErr('This term is already assigned to this resource.', 409);
  const now = new Date().toISOString();
  const info = db.prepare('INSERT INTO seo_resource_terms (seoResourceId, termId, createdAt, createdBy) VALUES (?, ?, ?, ?)')
    .run(seoResourceId, termId, now, actorLabel(actor));
  return db.prepare('SELECT * FROM seo_resource_terms WHERE id = ?').get(info.lastInsertRowid);
}

// Hard delete — a pure join-row declaration, not a record with its own history
// worth soft-deleting.
function removeTermFromResource(db, id, actor = {}) {
  const current = db.prepare('SELECT * FROM seo_resource_terms WHERE id = ?').get(id);
  if (!current) throwErr('Term assignment was not found.', 404);
  db.prepare('DELETE FROM seo_resource_terms WHERE id = ?').run(id);
  return true;
}

// Real pillar/cluster tree: every active term with no parent at the top, each
// with its direct active children nested below.
function buildTaxonomyTree(db) {
  const terms = listTaxonomyTerms(db);
  const byId = new Map(terms.map((term) => [term.id, { ...term, children: [] }]));
  const roots = [];
  for (const term of byId.values()) {
    if (term.parentTermId && byId.has(term.parentTermId) && term.parentTermId !== term.id) {
      byId.get(term.parentTermId).children.push(term);
    } else {
      roots.push(term);
    }
  }
  return roots;
}

// ---------------------------------------------------------------------------
// Duplicate-taxonomy detection
// ---------------------------------------------------------------------------

// Term names are short (typically 1-4 words), so unigram shingles (individual
// word sets) are the correct granularity — a 5-word shingle would degenerate to
// "the whole name is one shingle" for almost every real term. This catches a
// pair like "VIP Table Service" / "Table Service VIP" (same words, different
// order — a shingle-set comparison over unigrams catches this).
const TAXONOMY_TERM_SHINGLE_SIZE = 1;

// UNVERIFIED as a universal cutoff — no primary source states one correct
// near-duplicate-taxonomy-term threshold. 0.6 is reused deliberately from
// Heights' own already-disclosed heuristic for the structurally identical
// problem (word-set overlap between two short strings), not re-derived.
const TAXONOMY_DUPLICATE_THRESHOLD = 0.6;

// Compares every pair of active taxonomy terms (optionally scoped to one
// termType) and reports near-duplicate pairs with real, inspectable evidence:
// the computed Jaccard similarity over word sets and the actual shared words.
// O(n^2) pairwise comparison — justified by this venue's real taxonomy being
// small (a bar/restaurant/event venue has a handful of genuine categories —
// events, menu, private events, gallery — not hundreds).
function findDuplicateTaxonomyTerms(db, options = {}) {
  const { termType = null } = options;
  const terms = listTaxonomyTerms(db).filter((term) => !termType || term.termType === termType);
  const withShingles = terms.map((term) => ({
    ...term,
    shingles: shingleText(normalizeVisibleText(term.name), TAXONOMY_TERM_SHINGLE_SIZE),
  }));
  const pairs = [];
  for (let i = 0; i < withShingles.length; i += 1) {
    for (let j = i + 1; j < withShingles.length; j += 1) {
      const termA = withShingles[i];
      const termB = withShingles[j];
      if (!termType && termA.termType !== termB.termType) continue;
      const similarity = jaccardSimilarity(termA.shingles, termB.shingles);
      if (similarity >= TAXONOMY_DUPLICATE_THRESHOLD) {
        const sharedWords = [...termA.shingles].filter((word) => termB.shingles.has(word));
        pairs.push({
          termAId: termA.id,
          termAName: termA.name,
          termBId: termB.id,
          termBName: termB.name,
          termType: termA.termType,
          similarity: Math.round(similarity * 1000) / 1000,
          sharedWords,
        });
      }
    }
  }
  return pairs.sort((a, b) => b.similarity - a.similarity);
}

// Migration helper: given a resource's existing free-text taxonomyJson terms
// (seo_resources.taxonomyJson, already a column in backend/lib/seo-schema.js)
// and the real managed term registry, proposes exact case-insensitive name
// matches an admin can confirm with one click — never a silent bulk rewrite.
function suggestTaxonomyTermsFromFreeText(db, taxonomyJson) {
  if (!Array.isArray(taxonomyJson) || !taxonomyJson.length) return [];
  const activeTerms = listTaxonomyTerms(db);
  const byLowerName = new Map(activeTerms.map((term) => [term.name.toLowerCase(), term]));
  return taxonomyJson.map((freeTextTerm) => {
    const match = byLowerName.get(String(freeTextTerm).toLowerCase().trim());
    return {
      freeTextTerm,
      matchedTermId: match ? match.id : null,
      matchedTermName: match ? match.name : null,
    };
  });
}

// ---------------------------------------------------------------------------
// Index rules
// ---------------------------------------------------------------------------
// Scope note (deliberate): "index rules" here means whether a taxonomy TERM's
// own future archive/listing page should be indexed — the term-level
// indexEligible flag. This does NOT build pagination, faceted URL-parameter
// combinations, or a search results page policy. BLVD has no /category/* or
// /tag/* route today (confirmed by reading src/pages/ directory listing) — this
// flag is exposed now, honestly, as the real index-intent record for the day a
// real archive route is built, not a speculative robots-tag renderer with
// nothing to render onto.
function evaluateTermIndexEligibility(term, memberCount) {
  if (!term.indexEligible) {
    return { termId: term.id, indexEligible: false, reason: 'Marked not index-eligible by an admin.' };
  }
  // UNVERIFIED non-authoritative heuristic, same disclosure as
  // TAXONOMY_DUPLICATE_THRESHOLD above — no single citable primary source pins
  // an exact minimum member count for a worthwhile archive page.
  const MIN_MEMBERS_FOR_INDEXABLE_ARCHIVE = 2;
  if (memberCount < MIN_MEMBERS_FOR_INDEXABLE_ARCHIVE) {
    return {
      termId: term.id,
      indexEligible: false,
      reason: `Only ${memberCount} resource(s) carry this term — too little real content for a worthwhile archive page (UNVERIFIED non-authoritative heuristic: fewer than ${MIN_MEMBERS_FOR_INDEXABLE_ARCHIVE}).`,
    };
  }
  return { termId: term.id, indexEligible: true, reason: `${memberCount} resources carry this term; marked index-eligible by an admin.` };
}

module.exports = {
  TAXONOMY_TERM_TYPES,
  normalizeVisibleText, shingleText, jaccardSimilarity,
  validateTaxonomyTermInput, validateTermAssignmentInput,
  listTaxonomyTerms, getTaxonomyTerm, createTaxonomyTerm, saveTaxonomyTerm, deleteTaxonomyTerm,
  listTermsForResource, listResourcesForTerm, assignTermToResource, removeTermFromResource,
  buildTaxonomyTree, findDuplicateTaxonomyTerms, suggestTaxonomyTermsFromFreeText,
  evaluateTermIndexEligibility,
};
