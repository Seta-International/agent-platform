import type { SessionScope } from '@seta/core';
import { can } from '@seta/shared-rbac';
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
 * Relationship-based row-scope predicate for the worker directory. SECURITY-CRITICAL.
 *
 * Returns `null` when the viewer holds `people.worker.read.all` (sees every worker in the
 * tenant). Otherwise returns a single predicate — to be AND-ed into the listWorkers WHERE —
 * matching a worker row (keyed on `worker.person_id`) iff it falls on any of four axes
 * relative to the viewer's own `person_id` (`:me`):
 *   1. self
 *   2. transitive reports (org-unit subtree headed by the viewer)
 *   3. workers actively allocated under an account the viewer manages (AM)
 *   4. workers actively allocated to a project the viewer leads
 *
 * `:me` and the tenant id are bound as parameters — never interpolated as text. All referenced
 * tables live in the `people` schema (same module), so raw `people.<table>` refs are permitted.
 */
export function buildWorkerScope(session: SessionScope): SQL | null {
  if (can(session, 'people.worker.read.all')) return null;

  const userId = session.user_id;
  const tenantId = session.tenant_id;

  // Viewer's own person_id, resolved from the session user. NULL when the viewer is not a worker
  // in this tenant — every `= :me` / `IN (... :me ...)` comparison then yields no rows, so an
  // unmapped viewer sees nothing (fail-closed).
  const me = sql`(SELECT w0.person_id FROM people.worker w0
      JOIN people.person p0 ON p0.id = w0.person_id
      WHERE p0.user_id = ${userId} AND w0.tenant_id = ${tenantId} AND w0.deleted_at IS NULL
      ORDER BY p0.id LIMIT 1)`;

  return sql`(
    ${worker.person_id} = ${me}
    OR ${worker.person_id} IN ${reportsSubtreeSql(me, tenantId)}
    OR ${worker.person_id} IN (
      SELECT worker_id FROM people.worker_allocation_projection
        WHERE active AND tenant_id = ${tenantId}
          AND account_id IN (
            SELECT account_id FROM people.account_projection
              WHERE am_worker_id = ${me} AND tenant_id = ${tenantId}
          )
    )
    OR ${worker.person_id} IN (
      SELECT worker_id FROM people.worker_allocation_projection
        WHERE active AND tenant_id = ${tenantId} AND lead_worker_id = ${me}
    )
  )`;
}
