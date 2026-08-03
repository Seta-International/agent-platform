import type { SessionScope } from '@seta/core';
import type { DirectoryConflictKind, OrgUnitLinkKind } from '../../db/schema/index.ts';
import { INTEGRATIONS_PERMISSIONS, IntegrationsError, requirePermission } from '../../rbac.ts';
import { findDefaultParent, type PeopleOrgSurface } from './org-tree.ts';
import type { ConflictRow, DirectoryRepo } from './repo.ts';

/**
 * The `@seta/people` calls a resolution can make, on top of the tree surface the sync already
 * uses. Injected for the same reason (`integrations` may never touch the `people` schema) and
 * adapted from the real module in `directory/people-surface.ts`.
 */
export interface PeopleResolutionSurface extends PeopleOrgSurface {
  /** Moves a person between org units. `org_unit_id` is deliberately NOT an M365-owned field. */
  editWorker(input: {
    worker_id: string;
    patch: { org_unit_id?: string | null };
    session: SessionScope;
  }): Promise<{ version: number }>;
  terminateWorker(input: {
    worker_id: string;
    session: SessionScope;
  }): Promise<{ status: 'terminated' }>;
}

export const DIRECTORY_RESOLUTION_ACTIONS = [
  'choose_head',
  'reassign',
  'keep',
  'map_to_spine',
  'create_distinct',
  'offboard',
  'link',
  'ignore',
] as const;
export type DirectoryResolutionAction = (typeof DIRECTORY_RESOLUTION_ACTIONS)[number];

/**
 * Design §9.1's "resolutions offered" column, as data. An action absent from its conflict's kind
 * is a validation failure, never a silent no-op — the caller asked for something this row cannot
 * mean.
 *
 * `email_collision` offers `link` and `ignore`. §9.1 used to list `create_new` as well; it is not
 * offered, because it is incoherent against the schema rather than merely unimplemented —
 * `person_uniq_email_per_tenant` is a unique index over every non-deleted row, so no second live
 * person can hold the colliding address. `ignore` stays the escape hatch for a genuine
 * two-humans-one-address case, which is a data problem in Entra.
 */
export const ACTIONS_BY_KIND: Record<
  DirectoryConflictKind,
  ReadonlySet<DirectoryResolutionAction>
> = {
  manager_ambiguous: new Set(['choose_head', 'ignore']),
  email_collision: new Set(['link', 'ignore']),
  unit_delete_blocked: new Set(['reassign', 'keep', 'ignore']),
  spine_collision: new Set(['map_to_spine', 'create_distinct', 'ignore']),
  user_removed: new Set(['offboard', 'ignore']),
};

export interface ResolveDirectoryConflictInput {
  conflictId: string;
  action: string;
  /** Action-specific arguments, validated per action below. */
  params?: Record<string, unknown>;
  /**
   * The ACTING ADMIN's session (design §9.2). Never `buildSystemSession`: RBAC has to apply
   * normally and `person_history` has to attribute the change to a real human, so an admin who
   * lacks the underlying `people` permission must fail as an ordinary FORBIDDEN rather than be
   * silently escalated to the sync's system role.
   */
  session: SessionScope;
}

export interface ResolveDirectoryConflictDeps {
  repo: DirectoryRepo;
  people: PeopleResolutionSurface;
}

/**
 * `resolved: false` is a refusal the caller can act on — the row is still open and still needs a
 * human. Everything that is the caller's mistake (unknown id, illegal action, bad params) throws
 * an `IntegrationsError` instead.
 */
export interface ResolveDirectoryConflictResult {
  resolved: boolean;
  reason?: string;
}

function detailOf(conflict: ConflictRow): Record<string, unknown> {
  return typeof conflict.detail === 'object' && conflict.detail !== null
    ? (conflict.detail as Record<string, unknown>)
    : {};
}

function requiredString(
  params: Record<string, unknown> | undefined,
  key: string,
  action: string,
): string {
  const value = params?.[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new IntegrationsError('INVALID_INPUT', `${action} requires ${key}`);
  }
  return value;
}

