import type { SessionScope } from '@seta/core';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { plannerDb } from '../db/index.ts';
import { groupMembers, groups } from '../db/schema.ts';
import type { GroupRow } from '../dto.ts';
import { requirePermission } from '../rbac.ts';
import { isTenantAdminish } from '../read-helpers.ts';
import { groupRowToDto } from './_group-dto.ts';

export async function listMyAccessibleGroups(input: {
  session: SessionScope;
}): Promise<GroupRow[]> {
  await requirePermission(input.session, 'planner.group.read');

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
    })
    .from(groups)
    .innerJoin(groupMembers, eq(groupMembers.group_id, groups.id))
    .where(and(...baseConditions, eq(groupMembers.user_id, session.user_id)))
    .orderBy(asc(groups.name));

  return rows.map(groupRowToDto);
}
