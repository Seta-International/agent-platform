import type { SessionScope } from '@seta/core';
import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { plannerDb } from '../../db/index.ts';
import { labels, plans, taskLabels, tasks } from '../../db/schema.ts';
import { PlannerError, requirePermission } from '../rbac.ts';
import { groupFilterFor } from '../read-helpers.ts';

export async function countTasksByCategorySlot(input: {
  plan_id: string;
  session: SessionScope;
}): Promise<Record<string, number>> {
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

  const rows = await db
    .select({
      slot: labels.category_slot,
      count: sql<number>`COUNT(DISTINCT ${taskLabels.task_id})::int`,
    })
    .from(taskLabels)
    .innerJoin(labels, eq(labels.id, taskLabels.label_id))
    .innerJoin(tasks, eq(tasks.id, taskLabels.task_id))
    .where(
      and(
        eq(labels.plan_id, input.plan_id),
        isNotNull(labels.category_slot),
        isNull(labels.deleted_at),
        isNull(tasks.deleted_at),
      ),
    )
    .groupBy(labels.category_slot);

  const out: Record<string, number> = {};
  for (const row of rows) {
    if (row.slot !== null) {
      out[String(row.slot)] = Number(row.count);
    }
  }
  return out;
}
