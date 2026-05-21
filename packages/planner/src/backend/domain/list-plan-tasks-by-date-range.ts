import type { SessionScope } from '@seta/core';
import { eq, sql } from 'drizzle-orm';
import { plannerDb } from '../../db/index.ts';
import { plans, tasks } from '../../db/schema.ts';
import type { TaskRow } from '../dto.ts';
import type { ListPlanTasksByDateRangeInput } from '../inputs.ts';
import { withSpan } from '../observability.ts';
import { PlannerError, requirePermission } from '../rbac.ts';
import { groupFilterFor } from '../read-helpers.ts';
import { taskRowToDto } from './_task-dto.ts';

type TaskDbRow = typeof tasks.$inferSelect;

export async function listPlanTasksByDateRange(
  input: ListPlanTasksByDateRangeInput,
  session: SessionScope,
): Promise<TaskRow[]> {
  return withSpan(
    'planner.plan.schedule.list',
    {
      'planner.tenant_id': session.tenant_id,
      'planner.user_id': session.user_id,
      'planner.plan_id': input.plan_id,
    },
    () => listPlanTasksByDateRangeImpl(input, session),
  );
}

async function listPlanTasksByDateRangeImpl(
  input: ListPlanTasksByDateRangeInput,
  session: SessionScope,
): Promise<TaskRow[]> {
  const db = plannerDb();

  const [plan] = await db.select().from(plans).where(eq(plans.id, input.plan_id)).limit(1);
  if (!plan || plan.deleted_at !== null) {
    throw new PlannerError('NOT_FOUND', 'Plan not found', { plan_id: input.plan_id });
  }
  if (plan.tenant_id !== session.tenant_id) {
    throw new PlannerError('CROSS_TENANT', 'Plan belongs to another tenant', {
      plan_id: input.plan_id,
    });
  }

  requirePermission(session, 'planner.plan.read', plan.group_id);

  const filter = groupFilterFor(session);
  if (filter !== null && !filter.includes(plan.group_id)) {
    throw new PlannerError('FORBIDDEN', 'No access to group', { plan_id: input.plan_id });
  }

  const rows = await db
    .select()
    .from(tasks)
    .where(
      sql`${tasks.plan_id} = ${input.plan_id}::uuid
        AND ${tasks.tenant_id} = ${session.tenant_id}::uuid
        AND ${tasks.deleted_at} IS NULL
        AND tstzrange(coalesce(${tasks.start_at}, ${tasks.due_at}), coalesce(${tasks.due_at}, ${tasks.start_at}), '[]')
            && tstzrange(${input.from}::timestamptz, ${input.to}::timestamptz, '[]')`,
    );

  return (rows as TaskDbRow[]).map(taskRowToDto);
}