function subjectIdOf(conflict: ConflictRow, action: string): string {
  if (!conflict.subjectId) {
    throw new IntegrationsError(
      'INVALID_INPUT',
      `${action} needs a ${conflict.subjectType} subject, and this conflict has none`,
    );
  }
  return conflict.subjectId;
}

/** Either what to record in `resolution`, or why the row has to stay open. */
type Applied = { resolution: Record<string, unknown> } | { refusal: string };

/**
 * `manager_ambiguous` → pick the unit's head. The person must be one of the candidates the run
 * queued: `org_unit.head_worker_id` carries a real FK to `people.person`, and — more to the point
 * — `resolveHeads` only honours this pin while the chosen person is still a resolvable candidate,
 * so anyone else would be silently reverted by the very next run.
 */
async function applyChooseHead(
  conflict: ConflictRow,
  params: Record<string, unknown> | undefined,
  session: SessionScope,
  people: PeopleResolutionSurface,
): Promise<Applied> {
  const orgUnitId = subjectIdOf(conflict, 'choose_head');
  const personId = requiredString(params, 'person_id', 'choose_head');
  const candidates = detailOf(conflict).candidates;
  const known = Array.isArray(candidates)
    ? candidates.some(
        (c) =>
          typeof c === 'object' &&
          c !== null &&
          (c as { person_id?: unknown }).person_id === personId,
      )
    : false;
  if (!known) {
    throw new IntegrationsError(
      'INVALID_INPUT',
      `person ${personId} is not a candidate head for this unit`,
    );
  }

  await people.updateOrgUnit({
    org_unit_id: orgUnitId,
    patch: { head_worker_id: personId },
    session,
  });
  // Read back by `repo.listHeadChoices`; keep the key names in step with it.
  return { resolution: { action: 'choose_head', person_id: personId } };
}

/**
 * `unit_delete_blocked` → move every member to a target unit, then retry the delete the sync was
 * refused. A delete that is still refused (a child unit, say) leaves the row open with the reason:
 * the members have moved, but a human still has to deal with what is left.
 */
async function applyReassign(
  conflict: ConflictRow,
  params: Record<string, unknown> | undefined,
  session: SessionScope,
  deps: ResolveDirectoryConflictDeps,
): Promise<Applied> {
  const orgUnitId = subjectIdOf(conflict, 'reassign');
  const targetId = requiredString(params, 'target_org_unit_id', 'reassign');
  if (targetId === orgUnitId) {
    throw new IntegrationsError('INVALID_INPUT', 'reassign target must be a different unit');
  }

  const { units } = await deps.people.getOrgStructure(session);
  const source = units.find((u) => u.id === orgUnitId);
  if (!source) throw new IntegrationsError('NOT_FOUND', `org unit ${orgUnitId} not found`);
  if (!units.some((u) => u.id === targetId)) {
    throw new IntegrationsError('INVALID_INPUT', `org unit ${targetId} not found`);
  }

  for (const personId of source.member_ids) {
    await deps.people.editWorker({
      worker_id: personId,
      patch: { org_unit_id: targetId },
      session,
    });
  }

  const outcome = await deps.people.deleteOrgUnit({ org_unit_id: orgUnitId, session });
  if (!outcome.deleted) return { refusal: outcome.reason ?? 'delete_refused' };

  // The link has to go with the unit: one left pointing at a deleted unit makes the next run
  // treat it as stale, drop it and create the department all over again.
  await deps.repo.deleteOrgUnitLink(conflict.tenantId, orgUnitId);
  return {
    resolution: {
      action: 'reassign',
      target_org_unit_id: targetId,
      moved_count: source.member_ids.length,
    },
  };
}

/**
 * `unit_delete_blocked` → keep the unit. Sync ownership IS the `m365_org_unit_links` row (§4.2),
 * so releasing it is what makes the decision survive: every later full census would otherwise
 * retry the delete and re-raise this same conflict. The unit itself is untouched and simply
 * becomes curated.
 */
async function applyKeep(conflict: ConflictRow, repo: DirectoryRepo): Promise<Applied> {
  const orgUnitId = subjectIdOf(conflict, 'keep');
  await repo.deleteOrgUnitLink(conflict.tenantId, orgUnitId);
  return { resolution: { action: 'keep', released_org_unit_id: orgUnitId } };
}

