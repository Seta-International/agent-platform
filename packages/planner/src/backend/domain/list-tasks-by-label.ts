import type { SessionScope } from '@seta/core';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { plannerDb } from '../db/index.ts';
import { labels as labelsTable, plans, taskAssignments, taskLabels, tasks } from '../db/schema.ts';
import { requirePermission } from '../rbac.ts';
import { groupFilterFor } from '../read-helpers.ts';

export interface ListTasksByLabelInput {
  /** Label names to match (OR / overlap), case-insensitive. Must be non-empty. */
  names: string[];
  /** "open" = incomplete (percent_complete < 100); "completed" = done; "any" = all. Default "any". */
  completionStatus?: 'open' | 'completed' | 'any';
  /** Max rows to return. Caller is responsible for clamping. */
  limit: number;
  session: SessionScope;
}

export interface ListTasksByLabelRow {
  taskId: string;
  groupId: string;
  title: string;
  status: 'not_started' | 'in_progress' | 'completed';
  percentComplete: number;
  assigneeUserIds: string[];
  labels: string[];
  createdAt: string;
}

function statusOf(pc: number): 'not_started' | 'in_progress' | 'completed' {
  return pc >= 100 ? 'completed' : pc > 0 ? 'in_progress' : 'not_started';
}

export async function listTasksByLabel(
  input: ListTasksByLabelInput,
): Promise<{ results: ListTasksByLabelRow[] }> {
  requirePermission(input.session, 'planner.task.read');

  if (input.names.length === 0) return { results: [] };

  const db = plannerDb();
  const groupFilter = groupFilterFor(input.session);
  // Non-admin with no accessible groups sees nothing.
  if (groupFilter !== null && groupFilter.length === 0) return { results: [] };

  const conditions = [eq(tasks.tenant_id, input.session.tenant_id), isNull(tasks.deleted_at)];

  const cs = input.completionStatus ?? 'any';
  if (cs === 'open') conditions.push(sql`${tasks.percent_complete} < 100`);
  if (cs === 'completed') conditions.push(sql`${tasks.percent_complete} = 100`);

  if (groupFilter !== null) {
    conditions.push(
      inArray(
        tasks.plan_id,
        db
          .select({ id: plans.id })
          .from(plans)
          .where(inArray(plans.group_id, [...groupFilter])),
      ),
    );
  }

  // Case-insensitive overlap: build the ARRAY[...] literal inline (escape ') so postgres
  // receives an explicit text[] value. The count subquery joins task_labels → labels
  // (same module schema, so lint:raw-sql passes).
  const loweredNames = sql.raw(
    `ARRAY[${input.names.map((t) => `'${t.toLowerCase().replace(/'/g, "''")}'`).join(',')}]::text[]`,
  );
  // Relevance = how many of the requested label names the task carries. Used both to
  // filter (>0) and to rank, so truncating to `limit` keeps the best matches.
  const matchCount = sql<number>`(
    SELECT count(DISTINCT lower(l.name))
      FROM planner.task_labels tl
      JOIN planner.labels l ON l.id = tl.label_id
     WHERE tl.task_id = ${tasks.id}
       AND l.deleted_at IS NULL
       AND lower(l.name) = ANY(${loweredNames})
  )`;
  conditions.push(sql`${matchCount} > 0`);

  const labelNamesAgg = sql<string[]>`COALESCE(
    ARRAY_AGG(DISTINCT ${labelsTable.name}) FILTER (WHERE ${labelsTable.id} IS NOT NULL AND ${labelsTable.deleted_at} IS NULL),
    ARRAY[]::text[]
  )`;

  const rows = await db
    .select({
      id: tasks.id,
      group_id: plans.group_id,
      title: tasks.title,
      percent_complete: tasks.percent_complete,
      created_at: tasks.created_at,
      labels: labelNamesAgg,
      assignee_ids: sql<
        string[]
      >`COALESCE(ARRAY_AGG(DISTINCT ${taskAssignments.user_id}) FILTER (WHERE ${taskAssignments.user_id} IS NOT NULL), ARRAY[]::uuid[])`,
    })
    .from(tasks)
    .innerJoin(plans, eq(plans.id, tasks.plan_id))
    .leftJoin(taskAssignments, eq(taskAssignments.task_id, tasks.id))
    .leftJoin(taskLabels, eq(taskLabels.task_id, tasks.id))
    .leftJoin(labelsTable, eq(labelsTable.id, taskLabels.label_id))
    .where(and(...conditions))
    .groupBy(
      tasks.id,
      plans.group_id,
      tasks.title,
      tasks.percent_complete,
      tasks.created_at,
      tasks.updated_at,
    )
    .orderBy(sql`${matchCount} DESC, ${tasks.updated_at} DESC, ${tasks.id} DESC`)
    .limit(input.limit);

  return {
    results: rows.map((r) => ({
      taskId: r.id,
      groupId: r.group_id,
      title: r.title,
      status: statusOf(r.percent_complete ?? 0),
      percentComplete: r.percent_complete ?? 0,
      assigneeUserIds: (r.assignee_ids ?? []).map(String),
      labels: r.labels ?? [],
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    })),
  };
}
