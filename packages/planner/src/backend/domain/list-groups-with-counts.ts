import type { SessionScope } from '@seta/core';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { plannerDb } from '../../db/index.ts';
import { assigneeProjection, groups } from '../../db/schema.ts';
import type { GroupWithCountsRow } from '../dto.ts';
import { requirePermission } from '../rbac.ts';
import { groupFilterFor } from '../read-helpers.ts';

export async function listGroupsWithCounts(input: {
  include_deleted?: boolean;
  session: SessionScope;
}): Promise<GroupWithCountsRow[]> {
  requirePermission(input.session, 'planner.group.read');

  const db = plannerDb();
  const filter = groupFilterFor(input.session);

  const conditions = [eq(groups.tenant_id, input.session.tenant_id)];

  if (!input.include_deleted) {
    conditions.push(isNull(groups.deleted_at));
  }

  if (filter !== null) {
    if (filter.length === 0) {
      return [];
    }
    conditions.push(inArray(groups.id, [...filter]));
  }

  const rows = await db
    .select({
      id: groups.id,
      tenant_id: groups.tenant_id,
      name: groups.name,
      description: groups.description,
      theme: groups.theme,
      visibility: groups.visibility,
      default_role: groups.default_role,
      external_source: groups.external_source,
      external_id: groups.external_id,
      external_synced_at: groups.external_synced_at,
      account_id: groups.account_id,
      created_by: groups.created_by,
      created_at: groups.created_at,
      updated_at: groups.updated_at,
      deleted_at: groups.deleted_at,
      version: groups.version,
      // Correlated subqueries: use fully-qualified outer-table reference so Postgres
      // does not resolve "id" against the subquery's own FROM table.
      plan_count: sql<number>`(SELECT COUNT(*)::int FROM planner.plans WHERE group_id = "planner"."groups"."id" AND deleted_at IS NULL)`,
      member_count: sql<number>`(SELECT COUNT(*)::int FROM planner.group_members WHERE group_id = "planner"."groups"."id")`,
      owner_display_name: assigneeProjection.display_name,
      owner_email: assigneeProjection.email,
    })
    .from(groups)
    .leftJoin(assigneeProjection, eq(assigneeProjection.user_id, groups.created_by))
    .where(and(...conditions))
    .orderBy(asc(groups.name));

  return rows.map((r) => ({
    id: r.id,
    tenant_id: r.tenant_id,
    name: r.name,
    description: r.description,
    theme: r.theme as GroupWithCountsRow['theme'],
    visibility: r.visibility as GroupWithCountsRow['visibility'],
    default_role: r.default_role as GroupWithCountsRow['default_role'],
    external_source: r.external_source as GroupWithCountsRow['external_source'],
    external_id: r.external_id,
    external_synced_at: r.external_synced_at ? r.external_synced_at.toISOString() : null,
    account_id: r.account_id,
    created_by: r.created_by,
    created_at: r.created_at.toISOString(),
    updated_at: r.updated_at.toISOString(),
    deleted_at: r.deleted_at ? r.deleted_at.toISOString() : null,
    version: r.version,
    plan_count: Number(r.plan_count),
    member_count: Number(r.member_count),
    owner_display_name: r.owner_display_name ?? null,
    owner_email: r.owner_email ?? null,
  }));
}
