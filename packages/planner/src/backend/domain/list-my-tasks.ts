import type { SessionScope } from '@seta/core';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { plannerDb } from '../../db/index.ts';
import { plans, taskAssignments, tasks } from '../../db/schema.ts';
import type { MyTasksResult, TaskPriorityNumber, TaskWithPlan } from '../dto.ts';
import type { ListMyTasksInput } from '../inputs.ts';
import { withSpan } from '../observability.ts';
import { taskRowToDto } from './_task-dto.ts';

const PRIORITY_MAP: Record<'urgent' | 'important' | 'medium' | 'low', TaskPriorityNumber> = {
  urgent: 1,
  important: 3,
  medium: 5,
  low: 9,
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

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
  const weekFromNow = new Date(now.getTime() + 7 * MS_PER_DAY);
  const twoWeeksAgo = new Date(now.getTime() - 14 * MS_PER_DAY);

  const conditions = [
    eq(tasks.tenant_id, session.tenant_id),
    isNull(tasks.deleted_at),
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
    conditions.push(eq(tasks.priority_number, PRIORITY_MAP[filter.priority]));
  }
  if (filter.due === 'overdue') {
    conditions.push(sql`${tasks.due_at} IS NOT NULL AND ${tasks.due_at} < ${now}`);
  } else if (filter.due === 'this_week') {
    conditions.push(
      sql`${tasks.due_at} IS NOT NULL AND ${tasks.due_at} >= ${now} AND ${tasks.due_at} <= ${weekFromNow}`,
    );
  } else if (filter.due === 'no_date') {
    conditions.push(isNull(tasks.due_at));
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
    .where(and(...conditions));

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

    if (dueAt !== null && dueAt < now) {
      result.late.push(withPlan);
      continue;
    }
    if (dueAt !== null && dueAt >= now && dueAt <= weekFromNow) {
      result.dueThisWeek.push(withPlan);
      continue;
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
