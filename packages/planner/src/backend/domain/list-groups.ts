import type { SessionScope } from '@seta/core';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { plannerDb } from '../../db/index.ts';
import { groups } from '../../db/schema.ts';
import type { GroupRow } from '../dto.ts';
import { requirePermission } from '../rbac.ts';
import { groupFilterFor } from '../read-helpers.ts';
import { groupRowToDto } from './_group-dto.ts';

export async function listGroups(input: {
  include_deleted?: boolean;
  session: SessionScope;
}): Promise<GroupRow[]> {
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
    .select()
    .from(groups)
    .where(and(...conditions))
    .orderBy(asc(groups.name));

  return rows.map(groupRowToDto);
}
