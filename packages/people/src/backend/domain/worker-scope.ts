import type { SessionScope } from '@seta/core';
import { can } from '@seta/shared-rbac';
import { type SQL, sql } from 'drizzle-orm';
import { worker } from '../db/schema.ts';

/**
 * Relationship-based row-scope predicate for the worker directory. SECURITY-CRITICAL.
 *
 * Returns `null` when the viewer holds `people.worker.read.all` (sees every worker in the
 * tenant). Otherwise returns a single predicate — to be AND-ed into the listWorkers WHERE —
 * matching a worker row (keyed on `worker.person_id`) iff it falls on any of four axes
 * relative to the viewer's own `person_id` (`:me`):
 *   1. self
 *   2. transitive reports (recursive walk DOWN manager_id from the viewer)
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
    OR ${worker.person_id} IN (
      WITH RECURSIVE reports AS (
        SELECT person_id FROM people.worker
          WHERE manager_id = ${me} AND tenant_id = ${tenantId} AND deleted_at IS NULL
        UNION
        SELECT w.person_id FROM people.worker w
          JOIN reports r ON w.manager_id = r.person_id
          WHERE w.tenant_id = ${tenantId} AND w.deleted_at IS NULL
      )
      SELECT person_id FROM reports
    )
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
