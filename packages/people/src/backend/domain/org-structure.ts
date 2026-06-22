import { type SQL, sql } from 'drizzle-orm';

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