function entraKeyOf(conflict: ConflictRow, action: string): { key: string; kind: OrgUnitLinkKind } {
  const detail = detailOf(conflict);
  const key = detail.entra_key;
  const kind = detail.entra_kind;
  if (typeof key !== 'string' || (kind !== 'division' && kind !== 'department')) {
    throw new IntegrationsError('INVALID_INPUT', `${action} needs the conflict's Entra org node`);
  }
  return { key, kind };
}

/**
 * `spine_collision` → treat the Entra department as the spine unit it collides with. Only a link
 * row is written: the spine is never renamed, re-parented or deleted (§4.1), and `resolveOrgUnits`
 * honours the link by placing those people in the spine unit and no longer raising the conflict.
 */
async function applyMapToSpine(conflict: ConflictRow, repo: DirectoryRepo): Promise<Applied> {
  const { key, kind } = entraKeyOf(conflict, 'map_to_spine');
  const spineId = conflict.subjectId;
  if (!spineId) {
    throw new IntegrationsError(
      'INVALID_INPUT',
      'map_to_spine needs a spine unit, and this tenant has none for that name',
    );
  }
  await repo.upsertOrgUnitLink({
    tenantId: conflict.tenantId,
    orgUnitId: spineId,
    entraKey: key,
    kind,
  });
  return { resolution: { action: 'map_to_spine', org_unit_id: spineId } };
}

/**
 * `spine_collision` → give the Entra department its own unit, separate from the spine one it
 * happens to share a name with. It keeps the Entra name deliberately: the sync owns a linked
 * unit's name, so any other name would be renamed back on the next run.
 */
async function applyCreateDistinct(
  conflict: ConflictRow,
  session: SessionScope,
  deps: ResolveDirectoryConflictDeps,
): Promise<Applied> {
  const { key, kind } = entraKeyOf(conflict, 'create_distinct');
  const detail = detailOf(conflict);
  const name = typeof detail.entra_name === 'string' ? detail.entra_name.trim() : '';
  if (name === '') {
    throw new IntegrationsError('INVALID_INPUT', 'create_distinct needs the Entra name');
  }

  const { units } = await deps.people.getOrgStructure(session);
  const parent = findDefaultParent(units);
  if (!parent) {
    throw new IntegrationsError(
      'INVALID_INPUT',
      'this tenant has no Operation or Executive unit to hang a department from',
    );
  }

  const created = await deps.people.createOrgUnit({
    name,
    kind: 'function',
    parent_id: parent.id,
    session,
  });
  await deps.repo.upsertOrgUnitLink({
    tenantId: conflict.tenantId,
    orgUnitId: created.id,
    entraKey: key,
    kind,
  });
  return { resolution: { action: 'create_distinct', org_unit_id: created.id } };
}

/**
 * `email_collision` → this Entra user IS that person. Only the `m365_person_links` binding is
 * written: `people` owns `person.directory_managed`, and `syncDirectoryPeople` asserts it from
 * this very row on the next run (its `linked_person_id` door). Writing it from here would be
 * reaching across the module boundary into a column this module does not own.
 */
async function applyLink(
  conflict: ConflictRow,
  params: Record<string, unknown> | undefined,
  repo: DirectoryRepo,
): Promise<Applied> {
  const personId = requiredString(params, 'person_id', 'link');
  const entraOid = conflict.entraOid;
  if (!entraOid) {
    throw new IntegrationsError('INVALID_INPUT', "link needs the conflict's Entra user");
  }
  const candidates = detailOf(conflict).candidates;
  const known = Array.isArray(candidates)
    ? candidates.some(
        (c) =>
          typeof c === 'object' &&
          c !== null &&
          (c as { person_id?: unknown }).person_id === personId,
      )
    : false;
  if (!known) {
    throw new IntegrationsError(
      'INVALID_INPUT',
      `person ${personId} is not a candidate for this collision`,
    );
  }

  const links = await repo.listPersonLinks(conflict.tenantId);
  // One oid per person (`m365_person_links_uniq_person`). Refuse cleanly rather than let the
  // driver raise a unique violation the admin screen cannot explain.
  const bound = links.find((l) => l.personId === personId && l.entraOid !== entraOid);
  if (bound) {
    throw new IntegrationsError(
      'INVALID_INPUT',
      `person ${personId} is already linked to Entra user ${bound.entraOid}`,
    );
  }

  // Carry the census facts forward. The upsert nulls every column it is not given, and those
  // three are what keeps `resolveOrgUnits`/`resolveHeads` seeing this member between full runs.
  const existing = links.find((l) => l.entraOid === entraOid) ?? null;
  await repo.upsertPersonLink({
    tenantId: conflict.tenantId,
    personId,
    entraOid,
    managerOid: existing?.managerOid ?? null,
    department: existing?.department ?? null,
    division: existing?.division ?? null,
    // Keyed on the oid, not the person (see `photoKeyFor`), so it survives the rebinding.
    photoMediaEtag: existing?.photoMediaEtag ?? null,
  });
  return { resolution: { action: 'link', person_id: personId } };
}

