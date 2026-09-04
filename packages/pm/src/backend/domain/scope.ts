import type { SessionScope } from '@seta/core';
import {
  can,
  decisionPredicate,
  getDefaultRegistry,
  IMPLICIT_PERMISSIONS,
  resolveScope,
  type ScopePlan,
  scopeDecision,
} from '@seta/shared-rbac';
import { inArray, type SQL, sql } from 'drizzle-orm';
import { account, allocation, project, projectAccess } from '../db/schema.ts';

function decide(session: SessionScope, permission: string, plan: ScopePlan): SQL | null {
  const scope = resolveScope(
    getDefaultRegistry(),
    session.assignments,
    IMPLICIT_PERMISSIONS,
    permission,
  );
  return decisionPredicate(
    scopeDecision(scope, plan, { userId: session.user_id, tenantId: session.tenant_id }),
  );
}

function amAccountsSubquery(session: SessionScope): SQL {
  return sql`(SELECT ${account.id} FROM ${account}
    WHERE ${account.tenant_id} = ${session.tenant_id}
      AND ${account.am_person_id} = ${session.person_id})`;
}

// Projects the viewer owns via a project_access grant (level 'owner') — the same "owner"
// notion pm.project.access.changed broadcasts (and hiring projects, FUT-328). `project.
// pm_worker_id` alone misses EM/TLs added through Project Access (FUT-353).
function accessOwnerProjectsSubquery(session: SessionScope): SQL {
  return sql`(SELECT ${projectAccess.project_id} FROM ${projectAccess}
    WHERE ${projectAccess.tenant_id} = ${session.tenant_id}
      AND ${projectAccess.person_id} = ${session.person_id}
      AND ${projectAccess.level} = 'owner')`;
}

/**
 * Row-scope predicate for `pm.project` reads. SECURITY-CRITICAL.
 *
 * Returns `null` when the viewer's `pm.project.read` scope resolves to tenant-wide. Otherwise
 * returns a predicate matching a project row iff it falls on any of: the viewer's org-unit,
 * PM/PMO role, AM-managed account, access-owner grant, or an active allocation held by the viewer.
 */
export function buildProjectScope(session: SessionScope): SQL | null {
  return decide(session, 'pm.project.read', projectReadPlan(session));
}

/**
 * Row-scope predicate for `pm.project.manage` mutations (allocations, FUT-353). Same arms as
 * `buildProjectScope` but resolved against the manage permission: a self-scoped EM/TL manages
 * only projects they lead/own (or their AM accounts / org reach), while a tenant-scoped
 * manager gets `null` (no restriction).
 */
export function buildProjectManageScope(session: SessionScope): SQL | null {
  return decide(session, 'pm.project.manage', projectManagePlan(session));
}

/**
 * Per-row boolean projecting `buildProjectManageScope` — `true` where the caller may manage
 * that project (mutate its allocations), so read endpoints can tell the UI which rows are
 * editable without a second round-trip. Tenant-wide manage → `true` for every row; no manage
 * grant → the predicate is `false`, so `false` everywhere. Must be selected in a query whose
 * FROM exposes `pm.project` (the arms reference its columns).
 */
export function buildProjectManageFlag(session: SessionScope): SQL<boolean> {
  const scope = buildProjectManageScope(session);
  if (!scope) return sql<boolean>`true`;
  return sql<boolean>`(CASE WHEN ${scope} THEN true ELSE false END)`;
}

export function buildProjectReadFlag(session: SessionScope): SQL<boolean> {
  const scope = buildProjectScope(session);
  if (!scope) return sql<boolean>`true`;
  return sql<boolean>`(CASE WHEN ${scope} THEN true ELSE false END)`;
}

export function buildProjectReporterFlag(session: SessionScope): SQL<boolean> {
  const w = session.person_id;
  if (w === null || !can(session, 'pm.project.manage')) return sql<boolean>`false`;
  return sql<boolean>`(CASE WHEN ${project.pm_person_id} = ${w}
      OR ${project.pmo_person_id} = ${w}
      OR ${project.id} IN ${accessOwnerProjectsSubquery(session)}
    THEN true ELSE false END)`;
}

function projectReadPlan(session: SessionScope): ScopePlan {
  const w = session.person_id;
  return {
    orgUnit: { column: project.org_unit_id },
    relationships: [
      () => (w ? sql`${project.pm_person_id} = ${w}` : null),
      () => (w ? sql`${project.pmo_person_id} = ${w}` : null),
      () => (w ? sql`${project.account_id} IN ${amAccountsSubquery(session)}` : null),
      () => (w ? sql`${project.id} IN ${accessOwnerProjectsSubquery(session)}` : null),
      () =>
        w
          ? sql`EXISTS (SELECT 1 FROM ${allocation}
              WHERE ${allocation.tenant_id} = ${session.tenant_id}
                AND ${allocation.project_id} = ${project.id}
                AND ${allocation.person_id} = ${w}
                AND ${allocation.deleted_at} IS NULL)`
          : null,
    ],
  };
}

