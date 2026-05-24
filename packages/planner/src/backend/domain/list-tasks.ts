import type { SessionScope } from '@seta/core';
import { and, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm';
import { plannerDb } from '../db/index.ts';
import {
  assigneeProjection,
  checklistItems,
  labels,
  plans,
  taskAssignments,
  taskLabels,
  tasks,
} from '../db/schema.ts';
import type {
  AssigneeRow,
  ChecklistPreviewItem,
  LabelRow,
  ReferencePreviewItem,
  TaskReferenceType,
  TaskWithAssigneesRow,
} from '../dto.ts';
import { requirePermission } from '../rbac.ts';
import { groupFilterFor } from '../read-helpers.ts';
import { taskRowToDto } from './_task-dto.ts';

export interface ListTasksFilters {
  plan_id?: string;
  group_id?: string;
  bucket_id?: string;
  assignee_id?: string;
  review_state?: 'needs_review';
  skill_tags?: string[];
  is_deferred?: boolean;
  percent_complete_lt?: number;
  percent_complete_gte?: number;
  due_before?: string;
  include_deleted?: boolean;
}

function encodeCursor(updatedAt: string, id: string): string {
  return Buffer.from(JSON.stringify({ u: updatedAt, i: id })).toString('base64');
}

function decodeCursor(c: string): { u: string; i: string } | null {
  try {
    return JSON.parse(Buffer.from(c, 'base64').toString('utf-8')) as { u: string; i: string };
  } catch {
    return null;
  }
}

export async function fetchAssigneesAndLabels(
  db: ReturnType<typeof plannerDb>,
  taskIds: string[],
): Promise<{
  assigneesByTaskId: Map<string, AssigneeRow[]>;
  labelsByTaskId: Map<string, LabelRow[]>;
}> {
  const [assigneeRows, labelRows] = await Promise.all([
    db
      .select({
        task_id: taskAssignments.task_id,
        user_id: taskAssignments.user_id,
        display_name: assigneeProjection.display_name,
        email: assigneeProjection.email,
        availability_status: assigneeProjection.availability_status,
        ooo_until: assigneeProjection.ooo_until,
        deactivated_at: assigneeProjection.deactivated_at,
      })
      .from(taskAssignments)
      .innerJoin(assigneeProjection, eq(assigneeProjection.user_id, taskAssignments.user_id))
      .where(inArray(taskAssignments.task_id, taskIds)),

    db
      .select({
        task_id: taskLabels.task_id,
        id: labels.id,
        tenant_id: labels.tenant_id,
        plan_id: labels.plan_id,
        name: labels.name,
        color: labels.color,
        category_slot: labels.category_slot,
        created_at: labels.created_at,
        deleted_at: labels.deleted_at,
      })
      .from(taskLabels)
      .innerJoin(labels, eq(labels.id, taskLabels.label_id))
      .where(and(inArray(taskLabels.task_id, taskIds), isNull(labels.deleted_at))),
  ]);

  const assigneesByTaskId = new Map<string, AssigneeRow[]>();
  for (const r of assigneeRows) {
    const list = assigneesByTaskId.get(r.task_id) ?? [];
    list.push({
      user_id: r.user_id,
      display_name: r.display_name,
      email: r.email,
      availability_status: r.availability_status,
      ooo_until: r.ooo_until ? r.ooo_until.toISOString() : null,
      deactivated_at: r.deactivated_at ? r.deactivated_at.toISOString() : null,
    });
    assigneesByTaskId.set(r.task_id, list);
  }

  const labelsByTaskId = new Map<string, LabelRow[]>();
  for (const r of labelRows) {
    const list = labelsByTaskId.get(r.task_id) ?? [];
    list.push({
      id: r.id,
      tenant_id: r.tenant_id,
      plan_id: r.plan_id,
      name: r.name,
      color: r.color,
      category_slot: r.category_slot,
      created_at: r.created_at.toISOString(),
      deleted_at: r.deleted_at ? r.deleted_at.toISOString() : null,
    });
    labelsByTaskId.set(r.task_id, list);
  }

  return { assigneesByTaskId, labelsByTaskId };
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

export async function fetchSupplementaryData(
  db: ReturnType<typeof plannerDb>,
  taskIds: string[],
): Promise<{
  assigneesByTaskId: Map<string, AssigneeRow[]>;
  labelsByTaskId: Map<string, LabelRow[]>;
  summaryByTaskId: Map<string, { total: number; checked: number }>;
  checklistPreviewByTaskId: Map<string, ChecklistPreviewItem[]>;
  referencePreviewByTaskId: Map<string, ReferencePreviewItem[]>;
}> {
  // Window-function subqueries keep the previews to a single round-trip each
  // (mirrors the fan-out shape used by summaryByTaskId): ROW_NUMBER per task,
  // then filter to the leading N rows. Drizzle has no first-class window-
  // function builder, so we drop to raw SQL — schema-qualified to satisfy the
  // raw-sql lint (planner module's own tables). Inline the id list as an
  // ARRAY[...] literal because pg-driver serialises JS-array bind params as
  // comma-separated scalars, which Postgres rejects when cast to uuid[].
  const taskIdsArray = sql.raw(
    `ARRAY[${taskIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(',')}]::uuid[]`,
  );
  const [
    { assigneesByTaskId, labelsByTaskId },
    checklistRows,
    checklistPreviewResult,
    referencePreviewResult,
  ] = await Promise.all([
    fetchAssigneesAndLabels(db, taskIds),
    db
      .select({
        task_id: checklistItems.task_id,
        total: sql<number>`COUNT(*)::int`,
        checked: sql<number>`COUNT(*) FILTER (WHERE ${checklistItems.checked})::int`,
      })
      .from(checklistItems)
      .where(inArray(checklistItems.task_id, taskIds))
      .groupBy(checklistItems.task_id),
    db.execute(sql`
      SELECT task_id, id, label, checked
      FROM (
        SELECT
          task_id,
          id,
          label,
          checked,
          ROW_NUMBER() OVER (
            PARTITION BY task_id
            ORDER BY order_hint NULLS LAST, id
          ) AS rn
        FROM planner.checklist_items
        WHERE task_id = ANY(${taskIdsArray})
      ) ranked
      WHERE rn <= 3
      ORDER BY task_id, rn
    `),
    db.execute(sql`
      SELECT task_id, id, url, alias, type
      FROM (
        SELECT
          task_id,
          id,
          url,
          alias,
          type,
          ROW_NUMBER() OVER (
            PARTITION BY task_id
            ORDER BY preview_priority NULLS LAST, id
          ) AS rn
        FROM planner.task_references
        WHERE task_id = ANY(${taskIdsArray})
      ) ranked
      WHERE rn <= 1
    `),
  ]);

  const summaryByTaskId = new Map<string, { total: number; checked: number }>();
  for (const r of checklistRows) {
    summaryByTaskId.set(r.task_id, { total: r.total, checked: r.checked });
  }

  const checklistPreviewByTaskId = new Map<string, ChecklistPreviewItem[]>();
  for (const r of checklistPreviewResult.rows as Record<string, unknown>[]) {
    const taskId = r.task_id as string;
    const list = checklistPreviewByTaskId.get(taskId) ?? [];
    list.push({
      id: r.id as string,
      label: r.label as string,
      checked: r.checked as boolean,
    });
    checklistPreviewByTaskId.set(taskId, list);
  }

  const referencePreviewByTaskId = new Map<string, ReferencePreviewItem[]>();
  for (const r of referencePreviewResult.rows as Record<string, unknown>[]) {
    const taskId = r.task_id as string;
    const url = r.url as string;
    const list = referencePreviewByTaskId.get(taskId) ?? [];
    list.push({
      id: r.id as string,
      url,
      alias: (r.alias as string | null) ?? null,
      type: r.type as TaskReferenceType,
      host: safeHost(url),
    });
    referencePreviewByTaskId.set(taskId, list);
  }

  return {
    assigneesByTaskId,
    labelsByTaskId,
    summaryByTaskId,
    checklistPreviewByTaskId,
    referencePreviewByTaskId,
  };
}

function stitchRow(
  base: Omit<
    TaskWithAssigneesRow,
    'assignees' | 'labels' | 'checklist_summary' | 'checklist_preview' | 'reference_preview'
  >,
  assigneesByTaskId: Map<string, AssigneeRow[]>,
  labelsByTaskId: Map<string, LabelRow[]>,
  summaryByTaskId: Map<string, { total: number; checked: number }>,
  checklistPreviewByTaskId: Map<string, ChecklistPreviewItem[]>,
  referencePreviewByTaskId: Map<string, ReferencePreviewItem[]>,
): TaskWithAssigneesRow {
  return {
    ...base,
    assignees: assigneesByTaskId.get(base.id) ?? [],
    labels: labelsByTaskId.get(base.id) ?? [],
    checklist_summary: summaryByTaskId.get(base.id) ?? { total: 0, checked: 0 },
    checklist_preview: checklistPreviewByTaskId.get(base.id) ?? [],
    reference_preview: referencePreviewByTaskId.get(base.id) ?? [],
  };
}

export async function listTasks(input: {
  filters?: ListTasksFilters;
  limit?: number;
  cursor?: string;
  session: SessionScope;
}): Promise<{ tasks: TaskWithAssigneesRow[]; next_cursor?: string }> {
  requirePermission(input.session, 'planner.task.read');

  const db = plannerDb();
  const groupFilter = groupFilterFor(input.session);
  const filters = input.filters ?? {};
  const limit = Math.min(input.limit ?? 50, 200);

  // When group filter applies and is empty, short-circuit.
  if (groupFilter !== null && groupFilter.length === 0) {
    return { tasks: [] };
  }

  const conditions = [eq(tasks.tenant_id, input.session.tenant_id)];

  if (!filters.include_deleted) {
    conditions.push(isNull(tasks.deleted_at));
  }

  // When groupFilter is present, restrict to tasks in plans belonging to accessible groups.
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

  if (filters.plan_id !== undefined) {
    conditions.push(eq(tasks.plan_id, filters.plan_id));
  }

  if (filters.group_id !== undefined) {
    conditions.push(
      inArray(
        tasks.plan_id,
        db.select({ id: plans.id }).from(plans).where(eq(plans.group_id, filters.group_id)),
      ),
    );
  }

  if (filters.bucket_id !== undefined) {
    conditions.push(eq(tasks.bucket_id, filters.bucket_id));
  }

  if (filters.assignee_id !== undefined) {
    conditions.push(
      inArray(
        tasks.id,
        db
          .select({ task_id: taskAssignments.task_id })
          .from(taskAssignments)
          .where(eq(taskAssignments.user_id, filters.assignee_id)),
      ),
    );
  }

  if (filters.review_state !== undefined) {
    conditions.push(eq(tasks.review_state, filters.review_state));
  }

  if (filters.is_deferred !== undefined) {
    conditions.push(eq(tasks.is_deferred, filters.is_deferred));
  }

  if (filters.percent_complete_lt !== undefined) {
    conditions.push(lt(tasks.percent_complete, filters.percent_complete_lt));
  }

  if (filters.percent_complete_gte !== undefined) {
    conditions.push(gte(tasks.percent_complete, filters.percent_complete_gte));
  }

  if (filters.skill_tags !== undefined && filters.skill_tags.length > 0) {
    // GIN overlap operator &&. Build ARRAY[...] literal inline so postgres receives an
    // explicit text[] value rather than a scalar parameter that triggers "malformed array".
    const arrayLiteral = sql.raw(
      `ARRAY[${filters.skill_tags.map((t) => `'${t.replace(/'/g, "''")}'`).join(',')}]::text[]`,
    );
    conditions.push(sql`${tasks.skill_tags} && ${arrayLiteral}`);
  }

  if (filters.due_before !== undefined) {
    conditions.push(lt(tasks.due_at, new Date(filters.due_before)));
  }

  if (input.cursor !== undefined) {
    const decoded = decodeCursor(input.cursor);
    if (decoded !== null) {
      // Keyset pagination: (updated_at, id) < (cursor.u, cursor.i) for DESC ordering.
      conditions.push(
        sql`(${tasks.updated_at}, ${tasks.id}) < (${new Date(decoded.u)}, ${decoded.i}::uuid)`,
      );
    }
  }

  const rows = await db
    .select()
    .from(tasks)
    .where(and(...conditions))
    .orderBy(sql`${tasks.updated_at} DESC, ${tasks.id} DESC`)
    .limit(limit);

  if (rows.length === 0) {
    return { tasks: [] };
  }

  const taskIds = rows.map((r) => r.id);
  const {
    assigneesByTaskId,
    labelsByTaskId,
    summaryByTaskId,
    checklistPreviewByTaskId,
    referencePreviewByTaskId,
  } = await fetchSupplementaryData(db, taskIds);

  const result = rows.map((r) =>
    stitchRow(
      taskRowToDto(r),
      assigneesByTaskId,
      labelsByTaskId,
      summaryByTaskId,
      checklistPreviewByTaskId,
      referencePreviewByTaskId,
    ),
  );

  const lastRow = rows[rows.length - 1];
  const next_cursor =
    rows.length === limit && lastRow
      ? encodeCursor(lastRow.updated_at.toISOString(), lastRow.id)
      : undefined;

  return { tasks: result, next_cursor };
}
