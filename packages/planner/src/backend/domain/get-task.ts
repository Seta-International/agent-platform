import type { SessionScope } from '@seta/core';
import { can } from '@seta/shared-rbac';
import { and, asc, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm';
import { plannerDb } from '../db/index.ts';
import { checklistItems, plans, taskReferences, tasks } from '../db/schema.ts';
import type {
  ChecklistItemRow,
  TaskDetailRow,
  TaskLinkKind,
  TaskLinkRow,
  TaskReferenceRow,
  TaskReferenceType,
} from '../dto.ts';
import { isTenantWide, PlannerError, requirePermission } from '../rbac.ts';
import { groupFilterFor, listMemberGroupIds } from '../read-helpers.ts';
import { taskRowToDto } from './_task-dto.ts';
import { TASK_LINK_KIND_LIST, taskLinkUrl } from './_task-link-row.ts';
import { fetchAssigneesAndLabels } from './list-tasks.ts';

export async function getTask(input: {
  task_id: string;
  session: SessionScope;
}): Promise<TaskDetailRow> {
  await requirePermission(input.session, 'planner.task.read');

  const db = plannerDb();

  const [row] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, input.task_id), isNull(tasks.deleted_at)))
    .limit(1);

  if (!row) {
    throw new PlannerError('NOT_FOUND', 'Task not found', { task_id: input.task_id });
  }

  if (row.tenant_id !== input.session.tenant_id) {
    throw new PlannerError('CROSS_TENANT', 'Task belongs to another tenant', {
      task_id: input.task_id,
    });
  }

  const [plan] = await db.select().from(plans).where(eq(plans.id, row.plan_id)).limit(1);
  if (!plan) {
    throw new PlannerError('NOT_FOUND', 'Parent plan not found', { plan_id: row.plan_id });
  }

  await requirePermission(input.session, 'planner.task.read', plan.group_id);

  const groupFilter = await groupFilterFor(input.session);
  if (groupFilter !== null && !groupFilter.includes(plan.group_id)) {
    throw new PlannerError('FORBIDDEN', 'No access to group', {
      task_id: input.task_id,
      group_id: plan.group_id,
    });
  }

  const [{ assigneesByTaskId, labelsByTaskId }, checklistRows, referenceRows, outgoing, incoming] =
    await Promise.all([
      fetchAssigneesAndLabels(db, [row.id]),
      db
        .select()
        .from(checklistItems)
        .where(eq(checklistItems.task_id, row.id))
        .orderBy(sql`order_hint NULLS LAST`),
      db
        .select()
        .from(taskReferences)
        .where(
          and(
            eq(taskReferences.task_id, row.id),
            // A link row's url is /planner/tasks/<uuid>; rendering it beside real
            // bookmarks in the URL group is the regression test 17 exists to
            // prevent (design §3.3).
            notInArray(taskReferences.type, TASK_LINK_KIND_LIST),
          ),
        )
        .orderBy(sql`preview_priority NULLS LAST`, asc(taskReferences.created_at)),
      // OUTGOING: this task is the link's source. Reads task_references_by_task;
      // the ::uuid cast is total because of the
      // task_references_link_url_canonical CHECK, so there is no malformed-data
      // branch to write.
      db
        .select({
          id: taskReferences.id,
          type: taskReferences.type,
          created_at: taskReferences.created_at,
          other_id: tasks.id,
          other_title: tasks.title,
          other_plan_id: tasks.plan_id,
          other_deleted_at: tasks.deleted_at,
          other_group_id: plans.group_id,
        })
        .from(taskReferences)
        .innerJoin(
          tasks,
          sql`${tasks.id} = substring(${taskReferences.url} from '^/planner/tasks/(.+)$')::uuid`,
        )
        .innerJoin(plans, eq(plans.id, tasks.plan_id))
        .where(
          and(
            eq(taskReferences.tenant_id, row.tenant_id),
            eq(taskReferences.task_id, row.id),
            inArray(taskReferences.type, TASK_LINK_KIND_LIST),
          ),
        ),
      // INCOMING: url = '/planner/tasks/<me>'. Reads the new partial
      // (tenant_id, url) index — without it this seq-scans the tenant's whole
      // bookmark list on every detail page.
      db
        .select({
          id: taskReferences.id,
          type: taskReferences.type,
          created_at: taskReferences.created_at,
          other_id: tasks.id,
          other_title: tasks.title,
          other_plan_id: tasks.plan_id,
          other_deleted_at: tasks.deleted_at,
          other_group_id: plans.group_id,
        })
        .from(taskReferences)
        .innerJoin(tasks, eq(tasks.id, taskReferences.task_id))
        .innerJoin(plans, eq(plans.id, tasks.plan_id))
        .where(
          and(
            eq(taskReferences.tenant_id, row.tenant_id),
            eq(taskReferences.url, taskLinkUrl(row.id)),
            inArray(taskReferences.type, TASK_LINK_KIND_LIST),
          ),
        ),
    ]);

  const checklist: ChecklistItemRow[] = checklistRows.map((r) => ({
    id: r.id,
    task_id: r.task_id,
    label: r.label,
    checked: r.checked,
    order_hint: r.order_hint,
    external_id: r.external_id,
    external_etag: r.external_etag,
    created_at: r.created_at.toISOString(),
    updated_at: r.updated_at.toISOString(),
  }));

  const checklist_summary = {
    total: checklist.length,
    checked: checklist.filter((c) => c.checked).length,
  };

  const references: TaskReferenceRow[] = referenceRows.map((r) => ({
    id: r.id,
    tenant_id: r.tenant_id,
    task_id: r.task_id,
    url: r.url,
    alias: r.alias,
    type: r.type as TaskReferenceType,
    preview_priority: r.preview_priority,
    external_etag: r.external_etag,
    created_at: r.created_at.toISOString(),
    updated_at: r.updated_at.toISOString(),
  }));

  // `can_unlink` predicts `requirePermission(session, 'planner.task.update',
  // otherGroup)`, which is `can(...)` AND (isTenantWide OR isGroupMember).
  // The obvious implementation — calling requirePermission per link — puts a DB
  // read per row on a detail-page read, so compute it from data already in hand.
  //
  // `groupFilter` IS `listMemberGroupIds(...)` unless the session is
  // tenant-adminish or `cross_tenant_read`, where it is null. Do NOT reuse
  // `groupFilter === null` as "tenant-wide": that is the READ-side predicate,
  // while the write gate uses isTenantWide. A cross_tenant_read persona would
  // otherwise get an enabled Remove button and a 403.
  const tenantWide = isTenantWide(input.session);
  const memberGroupIds =
    groupFilter ??
    (tenantWide ? [] : await listMemberGroupIds(input.session.user_id, input.session.tenant_id));
  const canUpdateTasks = can(input.session, 'planner.task.update');

  type LinkQueryRow = (typeof outgoing)[number];

  const visible = (r: LinkQueryRow): boolean =>
    groupFilter === null || groupFilter.includes(r.other_group_id);

  const toLinkRow = (r: LinkQueryRow, direction: 'outgoing' | 'incoming'): TaskLinkRow => ({
    id: r.id,
    kind: r.type as TaskLinkKind,
    direction,
    other_task_id: r.other_id,
    other_task_title: r.other_title,
    other_task_plan_id: r.other_plan_id,
    // A trashed endpoint is LISTED, not filtered — otherwise the keep task shows
    // nothing the moment a merge lands, i.e. the feature would be invisible.
    other_task_deleted_at: r.other_deleted_at?.toISOString() ?? null,
    can_unlink: canUpdateTasks && (tenantWide || memberGroupIds.includes(r.other_group_id)),
    created_at: r.created_at.toISOString(),
  });

  const links: TaskLinkRow[] = [
    ...outgoing.filter(visible).map((r) => toLinkRow(r, 'outgoing')),
    ...incoming.filter(visible).map((r) => toLinkRow(r, 'incoming')),
  ].sort((a, b) => compareString(a.created_at, b.created_at) || compareString(a.id, b.id));

  // Detail rows widen the list DTO; derive the previews from the already-
  // ordered full arrays so callers don't need a second fetch and the kanban
  // card shape stays consistent across list/detail. Ordering rule matches
  // list-tasks: hint NULLS LAST, then id as tiebreaker.
  const checklist_preview = [...checklist]
    .sort((a, b) => compareNullableHint(a.order_hint, b.order_hint) || compareString(a.id, b.id))
    .slice(0, 3)
    .map((c) => ({ id: c.id, label: c.label, checked: c.checked }));
  const reference_preview = [...references]
    .sort(
      (a, b) =>
        compareNullableHint(a.preview_priority, b.preview_priority) || compareString(a.id, b.id),
    )
    .slice(0, 1)
    .map((r) => ({
      id: r.id,
      url: r.url,
      alias: r.alias,
      type: r.type,
      host: safeHost(r.url),
    }));

  return {
    ...taskRowToDto(row),
    assignees: assigneesByTaskId.get(row.id) ?? [],
    labels: labelsByTaskId.get(row.id) ?? [],
    checklist_summary,
    checklist_preview,
    reference_preview,
    checklist,
    references,
    links,
  };
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function compareNullableHint(a: string | null, b: string | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return compareString(a, b);
}

function compareString(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
