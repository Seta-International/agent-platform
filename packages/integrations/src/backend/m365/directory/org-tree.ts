import type { SessionScope } from '@seta/core';
import type { OrgUnitLinkKind } from '../../db/schema/index.ts';
import type { DirectoryRepo, OrgUnitLinkRow } from './repo.ts';

/**
 * The `@seta/people` org-unit write surface, injected rather than imported.
 *
 * `integrations` may never read or write `people.*`, so every tree mutation goes through the
 * public `@seta/people` functions. Taking them as a parameter keeps this file free of a
 * hard dependency and lets tests drive it without a real RBAC session.
 *
 * NOTE for the wiring layer: the real module is *not* structurally assignable to this interface.
 * `createOrgUnit` returns `{ org_unit_id }`, and `getOrgStructure` returns a resolved
 * `head: { person_id, full_name } | null` rather than the raw `head_worker_id`. A thin adapter
 * (`u.head?.person_id ?? null`, `{ id: org_unit_id }`) closes both gaps.
 *
 * The session handed in must carry `people.worker.read` (getOrgStructure),
 * `people.worker.create` (createOrgUnit) and `people.org_unit.manage` (update/delete) —
 * `buildSystemSession`'s `system.integrations.m365` role holds all three.
 */
export interface PeopleOrgSurface {
  getOrgStructure(session: SessionScope): Promise<{
    units: Array<{
      id: string;
      parent_id: string | null;
      name: string;
      kind: string;
      head_worker_id: string | null;
    }>;
  }>;
  createOrgUnit(input: {
    name: string;
    kind: 'function';
    parent_id?: string | null;
    session: SessionScope;
  }): Promise<{ id: string }>;
  updateOrgUnit(input: {
    org_unit_id: string;
    patch: { name?: string; parent_id?: string | null; head_worker_id?: string | null };
    session: SessionScope;
  }): Promise<{ version: number }>;
  deleteOrgUnit(input: { org_unit_id: string; session: SessionScope }): Promise<{
    deleted: boolean;
    reason?: 'has_members' | 'has_children';
  }>;
}

export interface DirectoryOrgPair {
  division: string | null;
  department: string | null;
}

/**
 * The structural spine (design §4.1). These are `org_unit.kind` values, and the sync never
 * creates, renames, re-parents or deletes a unit carrying one: `getOrgCompany` grafts the
 * account/project subtree onto `delivery`, so re-pointing the spine at an Entra string would
 * leave whole org-chart views rootless.
 */
const SPINE_KINDS = new Set(['executive', 'operation', 'delivery', 'pmo']);

/**
 * Department and division are free text, so any printable separator could occur inside them.
 * `0x1f` (ASCII unit separator) cannot: Graph rejects control characters in these fields.
 */
const SEP = String.fromCharCode(0x1f);

