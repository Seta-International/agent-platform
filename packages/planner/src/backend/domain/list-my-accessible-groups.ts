import type { SessionScope } from '@seta/core';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { plannerDb } from '../../db/index.ts';
import { groups } from '../../db/schema.ts';
import type { GroupRow } from '../dto.ts';
import { requirePermission } from '../rbac.ts';
import { isTenantAdminish } from '../read-helpers.ts';
import { groupRowToDto } from './_group-dto.ts';

export async function listMyAccessibleGroups(input: {
  session: SessionScope;
}): Promise<GroupRow[]> {
  requirePermission(input.session, 'planner.group.read');

  const db = plannerDb();
  const { session } = input;

  const baseConditions = [eq(groups.tenant_id, session.tenant_id), isNull(groups.deleted_at)];

  if (isTenantAdminish(session) || session.role_summary.cross_tenant_read) {
    const rows = await db
      .select()
      .from(groups)
      .where(and(...baseConditions))
      .orderBy(asc(groups.name));
    return rows.map(groupRowToDto);
  }

  if (session.accessible_group_ids.length === 0) {
    return [];
  }

  const rows = await db
    .select()
    .from(groups)
    .where(and(...baseConditions, inArray(groups.id, session.accessible_group_ids)))
    .orderBy(asc(groups.name));

  return rows.map(groupRowToDto);
}
