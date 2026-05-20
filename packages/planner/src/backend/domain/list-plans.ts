import type { SessionScope } from '@seta/core';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { plannerDb } from '../../db/index.ts';
import { plans } from '../../db/schema.ts';
import type { PlanRow } from '../dto.ts';
import { requirePermission } from '../rbac.ts';
import { groupFilterFor } from '../read-helpers.ts';

type PlanDbRow = typeof plans.$inferSelect;

export async function listPlans(input: {
  group_id?: string;
  include_deleted?: boolean;
  session: SessionScope;
}): Promise<PlanRow[]> {
  requirePermission(input.session, 'planner.plan.read');

  const db = plannerDb();
  const filter = groupFilterFor(input.session);

  const conditions = [eq(plans.tenant_id, input.session.tenant_id)];

  if (input.group_id !== undefined) {
    conditions.push(eq(plans.group_id, input.group_id));
  }

  if (!input.include_deleted) {
    conditions.push(isNull(plans.deleted_at));
  }

  if (filter !== null) {
    if (filter.length === 0) {
      return [];
    }
    conditions.push(inArray(plans.group_id, [...filter]));
  }

  const rows = await db
    .select()
    .from(plans)
    .where(and(...conditions))
    .orderBy(asc(plans.name));

  return rows.map(rowToDto);
}

function rowToDto(row: PlanDbRow): PlanRow {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    group_id: row.group_id,
    name: row.name,
    created_by: row.created_by,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    deleted_at: row.deleted_at ? row.deleted_at.toISOString() : null,
    version: row.version,
  };
}
