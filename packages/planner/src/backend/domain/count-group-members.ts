import type { SessionScope } from '@seta/core';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { plannerDb } from '../db/index.ts';
import { groupMembers, groups } from '../db/schema.ts';
import { requirePermission } from '../rbac.ts';
import { groupFilterFor } from '../read-helpers.ts';

// Distinct people across the tenant's non-deleted groups (RBAC-scoped). Used for the
// Groups header total — summing per-group member_count double-counts anyone in >1 group.
export async function countDistinctGroupMembers(input: { session: SessionScope }): Promise<number> {
  await requirePermission(input.session, 'planner.group.read');

  const db = plannerDb();
  const filter = await groupFilterFor(input.session);

  const conditions = [eq(groups.tenant_id, input.session.tenant_id), isNull(groups.deleted_at)];
  if (filter !== null) {
    if (filter.length === 0) return 0;
    conditions.push(inArray(groups.id, [...filter]));
  }

  const [row] = await db
    .select({ n: sql<number>`COUNT(DISTINCT ${groupMembers.user_id})::int` })
    .from(groupMembers)
    .innerJoin(groups, eq(groups.id, groupMembers.group_id))
    .where(and(...conditions));

  return Number(row?.n ?? 0);
}
