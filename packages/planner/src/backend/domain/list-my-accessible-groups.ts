import type { SessionScope } from '@seta/core';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { plannerDb } from '../../db/index.ts';
import { groups } from '../../db/schema.ts';
import type { GroupRow } from '../dto.ts';
import { requirePermission } from '../rbac.ts';
import { isTenantAdminish } from '../read-helpers.ts';

type GroupDbRow = typeof groups.$inferSelect;

function rowToDto(row: GroupDbRow): GroupRow {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    name: row.name,
    account_id: row.account_id,
    created_by: row.created_by,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    deleted_at: row.deleted_at ? row.deleted_at.toISOString() : null,
    version: row.version,
  };
}

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
    return rows.map(rowToDto);
  }

  if (session.accessible_group_ids.length === 0) {
    return [];
  }

  const rows = await db
    .select()
    .from(groups)
    .where(and(...baseConditions, inArray(groups.id, session.accessible_group_ids)))
    .orderBy(asc(groups.name));

  return rows.map(rowToDto);
}
