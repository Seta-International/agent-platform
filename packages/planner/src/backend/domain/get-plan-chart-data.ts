import type { SessionScope } from '@seta/core';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { plannerDb } from '../../db/index.ts';
import { assigneeProjection, buckets, plans, taskAssignments, tasks } from '../../db/schema.ts';
import type { ChartData } from '../dto.ts';
import type { GetPlanChartDataInput } from '../inputs.ts';
import { withSpan } from '../observability.ts';
import { PlannerError, requirePermission } from '../rbac.ts';
import { groupFilterFor } from '../read-helpers.ts';

const PRIORITY_LABEL: Record<number, 'urgent' | 'important' | 'medium' | 'low'> = {
  1: 'urgent',
  3: 'important',
  5: 'medium',
  9: 'low',
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function getPlanChartData(
  input: GetPlanChartDataInput,
  session: SessionScope,
): Promise<ChartData> {
  return withSpan(
    'planner.plan.charts.get',
    {
      'planner.tenant_id': session.tenant_id,
      'planner.user_id': session.user_id,
      'planner.plan_id': input.plan_id,
    },
    () => getPlanChartDataImpl(input, session),
  );
}

async function getPlanChartDataImpl(
  input: GetPlanChartDataInput,
  session: SessionScope,
): Promise<ChartData> {
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

  const groupFilter = groupFilterFor(session);
  if (groupFilter !== null && !groupFilter.includes(plan.group_id)) {
    throw new PlannerError('FORBIDDEN', 'No access to group', { plan_id: input.plan_id });
  }

  const now = new Date();
  const threeDaysFromNow = new Date(now.getTime() + 3 * MS_PER_DAY);
  const twoWeeksAgo = new Date(now.getTime() - 14 * MS_PER_DAY);

  // byStatus + byPriority + kpis: all derived from a single tasks scan.
  const liveTasksWhere = and(
    eq(tasks.plan_id, input.plan_id),
    eq(tasks.tenant_id, session.tenant_id),
    isNull(tasks.deleted_at),
  );

  const [statusRow] = await db
    .select({
      completed: sql<number>`COUNT(*) FILTER (WHERE ${tasks.percent_complete} = 100)::int`,
      in_progress: sql<number>`COUNT(*) FILTER (WHERE ${tasks.percent_complete} > 0 AND ${tasks.percent_complete} < 100 AND NOT ${tasks.is_deferred})::int`,
      not_started: sql<number>`COUNT(*) FILTER (WHERE ${tasks.percent_complete} = 0 AND NOT ${tasks.is_deferred})::int`,
      deferred: sql<number>`COUNT(*) FILTER (WHERE ${tasks.is_deferred} = true)::int`,
      at_risk: sql<number>`COUNT(*) FILTER (WHERE ${tasks.due_at} IS NOT NULL AND ${tasks.due_at} < ${threeDaysFromNow} AND ${tasks.percent_complete} < 100)::int`,
      velocity_completed: sql<number>`COUNT(*) FILTER (WHERE ${tasks.percent_complete} = 100 AND ${tasks.updated_at} >= ${twoWeeksAgo})::int`,
    })
    .from(tasks)
    .where(liveTasksWhere);

  const completed = statusRow?.completed ?? 0;
  const inProgress = statusRow?.in_progress ?? 0;
  const notStarted = statusRow?.not_started ?? 0;
  const deferred = statusRow?.deferred ?? 0;
  const atRisk = statusRow?.at_risk ?? 0;
  const velocityCompleted = statusRow?.velocity_completed ?? 0;

  const byStatus: ChartData['byStatus'] = {
    not_started: notStarted,
    in_progress: inProgress,
    completed,
    deferred,
  };

  const priorityRows = await db
    .select({
      priority_number: tasks.priority_number,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(tasks)
    .where(liveTasksWhere)
    .groupBy(tasks.priority_number);

  const byPriority: ChartData['byPriority'] = {
    urgent: 0,
    important: 0,
    medium: 0,
    low: 0,
  };
  for (const r of priorityRows) {
    const label = PRIORITY_LABEL[r.priority_number];
    if (label) byPriority[label] = r.count;
  }

  const bucketRows = await db
    .select({
      bucketId: buckets.id,
      name: buckets.name,
      order_hint: buckets.order_hint,
      count: sql<number>`COUNT(${tasks.id}) FILTER (WHERE ${tasks.deleted_at} IS NULL)::int`,
    })
    .from(buckets)
    .leftJoin(tasks, eq(tasks.bucket_id, buckets.id))
    .where(and(eq(buckets.plan_id, input.plan_id), isNull(buckets.deleted_at)))
    .groupBy(buckets.id, buckets.name, buckets.order_hint)
    .orderBy(sql`${buckets.order_hint} ASC NULLS LAST`);

  const byBucket: ChartData['byBucket'] = bucketRows.map((r) => ({
    bucketId: r.bucketId,
    name: r.name,
    count: r.count,
  }));

  const memberRows = await db
    .select({
      userId: taskAssignments.user_id,
      displayName: assigneeProjection.display_name,
      count: sql<number>`COUNT(${taskAssignments.task_id})::int`,
    })
    .from(taskAssignments)
    .innerJoin(tasks, eq(tasks.id, taskAssignments.task_id))
    .innerJoin(assigneeProjection, eq(assigneeProjection.user_id, taskAssignments.user_id))
    .where(
      and(
        eq(tasks.plan_id, input.plan_id),
        eq(tasks.tenant_id, session.tenant_id),
        isNull(tasks.deleted_at),
      ),
    )
    .groupBy(taskAssignments.user_id, assigneeProjection.display_name);

  const byMember: ChartData['byMember'] = memberRows.map((r) => ({
    userId: r.userId,
    displayName: r.displayName,
    count: r.count,
  }));

  const open = notStarted + inProgress + deferred;
  const velocity = velocityCompleted / 2;

  return {
    kpis: { open, completed, atRisk, velocity },
    byStatus,
    byPriority,
    byBucket,
    byMember,
  };
}
