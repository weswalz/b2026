// Editorial completeness workflow — configurable checklists, fact-check status,
// legal/compliance approval, and append-only sign-off evidence for seo_resources.
// Ported from HEIGHTSASTRO/src/lib/db/seo-editorial.js (read in full 2026-07-23)
// to BLVD's Express/SQLite backend. Adapted to this backend's real conventions
// (confirmed by reading backend/lib/seo-resources.js and backend/lib/redirects.js
// in full before writing this):
//   - every function takes `db` as its first parameter (no module-level
//     connectToDatabase() singleton — BLVD's server.js owns the one db instance
//     and passes it in, unlike Heights' src/lib/db/connection.js pattern)
//   - INTEGER AUTOINCREMENT ids (seo_checklist_definitions.id, seo_checklist_status.id,
//     seo_signoffs.id — all already defined this way in backend/lib/seo-schema.js,
//     the coordinator's already-built schema; this file uses lastInsertRowid, never
//     crypto.randomUUID())
//   - errors thrown as `Object.assign(new Error(message), { status })`, the exact
//     shape backend/lib/redirects.js's validateRedirectPayload() and
//     backend/lib/seo-resources.js's throwErr() already establish (not Heights'
//     `{ code }` shape)
//   - CommonJS (require/module.exports), matching every other backend/lib/*.js
//
// Same architectural separation Heights documents: seo_revisions (seo-resources.js)
// snapshots the WHOLE resource on every field save; seo_signoffs here is a
// SEPARATE append-only event log for a discrete approval event with its own
// actor/timestamp/type. The two denormalized "current status" columns on
// seo_resources (factCheckStatus, legalApprovalStatus — both already columns in
// seo-schema.js's seo_resources table) are read-derived caches written ONLY by
// recordSeoSignoff() below, in the same transaction as the signoff insert — never
// through saveSeoResource()'s generic column allowlist — so an approval state can
// never move without a corresponding auditable signoff row.

