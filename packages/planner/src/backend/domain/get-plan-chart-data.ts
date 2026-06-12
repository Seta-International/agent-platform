import type { SessionScope } from '@seta/core';
import { and, eq, exists, inArray, isNull, type SQL, sql } from 'drizzle-orm';
import { plannerDb } from '../db/index.ts';
import { assigneeProjection, buckets, plans, taskAssignments, tasks } from '../db/schema.ts';
import type { ChartData, ChartStatus } from '../dto.ts';
import type { ChartFilters, ChartStatusKey, GetPlanChartDataInput } from '../inputs.ts';
import { withSpan } from '../observability.ts';
import { PlannerError, requirePermission } from '../rbac.ts';
import { groupFilterFor } from '../read-helpers.ts';

const STATUS_PERCENT: Record<ChartStatusKey, 0 | 50 | 100> = {
  not_started: 0,
  in_progress: 50,
  completed: 100,
};

const PRIORITY_META = [
  { key: 'urgent', label: 'Urgent' },
  { key: 'important', label: 'Important' },
  { key: 'medium', label: 'Medium' },
  { key: 'low', label: 'Low' },
] as const;

function priorityLabel(n: number): 'urgent' | 'important' | 'medium' | 'low' {
  if (n <= 1) return 'urgent';
  if (n <= 4) return 'important';
  if (n <= 7) return 'medium';
  return 'low';
}

function emptyStatus(): ChartStatus {
  return { not_started: 0, in_progress: 0, completed: 0 };
}

const statusCols = () => ({
  not_started: sql<number>`COUNT(*) FILTER (WHERE ${tasks.percent_complete} = 0)::int`,
  in_progress: sql<number>`COUNT(*) FILTER (WHERE ${tasks.percent_complete} = 50)::int`,
  completed: sql<number>`COUNT(*) FILTER (WHERE ${tasks.percent_complete} = 100)::int`,
});

/** Conditions derived from the user-supplied chart filters, applied to every
 * aggregation so all charts reflect the same filtered task set. */
function taskFilterConds(
  filters: ChartFilters | undefined,
  db: ReturnType<typeof plannerDb>,
): SQL[] {
  const conds: SQL[] = [];
  if (!filters) return conds;
  if (filters.bucket_ids?.length) conds.push(inArray(tasks.bucket_id, filters.bucket_ids));
  if (filters.priorities?.length) conds.push(inArray(tasks.priority_number, filters.priorities));
  if (filters.statuses?.length) {
    conds.push(
      inArray(
        tasks.percent_complete,
        filters.statuses.map((s) => STATUS_PERCENT[s]),
      ),
    );
  }
  if (filters.range?.from) conds.push(sql`${tasks.due_at} >= ${new Date(filters.range.from)}`);
  if (filters.range?.to) conds.push(sql`${tasks.due_at} <= ${new Date(filters.range.to)}`);
  if (filters.assignee_ids?.length) {
    conds.push(
      exists(
        db
          .select({ x: sql`1` })
          .from(taskAssignments)
          .where(
            and(
              eq(taskAssignments.task_id, tasks.id),
              inArray(taskAssignments.user_id, filters.assignee_ids),
            ),
          ),
      ),
    );
  }
  return conds;
}

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
  const filterConds = taskFilterConds(input.filters, db);

  const liveTasksWhere = and(
    eq(tasks.plan_id, input.plan_id),
    eq(tasks.tenant_id, session.tenant_id),
    isNull(tasks.deleted_at),
    ...filterConds,
  );

  const [statusRow] = await db
    .select({
      ...statusCols(),
      late: sql<number>`COUNT(*) FILTER (WHERE ${tasks.percent_complete} < 100 AND ${tasks.due_at} IS NOT NULL AND ${tasks.due_at} < ${now})::int`,
    })
    .from(tasks)
    .where(liveTasksWhere);

  const notStarted = statusRow?.not_started ?? 0;
  const inProgress = statusRow?.in_progress ?? 0;
  const completed = statusRow?.completed ?? 0;
  const late = statusRow?.late ?? 0;

  const byStatus: ChartStatus = {
    not_started: notStarted,
    in_progress: inProgress,
    completed,
  };

  const priorityRows = await db
    .select({ priority_number: tasks.priority_number, ...statusCols() })
    .from(tasks)
    .where(liveTasksWhere)
    .groupBy(tasks.priority_number);

  const priorityAcc: Record<'urgent' | 'important' | 'medium' | 'low', ChartStatus> = {
    urgent: emptyStatus(),
    important: emptyStatus(),
    medium: emptyStatus(),
    low: emptyStatus(),
  };
  for (const r of priorityRows) {
    const b = priorityAcc[priorityLabel(r.priority_number)];
    b.not_started += r.not_started;
    b.in_progress += r.in_progress;
    b.completed += r.completed;
  }
  const byPriority: ChartData['byPriority'] = PRIORITY_META.map((p) => ({
    key: p.key,
    label: p.label,
    ...priorityAcc[p.key],
  }));

  const bucketRows = await db
    .select({ bucketId: buckets.id, name: buckets.name, ...statusCols() })
    .from(buckets)
    .leftJoin(tasks, and(eq(tasks.bucket_id, buckets.id), isNull(tasks.deleted_at), ...filterConds))
    .where(and(eq(buckets.plan_id, input.plan_id), isNull(buckets.deleted_at)))
    .groupBy(buckets.id, buckets.name, buckets.order_hint)
    .orderBy(sql`${buckets.order_hint} ASC NULLS LAST`);

  const byBucket: ChartData['byBucket'] = bucketRows.map((r) => ({
    bucketId: r.bucketId,
    name: r.name,
    not_started: r.not_started,
    in_progress: r.in_progress,
    completed: r.completed,
  }));

  const memberRows = await db
    .select({
      userId: taskAssignments.user_id,
      displayName: assigneeProjection.display_name,
      ...statusCols(),
    })
    .from(taskAssignments)
    .innerJoin(tasks, eq(tasks.id, taskAssignments.task_id))
    .innerJoin(assigneeProjection, eq(assigneeProjection.user_id, taskAssignments.user_id))
    .where(liveTasksWhere)
    .groupBy(taskAssignments.user_id, assigneeProjection.display_name);

  const byMember: ChartData['byMember'] = memberRows.map((r) => ({
    userId: r.userId,
    displayName: r.displayName,
    not_started: r.not_started,
    in_progress: r.in_progress,
    completed: r.completed,
  }));

  const workload: ChartData['workload'] = byMember
    .map((m) => ({
      userId: m.userId,
      displayName: m.displayName,
      open: m.not_started + m.in_progress,
      completed: m.completed,
      total: m.not_started + m.in_progress + m.completed,
    }))
    .sort((a, b) => b.open - a.open);

  return {
    kpis: {
      total: notStarted + inProgress + completed,
      completed,
      in_progress: inProgress,
      not_started: notStarted,
      open: notStarted + inProgress,
      late,
    },
    byStatus,
    byPriority,
    byBucket,
    byMember,
    workload,
  };
}