function norm(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function display(value: string | null | undefined): string {
  return (value ?? '').trim();
}

/**
 * Identity of an Entra org node, and the key of the map `resolveOrgUnits` returns. Trimmed and
 * case-folded, so `Engineering` / ` engineering ` are one org node rather than two units that
 * fight over the same people.
 *
 * The two halves are also the `m365_org_unit_links.entra_key` values used on their own:
 * a division links under `orgKey(division, null)` and a department under `orgKey(null,
 * department)`. Those can never collide (one ends with the separator, the other starts with it),
 * and keying a department on its own name alone is what makes a department that moves between
 * divisions a *re-parent* of the same unit rather than a delete plus a create.
 */
export function orgKey(division: string | null, department: string | null): string {
  return `${norm(division)}${SEP}${norm(department)}`;
}

interface DesiredNode {
  key: string;
  name: string;
  kind: OrgUnitLinkKind;
  /** The division key this department hangs under, or null for the default parent. */
  parentKey: string | null;
}

interface MutableUnit {
  id: string;
  parent_id: string | null;
  name: string;
  kind: string;
  head_worker_id: string | null;
}

export interface ResolveOrgUnitsInput {
  tenantId: string;
  /**
   * CONTRACT: the *complete* current division/department census for the tenant, not a delta
   * slice. Anything absent from it is treated as dropped from Entra and reaped, so handing in a
   * partial page would delete every department the page happened not to mention.
   */
  pairs: ReadonlyArray<DirectoryOrgPair>;
  session: SessionScope;
  repo: DirectoryRepo;
  people: PeopleOrgSurface;
}

/**
 * Turns Entra's free-text `division`/`department` pairs into real `people.org_unit` rows and
 * returns `orgKey(division, department) -> org_unit_id` for the caller to stamp onto people.
 *
 * A unit is sync-owned **iff** it has an `m365_org_unit_links` row (design §4.2). Lookup is
 * therefore by link only, never by name: a curated unit that happens to be called `Engineering`
 * is never adopted, renamed, re-parented or deleted, and neither is the spine.
 */
export async function resolveOrgUnits(input: ResolveOrgUnitsInput): Promise<Map<string, string>> {
  const { tenantId, pairs, session, repo, people } = input;
  const result = new Map<string, string>();

  // An empty census is far more likely to be a failed or partial fetch than a company with no
  // departments at all, and the reap below would act on it destructively. Do nothing instead.
  if (pairs.length === 0) return result;

  const { units } = await people.getOrgStructure(session);
  const unitById = new Map<string, MutableUnit>(units.map((u) => [u.id, { ...u }]));

  // Default parent: `Operation`, else the `executive` root. An unseeded tenant has neither —
  // there is nowhere to hang a department, and that is not a conflict a human can resolve.
  const spineByKind = new Map<string, MutableUnit>();
  for (const u of unitById.values()) {
    if (SPINE_KINDS.has(u.kind) && !spineByKind.has(u.kind)) spineByKind.set(u.kind, u);
  }
  const defaultParent = spineByKind.get('operation') ?? spineByKind.get('executive');
  if (!defaultParent) return result;

  // First occurrence in `pairs` wins for both the display casing and, for a department seen
  // under two divisions, the parent — deterministic given a stable input order.
  const divisions = new Map<string, DesiredNode>();
  const departments = new Map<string, DesiredNode>();
  const activeKeys = new Set<string>();
  for (const pair of pairs) {
    const divisionName = display(pair.division);
    const departmentName = display(pair.department);
    const divisionKey = divisionName ? orgKey(divisionName, null) : null;
    if (divisionKey) {
      activeKeys.add(divisionKey);
      if (!divisions.has(divisionKey)) {
        divisions.set(divisionKey, {
          key: divisionKey,
          name: divisionName,
          kind: 'division',
          parentKey: null,
        });
      }
    }
    if (departmentName) {
      const departmentKey = orgKey(null, departmentName);
      activeKeys.add(departmentKey);
      if (!departments.has(departmentKey)) {
        departments.set(departmentKey, {
          key: departmentKey,
          name: departmentName,
          kind: 'department',
          parentKey: divisionKey,
        });
      }
    }
  }

  const blocked = new Set<string>();
  for (const node of [...divisions.values(), ...departments.values()]) {
    if (!SPINE_KINDS.has(norm(node.name))) continue;
    blocked.add(node.key);
    const spineUnit = spineByKind.get(norm(node.name)) ?? null;
    await repo.raiseConflict({
      tenantId,
      kind: 'spine_collision',
      subjectType: 'org_unit',
      subjectId: spineUnit?.id ?? null,
      entraOid: null,
      detail: {
        entra_name: node.name,
        entra_kind: node.kind,
        entra_key: node.key,
        spine: spineUnit ? { id: spineUnit.id, name: spineUnit.name, kind: spineUnit.kind } : null,
      },
    });
  }

  const links = await repo.listOrgUnitLinks(tenantId);
  const linkByKey = new Map<string, OrgUnitLinkRow>(links.map((l) => [l.entraKey, l]));
  const idByKey = new Map<string, string>();

  async function ensureUnit(node: DesiredNode, parentId: string): Promise<string | null> {
    const link = linkByKey.get(node.key);
    const linked = link ? unitById.get(link.orgUnitId) : undefined;

    if (link && linked) {
      // Defensive: a link should never point at the spine. If one somehow does, honour the
      // exemption over the link rather than renaming a unit the whole org chart hangs off.
      if (SPINE_KINDS.has(linked.kind)) return linked.id;

      const patch: { name?: string; parent_id?: string | null } = {};
      if (linked.name !== node.name) patch.name = node.name;
      if (linked.parent_id !== parentId) patch.parent_id = parentId;
      if (Object.keys(patch).length > 0) {
        await people.updateOrgUnit({ org_unit_id: linked.id, patch, session });
        if (patch.name !== undefined) linked.name = patch.name;
        if (patch.parent_id !== undefined) linked.parent_id = patch.parent_id;
      }
      if (link.kind !== node.kind) {
        await repo.upsertOrgUnitLink({
          tenantId,
          orgUnitId: linked.id,
          entraKey: node.key,
          kind: node.kind,
        });
      }
      return linked.id;
    }

    // A link whose unit was deleted out from under it is stale: drop it and create afresh,
    // otherwise every later run would fail on NOT_FOUND inside `updateOrgUnit`.
    if (link && !linked) await repo.deleteOrgUnitLink(tenantId, link.orgUnitId);

    const created = await people.createOrgUnit({
      name: node.name,
      kind: 'function',
      parent_id: parentId,
      session,
    });
    await repo.upsertOrgUnitLink({
      tenantId,
      orgUnitId: created.id,
      entraKey: node.key,
      kind: node.kind,
    });
    unitById.set(created.id, {
      id: created.id,
      parent_id: parentId,
      name: node.name,
      kind: 'function',
      head_worker_id: null,
    });
    return created.id;
  }

  for (const node of divisions.values()) {
    if (blocked.has(node.key)) continue;
    const id = await ensureUnit(node, defaultParent.id);
    if (id) idByKey.set(node.key, id);
  }
  for (const node of departments.values()) {
    if (blocked.has(node.key)) continue;
    // A department whose division collided with the spine still needs a home: the default parent.
    const parentId = (node.parentKey ? idByKey.get(node.parentKey) : null) ?? defaultParent.id;
    const id = await ensureUnit(node, parentId);
    if (id) idByKey.set(node.key, id);
  }

  for (const pair of pairs) {
    const departmentName = display(pair.department);
    const divisionName = display(pair.division);
    const target = departmentName
      ? idByKey.get(orgKey(null, departmentName))
      : divisionName
        ? idByKey.get(orgKey(divisionName, null))
        : undefined;
    if (target) result.set(orgKey(pair.division, pair.department), target);
  }

  // Reap departments before divisions: a division deleted first would still have its child and
  // report `has_children`, turning one dropped subtree into a spurious conflict.
  const reapable = links
    .filter((l) => !activeKeys.has(l.entraKey))
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'department' ? -1 : 1));
  for (const link of reapable) {
    const unit = unitById.get(link.orgUnitId);
    if (!unit) {
      await repo.deleteOrgUnitLink(tenantId, link.orgUnitId);
      continue;
    }
    if (SPINE_KINDS.has(unit.kind)) continue;

    const outcome = await people.deleteOrgUnit({ org_unit_id: link.orgUnitId, session });
    if (outcome.deleted) {
      await repo.deleteOrgUnitLink(tenantId, link.orgUnitId);
      unitById.delete(link.orgUnitId);
      continue;
    }
    // `deleteOrgUnit` reports refusal, it does not throw. Keep the unit and the link, and let a
    // human decide where the members go.
    await repo.raiseConflict({
      tenantId,
      kind: 'unit_delete_blocked',
      subjectType: 'org_unit',
      subjectId: link.orgUnitId,
      entraOid: null,
      detail: {
        reason: outcome.reason ?? null,
        entra_key: link.entraKey,
        unit_name: unit.name,
      },
    });
  }

  return result;
}