function throwErr(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

const FACT_CHECK_STATUSES = ['unverified', 'verified', 'disputed'];
const LEGAL_APPROVAL_STATUSES = ['not_required', 'pending', 'approved', 'rejected'];
const SIGNOFF_TYPES = ['fact_check', 'legal_compliance'];
const RESOURCE_TYPES_FOR_CHECKLIST = ['page', 'event', 'route', 'asset'];

function nowIso() {
  return new Date().toISOString();
}

function actorLabel(actor = {}) {
  return actor.username || actor.email || actor.id || 'admin';
}

const CHECKLIST_DEFINITION_COLUMNS = new Set(['itemKey', 'label', 'description', 'appliesToResourceType', 'isRequired', 'isActive', 'displayOrder']);

function pickAllowedColumns(data, allowedColumns) {
  const picked = {};
  for (const key of Object.keys(data || {})) {
    if (allowedColumns.has(key)) picked[key] = data[key];
  }
  return picked;
}

// ---------------------------------------------------------------------------
// Checklist definitions (configurable — not a hardcoded list)
// ---------------------------------------------------------------------------

function listChecklistDefinitions(db, { resourceType = null, includeInactive = false } = {}) {
  const clauses = [];
  const params = [];
  if (!includeInactive) clauses.push('isActive = 1');
  if (resourceType) {
    clauses.push('(appliesToResourceType IS NULL OR appliesToResourceType = ?)');
    params.push(resourceType);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return db.prepare(`SELECT * FROM seo_checklist_definitions ${where} ORDER BY displayOrder ASC, createdAt ASC`).all(...params);
}

function getChecklistDefinition(db, id) {
  return db.prepare('SELECT * FROM seo_checklist_definitions WHERE id = ?').get(id);
}

function validateChecklistDefinitionInput(data) {
  const itemKey = String(data.itemKey || '').trim();
  if (!itemKey || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(itemKey)) {
    throwErr('Checklist item key must be lowercase letters, numbers, and hyphens (2-64 chars).');
  }
  const label = String(data.label || '').trim();
  if (!label) throwErr('Checklist item label is required.');
  if (data.appliesToResourceType && !RESOURCE_TYPES_FOR_CHECKLIST.includes(data.appliesToResourceType)) {
    throwErr('appliesToResourceType must be page, event, route, asset, or blank for all types.');
  }
  return { itemKey, label };
}

function createChecklistDefinition(db, input, actor = {}) {
  const { itemKey, label } = validateChecklistDefinitionInput(input);
  const existing = db.prepare('SELECT id FROM seo_checklist_definitions WHERE itemKey = ?').get(itemKey);
  if (existing) throwErr(`A checklist item with key "${itemKey}" already exists.`, 409);
  const now = nowIso();
  const maxOrder = db.prepare('SELECT COALESCE(MAX(displayOrder), -1) AS maxOrder FROM seo_checklist_definitions').get().maxOrder;
  const info = db.prepare(`
    INSERT INTO seo_checklist_definitions (
      itemKey, label, description, appliesToResourceType, isRequired, isActive, displayOrder, createdAt, updatedAt, createdBy
    ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
  `).run(
    itemKey, label, input.description?.toString().trim() || null, input.appliesToResourceType || null,
    input.isRequired === false ? 0 : 1, Number.isInteger(input.displayOrder) ? input.displayOrder : maxOrder + 1,
    now, now, actorLabel(actor)
  );
  return getChecklistDefinition(db, info.lastInsertRowid);
}

function updateChecklistDefinition(db, id, input, actor = {}) {
  const current = getChecklistDefinition(db, id);
  if (!current) throwErr('Checklist item was not found.', 404);
  const data = { ...input };
  if ('label' in data && !String(data.label || '').trim()) throwErr('Checklist item label is required.');
  if ('appliesToResourceType' in data && data.appliesToResourceType && !RESOURCE_TYPES_FOR_CHECKLIST.includes(data.appliesToResourceType)) {
    throwErr('appliesToResourceType must be page, event, route, asset, or blank for all types.');
  }
  delete data.itemKey; // key is immutable once created — status rows key off the row id, not the text key
  for (const field of ['isRequired', 'isActive']) {
    if (field in data) data[field] = data[field] ? 1 : 0;
  }
  const allowed = pickAllowedColumns(data, CHECKLIST_DEFINITION_COLUMNS);
  const fields = Object.keys(allowed);
  if (fields.length) {
    db.prepare(`UPDATE seo_checklist_definitions SET ${fields.map((f) => `${f} = ?`).join(', ')}, updatedAt = ? WHERE id = ?`)
      .run(...fields.map((f) => allowed[f]), nowIso(), id);
  }
  return getChecklistDefinition(db, id);
}

// Soft-retire, never a hard DELETE: seo_checklist_status rows reference this
// definition's id, and past completion evidence for a resource must stay
// readable/auditable even after an admin decides the checklist item no longer
// applies going forward.
function deactivateChecklistDefinition(db, id, actor = {}) {
  const result = db.prepare('UPDATE seo_checklist_definitions SET isActive = 0, updatedAt = ? WHERE id = ?').run(nowIso(), id);
  if (!result.changes) throwErr('Checklist item was not found.', 404);
  return getChecklistDefinition(db, id);
}

// ---------------------------------------------------------------------------
// Per-resource checklist completion state
// ---------------------------------------------------------------------------

// Real, unresolved completion state for one resource against every checklist
// definition that currently applies to it (global items + items scoped to this
// resourceType). Left-joins against any existing seo_checklist_status row so an
// item never touched for this resource shows completed:false rather than being
// silently omitted.
function getResourceChecklist(db, resourceType, resourceId) {
  const definitions = listChecklistDefinitions(db, { resourceType });
  if (!definitions.length) return [];
  const resource = db.prepare('SELECT id FROM seo_resources WHERE resourceType = ? AND resourceId = ?').get(resourceType, String(resourceId));
  const statusRows = resource
    ? db.prepare('SELECT * FROM seo_checklist_status WHERE seoResourceId = ?').all(resource.id)
    : [];
  const statusByDefinitionId = new Map(statusRows.map((row) => [row.definitionId, row]));
  return definitions.map((def) => {
    const status = statusByDefinitionId.get(def.id) || null;
    return {
      definitionId: def.id,
      itemKey: def.itemKey,
      label: def.label,
      description: def.description,
      isRequired: !!def.isRequired,
      completed: !!status?.completed,
      completedBy: status?.completedBy || null,
      completedAt: status?.completedAt || null,
      notes: status?.notes || null,
    };
  });
}

// Upserts one item's completion state for one resource. Setting completed=false
// is a real, logged action (an admin un-checking a previously-completed item),
// not a delete — the row (and its prior completedBy/completedAt) is overwritten
// with the new state.
function setChecklistItemStatus(db, resourceType, resourceId, definitionId, options, actor = {}) {
  const { completed, notes = null } = options || {};
  const resource = db.prepare('SELECT id FROM seo_resources WHERE resourceType = ? AND resourceId = ?').get(resourceType, String(resourceId));
  if (!resource) throwErr('SEO resource was not found.', 404);
  const definition = getChecklistDefinition(db, definitionId);
  if (!definition) throwErr('Checklist item was not found.', 404);
  const now = nowIso();
  const isCompleted = completed ? 1 : 0;
  const existing = db.prepare('SELECT id FROM seo_checklist_status WHERE seoResourceId = ? AND definitionId = ?').get(resource.id, definitionId);
  if (existing) {
    db.prepare(`
      UPDATE seo_checklist_status SET completed = ?, completedBy = ?, completedAt = ?, notes = ?, updatedAt = ?
      WHERE id = ?
    `).run(isCompleted, isCompleted ? actorLabel(actor) : null, isCompleted ? now : null, notes, now, existing.id);
  } else {
    db.prepare(`
      INSERT INTO seo_checklist_status (seoResourceId, definitionId, completed, completedBy, completedAt, notes, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(resource.id, definitionId, isCompleted, isCompleted ? actorLabel(actor) : null, isCompleted ? now : null, notes, now);
  }
  return getResourceChecklist(db, resourceType, resourceId);
}

// ---------------------------------------------------------------------------
// Fact-check status and legal/compliance approval — append-only sign-off log
// ---------------------------------------------------------------------------

function validateSignoffInput(signoffType, status) {
  if (!SIGNOFF_TYPES.includes(signoffType)) {
    throwErr(`signoffType must be one of: ${SIGNOFF_TYPES.join(', ')}`);
  }
  const validStatuses = signoffType === 'fact_check' ? FACT_CHECK_STATUSES : LEGAL_APPROVAL_STATUSES;
  if (!validStatuses.includes(status)) {
    throwErr(`For ${signoffType}, status must be one of: ${validStatuses.join(', ')}`);
  }
}

// The one write path for fact-check/legal state. Inserts an immutable seo_signoffs
// row and, in the same transaction, updates the matching denormalized "current
// status" column on seo_resources so reads don't need to scan the log. Because
// this is the ONLY function that ever writes factCheckStatus/legalApprovalStatus,
// an approval can never be recorded without a corresponding signoff row, and a
// signoff row can never exist without moving the visible current-status field.
function recordSeoSignoff(db, resourceType, resourceId, options, actor = {}) {
  const { signoffType, status, notes = null } = options || {};
  validateSignoffInput(signoffType, status);
  const resource = db.prepare('SELECT id FROM seo_resources WHERE resourceType = ? AND resourceId = ?').get(resourceType, String(resourceId));
  if (!resource) throwErr('SEO resource was not found.', 404);
  const now = nowIso();
  const who = actorLabel(actor);
  const statusColumn = signoffType === 'fact_check' ? 'factCheckStatus' : 'legalApprovalStatus';
  const transaction = db.transaction(() => {
    db.prepare(`
      INSERT INTO seo_signoffs (seoResourceId, signoffType, status, notes, actorId, actorUsername, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(resource.id, signoffType, status, notes, actor.id != null ? String(actor.id) : null, who, now);
    db.prepare(`UPDATE seo_resources SET ${statusColumn} = ? WHERE id = ?`).run(status, resource.id);
  });
  transaction();
  return listSeoSignoffs(db, resourceType, resourceId);
}

function listSeoSignoffs(db, resourceType, resourceId, { signoffType = null, limit = 100 } = {}) {
  const resource = db.prepare('SELECT id FROM seo_resources WHERE resourceType = ? AND resourceId = ?').get(resourceType, String(resourceId));
  if (!resource) return [];
  const clauses = ['seoResourceId = ?'];
  const params = [resource.id];
  if (signoffType) {
    if (!SIGNOFF_TYPES.includes(signoffType)) throwErr(`signoffType must be one of: ${SIGNOFF_TYPES.join(', ')}`);
    clauses.push('signoffType = ?');
    params.push(signoffType);
  }
  params.push(Math.max(1, Math.min(500, Number(limit) || 100)));
  // createdAt alone (millisecond ISO string) is not a stable "most recent first"
  // ordering — two signoffs in the same millisecond could sort either way.
  // rowid DESC is a free monotonic tiebreaker (fix originated at Cattlemen's port).
  return db.prepare(`SELECT * FROM seo_signoffs WHERE ${clauses.join(' AND ')} ORDER BY createdAt DESC, rowid DESC LIMIT ?`).all(...params);
}

// Toggle for "legal/compliance approval where applicable" — not every resource
// type needs a legal review, so this is a plain resource-level flag an editor
// sets, independent of the signoff log itself. Setting it does not fabricate an
// approval; it only changes whether the workflow asks for one.
const LEGAL_REQUIRED_COLUMN = new Set(['legalApprovalRequired']);
function setLegalApprovalRequired(db, resourceType, resourceId, required, actor = {}) {
  const resource = db.prepare('SELECT id FROM seo_resources WHERE resourceType = ? AND resourceId = ?').get(resourceType, String(resourceId));
  if (!resource) throwErr('SEO resource was not found.', 404);
  const allowed = pickAllowedColumns({ legalApprovalRequired: required ? 1 : 0 }, LEGAL_REQUIRED_COLUMN);
  db.prepare('UPDATE seo_resources SET legalApprovalRequired = ? WHERE id = ?').run(allowed.legalApprovalRequired, resource.id);
  return db.prepare('SELECT legalApprovalRequired FROM seo_resources WHERE id = ?').get(resource.id);
}

// ---------------------------------------------------------------------------
// Editorial completeness summary — the single read the resource editor and any
// future dashboard need: checklist completion, fact-check state, and legal
// approval state (only "required" when the resource is flagged for it), each
// backed by real rows, never fabricated.
// ---------------------------------------------------------------------------

function getEditorialCompletenessSummary(db, resourceType, resourceId) {
  const resource = db.prepare('SELECT * FROM seo_resources WHERE resourceType = ? AND resourceId = ?').get(resourceType, String(resourceId));
  if (!resource) return null;
  const checklist = getResourceChecklist(db, resourceType, resourceId);
  const requiredItems = checklist.filter((item) => item.isRequired);
  const checklistComplete = requiredItems.length > 0 && requiredItems.every((item) => item.completed);
  const factCheckStatus = resource.factCheckStatus || 'unverified';
  const legalApprovalRequired = !!resource.legalApprovalRequired;
  const legalApprovalStatus = resource.legalApprovalStatus || 'not_required';
  const legalSatisfied = !legalApprovalRequired || legalApprovalStatus === 'approved';
  return {
    checklist,
    checklistComplete,
    factCheckStatus,
    legalApprovalRequired,
    legalApprovalStatus,
    legalSatisfied,
    signoffs: listSeoSignoffs(db, resourceType, resourceId, { limit: 10 }),
    readyToPublish: checklistComplete && factCheckStatus === 'verified' && legalSatisfied,
  };
}

module.exports = {
  FACT_CHECK_STATUSES, LEGAL_APPROVAL_STATUSES, SIGNOFF_TYPES,
  listChecklistDefinitions, getChecklistDefinition, validateChecklistDefinitionInput,
  createChecklistDefinition, updateChecklistDefinition, deactivateChecklistDefinition,
  getResourceChecklist, setChecklistItemStatus,
  validateSignoffInput, recordSeoSignoff, listSeoSignoffs, setLegalApprovalRequired,
  getEditorialCompletenessSummary,
};
