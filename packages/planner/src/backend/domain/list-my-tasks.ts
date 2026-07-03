import type { SessionScope } from '@seta/core';
import { and, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { plannerDb } from '../db/index.ts';
import { groups, plans, taskAssignments, tasks } from '../db/schema.ts';
import type { MyTasksResult, TaskWithPlan } from '../dto.ts';
import type { ListMyTasksInput } from '../inputs.ts';
import { withSpan } from '../observability.ts';
import { taskRowToDto } from './_task-dto.ts';
import { fetchAssigneesAndLabels } from './_task-supplementary.ts';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** UTC calendar day (YYYY-MM-DD) — matches how due_at is stored from date pickers. */
function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addUtcDays(key: string, days: number): string {
  const base = new Date(`${key}T00:00:00.000Z`);
  return utcDateKey(new Date(base.getTime() + days * MS_PER_DAY));
}

function compareTasks(a: TaskWithPlan, b: TaskWithPlan): number {
  const aPrio = a.assignee_priority;
  const bPrio = b.assignee_priority;
  if (aPrio !== bPrio) {
    if (aPrio === null) return 1;
    if (bPrio === null) return -1;
    return aPrio < bPrio ? -1 : 1;
  }
  const aDue = a.due_at;
  const bDue = b.due_at;
  if (aDue !== bDue) {
    if (aDue === null) return 1;
    if (bDue === null) return -1;
    return aDue < bDue ? -1 : 1;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export async function listMyTasks(
  input: ListMyTasksInput,
  session: SessionScope,
): Promise<MyTasksResult> {
  return withSpan(
    'planner.my-tasks.list',
    {
      'planner.tenant_id': session.tenant_id,
      'planner.user_id': session.user_id,
    },
    () => listMyTasksImpl(input, session),
  );
}

async function listMyTasksImpl(
  input: ListMyTasksInput,
  session: SessionScope,
): Promise<MyTasksResult> {
  const db = plannerDb();
  const now = new Date();
  const todayKey = utcDateKey(now);
  const weekEndKey = addUtcDays(todayKey, 7);
  const startOfTodayUtc = new Date(`${todayKey}T00:00:00.000Z`);
  const endOfWeekUtc = new Date(`${weekEndKey}T23:59:59.999Z`);
  const twoWeeksAgo = new Date(now.getTime() - 14 * MS_PER_DAY);

  const conditions = [
    eq(tasks.tenant_id, session.tenant_id),
    isNull(tasks.deleted_at),
    isNull(plans.deleted_at),
    isNull(groups.deleted_at),
    isNull(plans.archived_at),
    eq(taskAssignments.user_id, session.user_id),
  ];

  const filter = input.filter ?? {};
  if (filter.plan_id !== undefined) {
    conditions.push(eq(tasks.plan_id, filter.plan_id));
  }
  if (filter.group_id !== undefined) {
    conditions.push(eq(plans.group_id, filter.group_id));
  }
  if (filter.priority !== undefined) {
    conditions.push(eq(tasks.priority, filter.priority));
  }
  if (filter.due === 'overdue') {
    conditions.push(sql`${tasks.due_at} IS NOT NULL AND ${tasks.due_at} < ${startOfTodayUtc}`);
  } else if (filter.due === 'this_week') {
    conditions.push(
      sql`${tasks.due_at} IS NOT NULL AND ${tasks.due_at} >= ${startOfTodayUtc} AND ${tasks.due_at} <= ${endOfWeekUtc}`,
    );
  } else if (filter.due === 'no_date') {
    conditions.push(isNull(tasks.due_at));
  }

  if (input.search?.trim()) {
    // Escape LIKE wildcards so the keyword is matched as literal text.
    const term = `%${input.search.trim().replace(/[\\%_]/g, '\\$&')}%`;
    const match = or(ilike(tasks.title, term), ilike(tasks.description_text, term));
    if (match) conditions.push(match);
  }

  const rows = await db
    .select({
      task: tasks,
      plan_id: plans.id,
      plan_name: plans.name,
      plan_group_id: plans.group_id,
    })
    .from(tasks)
    .innerJoin(taskAssignments, eq(taskAssignments.task_id, tasks.id))
    .innerJoin(plans, eq(plans.id, tasks.plan_id))
    .innerJoin(groups, eq(groups.id, plans.group_id))
    .where(and(...conditions));

  const { assigneesByTaskId, labelsByTaskId } = await fetchAssigneesAndLabels(
    db,
    rows.map((r) => r.task.id),
  );

  const result: MyTasksResult = {
    late: [],
    dueThisWeek: [],
    inProgress: [],
    notStarted: [],
    recentlyCompleted: [],
  };

  for (const r of rows) {
    const dto = taskRowToDto(r.task);
    const withPlan: TaskWithPlan = {
      ...dto,
      plan: { id: r.plan_id, name: r.plan_name, group_id: r.plan_group_id },
      assignees: assigneesByTaskId.get(r.task.id) ?? [],
      labels: labelsByTaskId.get(r.task.id) ?? [],
    };

    const isDeferred = dto.is_deferred;
    const pct = dto.percent_complete;
    const dueAt = r.task.due_at;
    const updatedAt = r.task.updated_at;

    if (pct === 100) {
      if (updatedAt >= twoWeeksAgo) {
        result.recentlyCompleted.push(withPlan);
      }
      continue;
    }

    if (isDeferred) continue;

    if (dueAt !== null) {
      const dueKey = utcDateKey(dueAt);
      if (dueKey < todayKey) {
        result.late.push(withPlan);
        continue;
      }
      if (dueKey <= weekEndKey) {
        result.dueThisWeek.push(withPlan);
        continue;
      }
    }
    if (pct > 0) {
      result.inProgress.push(withPlan);
      continue;
    }
    if (pct === 0) {
      result.notStarted.push(withPlan);
    }
  }

  result.late.sort(compareTasks);
  result.dueThisWeek.sort(compareTasks);
  result.inProgress.sort(compareTasks);
  result.notStarted.sort(compareTasks);
  result.recentlyCompleted.sort(compareTasks);

  return result;
}
