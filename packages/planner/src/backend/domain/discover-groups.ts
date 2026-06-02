import { and, eq, ilike, isNull, sql } from 'drizzle-orm';
import { plannerDb } from '../db/index.ts';
import { groups } from '../db/schema.ts';
import type { DiscoverGroupsItem } from '../dto.ts';
import type { DiscoverGroupsInput } from '../inputs.ts';
import { requirePermission } from '../rbac.ts';

export async function discoverGroups(input: DiscoverGroupsInput): Promise<DiscoverGroupsItem[]> {
  requirePermission(input.session, 'planner.group.read');

  const db = plannerDb();
  const searchTerm = `%${input.q.trim().toLowerCase()}%`;

  const rows = await db
    .select({
      id: groups.id,
      name: groups.name,
      description: groups.description,
      member_count: sql<number>`(
        SELECT COUNT(*)::int FROM planner.group_members gm2
        WHERE gm2.group_id = ${groups.id}
      )`.as('member_count'),
    })
    .from(groups)
    .where(
      and(
        eq(groups.tenant_id, input.session.tenant_id),
        eq(groups.visibility, 'public'),
        isNull(groups.deleted_at),
        ilike(groups.name, searchTerm),
      ),
    )
    .limit(50);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    member_count: r.member_count,
    owner_display_name: null,
    owner_email: null,
  }));
}
