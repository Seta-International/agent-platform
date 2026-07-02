import type { SessionScope } from '@seta/core';
import {
  decisionPredicate,
  getDefaultRegistry,
  IMPLICIT_PERMISSIONS,
  resolveScope,
  type ScopePlan,
  scopeDecision,
} from '@seta/shared-rbac';
import { type SQL, sql } from 'drizzle-orm';
import { account, project } from '../db/schema.ts';

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
      AND ${account.am_worker_id} = ${session.worker_id})`;
}

/**
 * Row-scope predicate for `pm.project` reads. SECURITY-CRITICAL.
 *
 * Returns `null` when the viewer's `pm.project.read` scope resolves to tenant-wide. Otherwise
 * returns a predicate matching a project row iff it falls on any of: the viewer's org-unit
 * reach, projects the viewer leads (`pm_worker_id`), or projects on accounts the viewer manages
 * (AM). The relationship arms are null-safe: when `session.worker_id` is null they contribute no
 * arm, so a scoped viewer with no worker link and no org reach resolves to `sql\`false\`` (fail-
 * closed) rather than matching everything.
 */
export function buildProjectScope(session: SessionScope): SQL | null {
  const w = session.worker_id;
  return decide(session, 'pm.project.read', {
    orgUnit: { column: project.org_unit_id },
    relationships: [
      () => (w ? sql`${project.pm_worker_id} = ${w}` : null),
      () => (w ? sql`${project.account_id} IN ${amAccountsSubquery(session)}` : null),
    ],
  });
}

/**
 * Row-scope predicate for `pm.account` reads. SECURITY-CRITICAL.
 *
 * Returns `null` for tenant-wide `pm.account.read` scope; otherwise a predicate matching an
 * account row iff the viewer is its AM, or the viewer leads a project on that account. Null-safe
 * on `session.worker_id` per `buildProjectScope`.
 */
export function buildAccountScope(session: SessionScope): SQL | null {
  const w = session.worker_id;
  return decide(session, 'pm.account.read', {
    relationships: [
      () => (w ? sql`${account.am_worker_id} = ${w}` : null),
      () =>
        w
          ? sql`EXISTS (SELECT 1 FROM ${project}
              WHERE ${project.tenant_id} = ${session.tenant_id}
                AND ${project.account_id} = ${account.id}
                AND ${project.pm_worker_id} = ${w}
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
  const w = session.worker_id;
  return decide(session, 'pm.project.read', {
    orgUnit: { column: project.org_unit_id },
    relationships: [
      () => (w ? sql`${project.pm_worker_id} = ${w}` : null),
      () => (w ? sql`${account.am_worker_id} = ${w}` : null),
    ],
  });
}