function projectManagePlan(session: SessionScope): ScopePlan {
  const w = session.person_id;
  return {
    orgUnit: { column: project.org_unit_id },
    relationships: [
      () => (w ? sql`${project.pm_person_id} = ${w}` : null),
      () => (w ? sql`${project.pmo_person_id} = ${w}` : null),
      () => (w ? sql`${project.account_id} IN ${amAccountsSubquery(session)}` : null),
      () => (w ? sql`${project.id} IN ${accessOwnerProjectsSubquery(session)}` : null),
    ],
  };
}

/**
 * Narrow manage check for reassigning a project's EM/PMO (`pm_person_id`/`pmo_person_id`).
 * SECURITY-CRITICAL: unlike `buildProjectManageScope`, this deliberately excludes the
 * self/relationship-arm widening — an incumbent EM/PMO (or Project Access owner) holding only
 * a self-scoped `pm.manager`/`pm.pmo` grant can manage their own project generally, but must
 * not be able to unilaterally reassign themselves or their counterpart off it. Only a
 * tenant-wide or org-unit-matching grant qualifies.
 */
export function canAssignProjectLeadership(
  session: SessionScope,
  org_unit_id: string | null,
): boolean {
  const scope = resolveScope(
    getDefaultRegistry(),
    session.assignments,
    IMPLICIT_PERMISSIONS,
    'pm.project.manage',
  );
  if (scope.kind === 'tenant') return true;
  if (scope.kind === 'subset') {
    return org_unit_id !== null && scope.org_unit_ids.includes(org_unit_id);
  }
  return false;
}

/**
 * Row-scope predicate for `pm.account` reads. SECURITY-CRITICAL.
 *
 * Returns `null` for tenant-wide `pm.account.read` scope; otherwise a predicate matching an
 * account row iff the viewer is its AM, the viewer leads/owns/has allocations on a project on that
 * account (`pm_person_id`, `pmo_person_id`, `project_access` 'owner', or active `allocation`),
 * or the account has projects in the viewer's scoped org unit. Null-safe on `session.person_id`.
 */
export function buildAccountScope(session: SessionScope): SQL | null {
  const w = session.person_id;
  const permScope = resolveScope(
    getDefaultRegistry(),
    session.assignments,
    IMPLICIT_PERMISSIONS,
    'pm.account.read',
  );
  return decide(session, 'pm.account.read', {
    relationships: [
      () => (w ? sql`${account.am_person_id} = ${w}` : null),
      () =>
        w
          ? sql`EXISTS (SELECT 1 FROM ${project}
              WHERE ${project.tenant_id} = ${session.tenant_id}
                AND ${project.account_id} = ${account.id}
                AND (${project.pm_person_id} = ${w}
                  OR ${project.pmo_person_id} = ${w}
                  OR ${project.id} IN ${accessOwnerProjectsSubquery(session)}
                  OR EXISTS (SELECT 1 FROM ${allocation}
                    WHERE ${allocation.tenant_id} = ${session.tenant_id}
                      AND ${allocation.project_id} = ${project.id}
                      AND ${allocation.person_id} = ${w}
                      AND ${allocation.deleted_at} IS NULL))
                AND ${project.deleted_at} IS NULL)`
          : null,
      () =>
        permScope.kind === 'subset' && permScope.org_unit_ids.length > 0
          ? sql`EXISTS (SELECT 1 FROM ${project}
              WHERE ${project.tenant_id} = ${session.tenant_id}
                AND ${project.account_id} = ${account.id}
                AND ${inArray(project.org_unit_id, [...permScope.org_unit_ids])}
                AND ${project.deleted_at} IS NULL)`
          : null,
    ],
  });
}

/**
 * Row-scope predicate for `listAllocations`, evaluated against the already-joined `project` and
 * `account` tables (see read-allocations.ts). Same arms as `buildProjectScope`, expressed
 * directly against the joined tables rather than a subquery for the AM arm.
 */
export function buildAllocationJoinScope(session: SessionScope): SQL | null {
  const w = session.person_id;
  return decide(session, 'pm.project.read', {
    orgUnit: { column: project.org_unit_id },
    relationships: [
      () => (w ? sql`${project.pm_person_id} = ${w}` : null),
      () => (w ? sql`${project.pmo_person_id} = ${w}` : null),
      () => (w ? sql`${account.am_person_id} = ${w}` : null),
      () => (w ? sql`${project.id} IN ${accessOwnerProjectsSubquery(session)}` : null),
      () => (w ? sql`${allocation.person_id} = ${w}` : null),
    ],
  });
}
