import type { SessionScope } from '@seta/core';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { plannerDb } from '../db/index.ts';
import { assigneeProjection, plans, taskComments, tasks } from '../db/schema.ts';
import type { CommentDto, CommentListResult } from '../dto.ts';
import type { ListCommentsInput } from '../inputs.ts';
import { withSpan } from '../observability.ts';
import { PlannerError, requirePermission } from '../rbac.ts';
import { groupFilterFor } from '../read-helpers.ts';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

interface Cursor {
  t: string;
  i: string;
}

function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c), 'utf8').toString('base64');
}

function decodeCursor(s: string): Cursor {
  try {
    return JSON.parse(Buffer.from(s, 'base64').toString('utf8')) as Cursor;
  } catch {
    throw new PlannerError('VALIDATION', 'Invalid cursor', { cursor: s });
  }
}

export async function listComments(
  input: ListCommentsInput & { session: SessionScope },
): Promise<CommentListResult> {
  return withSpan(
    'planner.comment.list',
    {
      'planner.tenant_id': input.session.tenant_id,
      'planner.user_id': input.session.user_id,
      'planner.task_id': input.task_id,
    },
    () => listCommentsImpl(input),
  );
}

async function listCommentsImpl(
  input: ListCommentsInput & { session: SessionScope },
): Promise<CommentListResult> {
  const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const db = plannerDb();

  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, input.task_id), isNull(tasks.deleted_at)))
    .limit(1);
  if (!task || task.tenant_id !== input.session.tenant_id) {
    throw new PlannerError('NOT_FOUND', 'Task not found', { task_id: input.task_id });
  }

  const [plan] = await db.select().from(plans).where(eq(plans.id, task.plan_id)).limit(1);
  if (!plan) {
    throw new PlannerError('NOT_FOUND', 'Parent plan not found', { plan_id: task.plan_id });
  }

  await requirePermission(input.session, 'planner.task.comment.read', plan.group_id);

  const groupFilter = await groupFilterFor(input.session);
  if (groupFilter !== null && !groupFilter.includes(plan.group_id)) {
    throw new PlannerError('FORBIDDEN', 'No access to group', { group_id: plan.group_id });
  }

  const cursorCond = input.cursor
    ? (() => {
        const c = decodeCursor(input.cursor as string);
        return sql`AND (${taskComments.created_at}, ${taskComments.id}) < (${c.t}::timestamptz, ${c.i}::uuid)`;
      })()
    : sql``;

  const rows = await db
    .select({
      id: taskComments.id,
      task_id: taskComments.task_id,
      author_id: taskComments.author_id,
      body: taskComments.body,
      created_at: taskComments.created_at,
      edited_at: taskComments.edited_at,
      display_name: assigneeProjection.display_name,
    })
    .from(taskComments)
    .leftJoin(assigneeProjection, eq(assigneeProjection.user_id, taskComments.author_id))
    .where(
      sql`${taskComments.task_id} = ${input.task_id}::uuid
          AND ${taskComments.deleted_at} IS NULL ${cursorCond}`,
    )
    .orderBy(desc(taskComments.created_at), desc(taskComments.id))
    .limit(limit + 1);

  const has_more = rows.length > limit;
  const sliced = rows.slice(0, limit);
  const comments: CommentDto[] = sliced.map((r) => ({
    id: r.id,
    task_id: r.task_id,
    author_id: r.author_id,
    author_display_name: r.display_name ?? 'Unknown user',
    body: r.body,
    created_at: r.created_at.toISOString(),
    edited_at: r.edited_at ? r.edited_at.toISOString() : null,
  }));

  let next_cursor: string | undefined;
  if (has_more) {
    const last = comments[comments.length - 1];
    if (last) next_cursor = encodeCursor({ t: last.created_at, i: last.id });
  }

  return { comments, has_more, next_cursor };
}
