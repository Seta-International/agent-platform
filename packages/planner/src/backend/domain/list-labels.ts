import type { SessionScope } from '@seta/core';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { plannerDb } from '../../db/index.ts';
import { labels, plans } from '../../db/schema.ts';
import type { LabelRow } from '../dto.ts';
import { PlannerError, requirePermission } from '../rbac.ts';
import { groupFilterFor } from '../read-helpers.ts';

type LabelDbRow = typeof labels.$inferSelect;

export async function listLabels(input: {
  plan_id: string;
  include_deleted?: boolean;
  session: SessionScope;
}): Promise<LabelRow[]> {
  const db = plannerDb();

  const [plan] = await db
    .select()
    .from(plans)
    .where(and(eq(plans.id, input.plan_id), isNull(plans.deleted_at)))
    .limit(1);

  if (!plan) {
    throw new PlannerError('NOT_FOUND', 'Plan not found', { plan_id: input.plan_id });
  }

  if (plan.tenant_id !== input.session.tenant_id) {
    throw new PlannerError('CROSS_TENANT', 'Plan belongs to another tenant', {
      plan_id: input.plan_id,
    });
  }

  requirePermission(input.session, 'planner.task.read', plan.group_id);

  const filter = groupFilterFor(input.session);
  if (filter !== null && !filter.includes(plan.group_id)) {
    throw new PlannerError('FORBIDDEN', 'No access to group', { plan_id: input.plan_id });
  }

  const conditions = [eq(labels.plan_id, input.plan_id)];
  if (!input.include_deleted) {
    conditions.push(isNull(labels.deleted_at));
  }

  const rows = await db
    .select()
    .from(labels)
    .where(and(...conditions))
    .orderBy(asc(labels.name));

  return rows.map(rowToDto);
}

function rowToDto(row: LabelDbRow): LabelRow {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    plan_id: row.plan_id,
    name: row.name,
    color: row.color,
    created_at: row.created_at.toISOString(),
    deleted_at: row.deleted_at ? row.deleted_at.toISOString() : null,
  };
}