/** `user_removed` → close the employment period. The sync never does this on its own (§8.3). */
async function applyOffboard(
  conflict: ConflictRow,
  session: SessionScope,
  people: PeopleResolutionSurface,
): Promise<Applied> {
  const personId = subjectIdOf(conflict, 'offboard');
  await people.terminateWorker({ worker_id: personId, session });
  return { resolution: { action: 'offboard', person_id: personId } };
}

/**
 * Applies one admin decision to one `m365_directory_conflict` row (design §9.1/§9.2).
 *
 * Every write into `people` goes through the public functions the sync itself uses, under the
 * caller's session — RBAC is re-checked at the callee and the change is attributed to a real
 * person. The row is closed only once the decision has actually been applied, so a refused delete
 * or a failed `people` call leaves the conflict queued rather than losing it.
 */
export async function resolveDirectoryConflict(
  input: ResolveDirectoryConflictInput,
  deps: ResolveDirectoryConflictDeps,
): Promise<ResolveDirectoryConflictResult> {
  const { session, conflictId, params } = input;
  requirePermission(session, INTEGRATIONS_PERMISSIONS.m365Configure);

  // Tenant comes from the session, never from the caller: that is what makes another tenant's
  // conflict invisible rather than merely unresolvable.
  const conflict = await deps.repo.getConflict(session.tenant_id, conflictId);
  if (!conflict) throw new IntegrationsError('NOT_FOUND', `conflict ${conflictId} not found`);

  const offered = ACTIONS_BY_KIND[conflict.kind];
  if (!offered.has(input.action as DirectoryResolutionAction)) {
    throw new IntegrationsError(
      'INVALID_INPUT',
      `${conflict.kind} does not offer '${input.action}'`,
    );
  }
  const action = input.action as DirectoryResolutionAction;

  // Closing an already-closed row would overwrite the first admin's decision and re-apply the
  // side effect. Reported, not thrown: two admins racing the same queue is ordinary.
  if (conflict.status !== 'open') {
    return { resolved: false, reason: 'already_resolved' };
  }

  let applied: Applied;
  switch (action) {
    case 'ignore':
      applied = { resolution: { action: 'ignore' } };
      break;
    case 'choose_head':
      applied = await applyChooseHead(conflict, params, session, deps.people);
      break;
    case 'reassign':
      applied = await applyReassign(conflict, params, session, deps);
      break;
    case 'keep':
      applied = await applyKeep(conflict, deps.repo);
      break;
    case 'map_to_spine':
      applied = await applyMapToSpine(conflict, deps.repo);
      break;
    case 'create_distinct':
      applied = await applyCreateDistinct(conflict, session, deps);
      break;
    case 'offboard':
      applied = await applyOffboard(conflict, session, deps.people);
      break;
    case 'link':
      applied = await applyLink(conflict, params, deps.repo);
      break;
  }

  if ('refusal' in applied) return { resolved: false, reason: applied.refusal };

  await deps.repo.closeConflict({
    tenantId: conflict.tenantId,
    id: conflict.id,
    // `ignored` is its own status so the screen can filter "decided" from "dismissed" (§9.3).
    status: action === 'ignore' ? 'ignored' : 'resolved',
    resolution: applied.resolution,
    resolvedBy: session.user_id,
  });
  return { resolved: true };
}
