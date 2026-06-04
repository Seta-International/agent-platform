import type { SessionScope } from '@seta/core';
import { eq, sql } from 'drizzle-orm';
import { plannerDb } from '../db/index.ts';
import { plans, tasks } from '../db/schema.ts';
import type { CalendarTasksResult } from '../dto.ts';
import type { ListPlanTasksByDateRangeInput } from '../inputs.ts';
import { withSpan } from '../observability.ts';
import { PlannerError, requirePermission } from '../rbac.ts';
import { groupFilterFor } from '../read-helpers.ts';
import { decodeCursor, encodeCursor } from './_cursor.ts';
import { taskRowToDto } from './_task-dto.ts';
import { fetchSupplementaryData, stitchRow } from './list-tasks.ts';

type TaskDbRow = typeof tasks.$inferSelect;

export async function listPlanTasksByDateRange(
  input: ListPlanTasksByDateRangeInput,
  session: SessionScope,
): Promise<CalendarTasksResult> {
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
): Promise<CalendarTasksResult> {
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

  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);

  // Range overlap. Equivalent to the spec's three-clause OR: start-only tasks
  // collapse to [start,start], due-only to [due,due]; both-NULL yields an
  // unbounded range (,) in Postgres which overlaps everything, so we
  // explicitly gate on at least one date being present (AC-5).
  const overlap = sql`${tasks.plan_id} = ${input.plan_id}::uuid
    AND ${tasks.tenant_id} = ${session.tenant_id}::uuid
    AND ${tasks.deleted_at} IS NULL
    AND (${tasks.start_at} IS NOT NULL OR ${tasks.due_at} IS NOT NULL)
    AND tstzrange(coalesce(${tasks.start_at}, ${tasks.due_at}), coalesce(${tasks.due_at}, ${tasks.start_at}), '[]')
        && tstzrange(${input.from}::timestamptz, ${input.to}::timestamptz, '[]')`;

  let pageWhere = overlap;
  if (input.cursor !== undefined) {
    const decoded = decodeCursor(input.cursor);
    if (decoded !== null) {
      // Keyset pagination: (updated_at, id) < (cursor.u, cursor.i) for DESC ordering.
      pageWhere = sql`${overlap}
        AND (${tasks.updated_at}, ${tasks.id}) < (${new Date(decoded.u)}, ${decoded.i}::uuid)`;
    }
  }

  // total_count always uses the un-cursored predicate so every page reports
  // the same range-wide count (AC-9).
  const [rows, countRows] = await Promise.all([
    db
      .select()
      .from(tasks)
      .where(pageWhere)
      .orderBy(sql`${tasks.updated_at} DESC, ${tasks.id} DESC`)
      .limit(limit),
    db.select({ count: sql<number>`COUNT(*)::int` }).from(tasks).where(overlap),
  ]);

  const total_count = countRows[0]?.count ?? 0;

  if (rows.length === 0) {
    return { tasks: [], total_count };
  }

  const typedRows = rows as TaskDbRow[];
  const {
    assigneesByTaskId,
    labelsByTaskId,
    summaryByTaskId,
    checklistPreviewByTaskId,
    referencePreviewByTaskId,
  } = await fetchSupplementaryData(
    db,
    typedRows.map((r) => r.id),
  );

  const result = typedRows.map((r) =>
    stitchRow(
      taskRowToDto(r),
      assigneesByTaskId,
      labelsByTaskId,
      summaryByTaskId,
      checklistPreviewByTaskId,
      referencePreviewByTaskId,
    ),
  );

  const lastRow = typedRows[typedRows.length - 1];
  const next_cursor =
    typedRows.length === limit && lastRow
      ? encodeCursor(lastRow.updated_at.toISOString(), lastRow.id)
      : undefined;

  return { tasks: result, next_cursor, total_count };
}
