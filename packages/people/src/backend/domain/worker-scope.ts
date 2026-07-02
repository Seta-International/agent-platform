import type { SessionScope } from '@seta/core';
import {
  decisionPredicate,
  getDefaultRegistry,
  IMPLICIT_PERMISSIONS,
  resolveScope,
  scopeDecision,
} from '@seta/shared-rbac';
import { type SQL, sql } from 'drizzle-orm';
import { worker } from '../db/schema.ts';

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
    SELECT w.person_id FROM people.worker w
      WHERE w.org_unit_id IN (SELECT id FROM headed_units)
        AND w.tenant_id = ${tenantId}
        AND w.deleted_at IS NULL
        AND w.person_id <> ${me}
  )`;
}

/**
 * Viewer's own person_id, resolved from the session user. NULL when the viewer is not a worker
 * in this tenant — every `= :me` / `IN (... :me ...)` comparison then yields no rows, so an
 * unmapped viewer sees nothing (fail-closed).
 */
function meSubquery(userId: string, tenantId: string): SQL {
  return sql`(SELECT w0.person_id FROM people.worker w0
      JOIN people.person p0 ON p0.id = w0.person_id
      WHERE p0.user_id = ${userId} AND w0.tenant_id = ${tenantId} AND w0.deleted_at IS NULL
      ORDER BY p0.id LIMIT 1)`;
}

/** Workers actively allocated under an account the viewer (`:me`) manages (AM). */
function amArmSql(me: SQL, tenantId: string): SQL {
  return sql`${worker.person_id} IN (
      SELECT worker_id FROM people.worker_allocation_projection
        WHERE active AND tenant_id = ${tenantId}
          AND account_id IN (
            SELECT account_id FROM people.account_projection
              WHERE am_worker_id = ${me} AND tenant_id = ${tenantId}
          )
    )`;
}

/** Workers actively allocated to a project the viewer (`:me`) leads. */
function leadArmSql(me: SQL, tenantId: string): SQL {
  return sql`${worker.person_id} IN (
      SELECT worker_id FROM people.worker_allocation_projection
        WHERE active AND tenant_id = ${tenantId} AND lead_worker_id = ${me}
    )`;
}

/**
 * Relationship-based row-scope predicate for the worker directory. SECURITY-CRITICAL.
 *
 * Returns `null` when the viewer's `people.worker.read` scope resolves to tenant-wide (sees
 * every worker in the tenant). Otherwise returns a single predicate — to be AND-ed into the
 * listWorkers WHERE — matching a worker row (keyed on `worker.person_id`) iff it falls on any
 * of these axes relative to the viewer's own `person_id` (`:me`):
 *   1. explicit org-unit assignment reach
 *   2. self
 *   3. transitive reports (org-unit subtree headed by the viewer)
 *   4. workers actively allocated under an account the viewer manages (AM)
 *   5. workers actively allocated to a project the viewer leads
 *
 * `:me` and the tenant id are bound as parameters — never interpolated as text. All referenced
 * tables live in the `people` schema (same module), so raw `people.<table>` refs are permitted.
 */
export function buildWorkerScope(session: SessionScope): SQL | null {
  const scope = resolveScope(
    getDefaultRegistry(),
    session.assignments,
    IMPLICIT_PERMISSIONS,
    'people.worker.read',
  );
  const me = meSubquery(session.user_id, session.tenant_id);

  return decisionPredicate(
    scopeDecision(
      scope,
      {
        orgUnit: { column: worker.org_unit_id },
        self: () => sql`${worker.person_id} = ${me}`,
        relationships: [
          () => sql`${worker.person_id} IN ${reportsSubtreeSql(me, session.tenant_id)}`,
          () => amArmSql(me, session.tenant_id),
          () => leadArmSql(me, session.tenant_id),
        ],
      },
      { userId: session.user_id, tenantId: session.tenant_id },
    ),
  );
}
