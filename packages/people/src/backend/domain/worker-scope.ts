import type { SessionScope } from '@seta/core';
import { listAccountIdsManagedBy } from '@seta/pm';
import {
  decisionPredicate,
  getDefaultRegistry,
  IMPLICIT_PERMISSIONS,
  resolveScope,
  scopeDecision,
} from '@seta/shared-rbac';
import { type SQL, sql } from 'drizzle-orm';
import { person } from '../db/schema.ts';

/**
 * Parenthesized subquery: the person_ids transitively reporting to `:me` via the org-unit
 * subtree headed by `:me`. A worker reports to their unit's head; a unit head reports to the
 * parent unit's head — so `:me`'s transitive reports are every member of every org-unit subtree
 * `:me` heads, excluding `:me`. Tenant-scoped; `me` and `tenantId` are bound, never interpolated.
 */
export function reportsSubtreeSql(me: SQL, tenantId: string): SQL {
  return sql`(
    WITH RECURSIVE headed_units AS (
      SELECT id FROM people.org_unit
        WHERE head_worker_id = ${me} AND tenant_id = ${tenantId}
      UNION
      SELECT c.id FROM people.org_unit c
        JOIN headed_units h ON c.parent_id = h.id
        WHERE c.tenant_id = ${tenantId}
    )
    SELECT p.id FROM people.person p
      WHERE p.org_unit_id IN (SELECT id FROM headed_units)
        AND p.tenant_id = ${tenantId}
        AND p.deleted_at IS NULL
        AND p.id <> ${me}
  )`;
}

/**
 * Viewer's own person_id, resolved from the session user. NULL when the viewer is not a worker
 * in this tenant — every `= :me` / `IN (... :me ...)` comparison then yields no rows, so an
 * unmapped viewer sees nothing (fail-closed).
 */
function meSubquery(userId: string, tenantId: string): SQL {
  return sql`(SELECT p0.id FROM people.person p0
      JOIN people.user_projection up0 ON up0.person_id = p0.id
      WHERE up0.user_id = ${userId} AND p0.tenant_id = ${tenantId} AND p0.deleted_at IS NULL
      LIMIT 1)`;
}

/**
 * Workers actively allocated under an account the viewer manages (AM). The managed-account list
 * is sourced from `@seta/pm.listAccountIdsManagedBy` (pm.account.am_person_id), not a local
 * projection column. Fail-closed: a viewer managing no account contributes no rows to the scope.
 */
function amArmSql(managedAccountIds: string[], tenantId: string): SQL | null {
  if (managedAccountIds.length === 0) return null;
  return sql`${person.id} IN (
      SELECT person_id FROM people.worker_allocation_projection
        WHERE active AND tenant_id = ${tenantId}
          AND account_id IN (${sql.join(
            managedAccountIds.map((id) => sql`${id}::uuid`),
            sql`, `,
          )})
    )`;
}

/** Workers actively allocated to a project the viewer (`:me`) leads. */
function leadArmSql(me: SQL, tenantId: string): SQL {
  return sql`${person.id} IN (
      SELECT person_id FROM people.worker_allocation_projection
        WHERE active AND tenant_id = ${tenantId} AND lead_person_id = ${me}
    )`;
}

/**
 * Relationship-based row-scope predicate for worker detail and operational surfaces
 * (profile, history, allocation grid, utilization). SECURITY-CRITICAL.
 *
 * Employee list and org chart are tenant-wide for every holder of `people.worker.read`
 * (FUT-542) and do not call this builder.
 *
 * Returns `null` when the viewer's `people.worker.read` scope resolves to tenant-wide (sees
 * every worker in the tenant). Otherwise returns a single predicate — to be AND-ed into the
 * WHERE — matching a worker row (keyed on `worker.person_id`) iff it falls on any of these axes
 * relative to the viewer's own `person_id` (`:me`):
 *   1. explicit org-unit assignment reach
 *   2. self
 *   3. transitive reports (org-unit subtree headed by the viewer)
 *   4. workers actively allocated under an account the viewer manages (AM) — accounts sourced
 *      from `@seta/pm.listAccountIdsManagedBy`, not a local projection column
 *   5. workers actively allocated to a project the viewer leads
 *
 * `:me` and the tenant id are bound as parameters — never interpolated as text. All referenced
 * tables live in the `people` schema (same module), so raw `people.<table>` refs are permitted.
 */
export async function buildWorkerScope(session: SessionScope): Promise<SQL | null> {
  const scope = resolveScope(
    getDefaultRegistry(),
    session.assignments,
    IMPLICIT_PERMISSIONS,
    'people.worker.read',
  );
  const me = meSubquery(session.user_id, session.tenant_id);
  const managedAccountIds = session.person_id
    ? await listAccountIdsManagedBy(session.person_id, session.tenant_id)
    : [];

  return decisionPredicate(
    scopeDecision(
      scope,
      {
        orgUnit: { column: person.org_unit_id },
        self: () => sql`${person.id} = ${me}`,
        relationships: [
          () => sql`${person.id} IN ${reportsSubtreeSql(me, session.tenant_id)}`,
          () => amArmSql(managedAccountIds, session.tenant_id),
          () => leadArmSql(me, session.tenant_id),
        ],
      },
      { userId: session.user_id, tenantId: session.tenant_id },
    ),
  );
}