export interface DirectoryMember {
  person_id: string;
  org_unit_id: string;
  manager_oid: string | null;
}

export interface ResolveHeadsInput {
  tenantId: string;
  members: ReadonlyArray<DirectoryMember>;
  session: SessionScope;
  repo: DirectoryRepo;
  people: PeopleOrgSurface;
}

interface HeadCandidate {
  manager_oid: string;
  person_id: string | null;
  report_count: number;
}

/**
 * Derives each sync-owned unit's `head_worker_id` from the modal Entra manager of its members.
 *
 * `head_worker_id` plus the `parent_id` chain is the *only* representation of reporting in this
 * repo (F-ORG-3) — there is no `person.manager_id` and there must never be one, so an Entra
 * manager pointer only ever lands here.
 *
 * `headsSet` counts units whose head actually changed; a run that agrees with the tree writes
 * nothing and reports 0. `ambiguous` counts units that raised `manager_ambiguous`.
 */
export async function resolveHeads(
  input: ResolveHeadsInput,
): Promise<{ headsSet: number; ambiguous: number }> {
  const { tenantId, members, session, repo, people } = input;
  let headsSet = 0;
  let ambiguous = 0;
  if (members.length === 0) return { headsSet, ambiguous };

  // Only units with a link row are sync-owned; a curated unit keeps whatever head a human gave it.
  const ownedUnitIds = new Set((await repo.listOrgUnitLinks(tenantId)).map((l) => l.orgUnitId));
  if (ownedUnitIds.size === 0) return { headsSet, ambiguous };

  const { units } = await people.getOrgStructure(session);
  const unitById = new Map(units.map((u) => [u.id, u]));

  const votesByUnit = new Map<string, Map<string, number>>();
  for (const member of members) {
    if (!member.manager_oid) continue;
    if (!ownedUnitIds.has(member.org_unit_id)) continue;
    let votes = votesByUnit.get(member.org_unit_id);
    if (!votes) {
      votes = new Map<string, number>();
      votesByUnit.set(member.org_unit_id, votes);
    }
    votes.set(member.manager_oid, (votes.get(member.manager_oid) ?? 0) + 1);
  }

  const personByOid = new Map<string, string | null>();
  async function resolveManagerPerson(oid: string): Promise<string | null> {
    const cached = personByOid.get(oid);
    if (cached !== undefined) return cached;
    const link = await repo.findPersonLinkByOid(tenantId, oid);
    // `findPersonLinkByOid` deliberately returns soft-removed links, so that an Entra user who
    // reappears under the same OID revives their link instead of duplicating the person. A
    // manager who left the directory is nonetheless not a current head — check `removedAt` here.
    const personId = link && link.removedAt === null ? link.personId : null;
    personByOid.set(oid, personId);
    return personId;
  }

  for (const [unitId, votes] of votesByUnit) {
    const unit = unitById.get(unitId);
    if (!unit) continue;

    const candidates: HeadCandidate[] = [];
    for (const [managerOid, reportCount] of votes) {
      candidates.push({
        manager_oid: managerOid,
        person_id: await resolveManagerPerson(managerOid),
        report_count: reportCount,
      });
    }
    // Most reports first; ties broken on the oid so the winner never depends on member order.
    candidates.sort(
      (a, b) => b.report_count - a.report_count || a.manager_oid.localeCompare(b.manager_oid),
    );

    // Ambiguity is judged over *resolvable* candidates only. A manager outside the synced set
    // can never become a head, so a unit with one live candidate has nothing to decide.
    const resolvable = candidates.filter(
      (c): c is HeadCandidate & { person_id: string } => c.person_id !== null,
    );
    const chosen = resolvable[0];
    if (!chosen) continue;

    if (resolvable.length > 1) {
      ambiguous += 1;
      await repo.raiseConflict({
        tenantId,
        kind: 'manager_ambiguous',
        subjectType: 'org_unit',
        subjectId: unitId,
        entraOid: null,
        detail: {
          unit_name: unit.name,
          chosen: { manager_oid: chosen.manager_oid, person_id: chosen.person_id },
          candidates,
        },
      });
    }

    if (unit.head_worker_id === chosen.person_id) continue;
    await people.updateOrgUnit({
      org_unit_id: unitId,
      patch: { head_worker_id: chosen.person_id },
      session,
    });
    headsSet += 1;
  }

  return { headsSet, ambiguous };
}
