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
import { type SQL, sql } from 'drizzle-orm';
import { account, project, projectAccess } from '../db/schema.ts';

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
 * returns a predicate matching a project row iff it falls on any of: the viewer's org-unit
 */
export function buildProjectScope(session: SessionScope): SQL | null {
  return decide(session, 'pm.project.read', projectPlan(session));
}

/**
 * Row-scope predicate for `pm.project.manage` mutations (allocations, FUT-353). Same arms as
 * `buildProjectScope` but resolved against the manage permission: a self-scoped EM/TL manages
 * only projects they lead/own (or their AM accounts / org reach), while a tenant-scoped
 * manager gets `null` (no restriction).
 */
export function buildProjectManageScope(session: SessionScope): SQL | null {
  return decide(session, 'pm.project.manage', projectPlan(session));
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

function projectPlan(session: SessionScope): ScopePlan {
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
 * Row-scope predicate for `pm.account` reads. SECURITY-CRITICAL.
 *
 * Returns `null` for tenant-wide `pm.account.read` scope; otherwise a predicate matching an
 * account row iff the viewer is its AM, or the viewer leads/owns a project on that account
 * (`pm_person_id` or a `project_access` 'owner' grant). Null-safe
 * on `session.person_id` per `buildProjectScope`.
 */
export function buildAccountScope(session: SessionScope): SQL | null {
  const w = session.person_id;
  return decide(session, 'pm.account.read', {
    relationships: [
      () => (w ? sql`${account.am_person_id} = ${w}` : null),
      () =>
        w
          ? sql`EXISTS (SELECT 1 FROM ${project}
              WHERE ${project.tenant_id} = ${session.tenant_id}
                AND ${project.account_id} = ${account.id}
                AND (${project.pm_person_id} = ${w}
                  OR ${project.id} IN ${accessOwnerProjectsSubquery(session)})
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
      () => (w ? sql`${account.am_person_id} = ${w}` : null),
      () => (w ? sql`${project.id} IN ${accessOwnerProjectsSubquery(session)}` : null),
    ],
  });
}
