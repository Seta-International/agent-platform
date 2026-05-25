import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import {
  emitPlannerChecklistItemAdded,
  emitPlannerLabelApplied,
  emitPlannerTaskAssigned,
  emitPlannerTaskCreated,
  emitPlannerTaskReferenceAdded,
} from '../../events/emit-helpers.ts';
import { plannerDb } from '../db/index.ts';
import {
  checklistItems,
  labels as labelsTable,
  plans,
  taskAssignments,
  taskLabels,
  taskReferences,
  tasks,
} from '../db/schema.ts';
import type {
  AssigneeRow,
  ChecklistItemRow,
  ChecklistPreviewItem,
  LabelRow,
  ReferencePreviewItem,
  TaskExternalSource,
  TaskPreviewType,
  TaskPriorityNumber,
  TaskReferenceRow,
  TaskReferenceType,
  TaskWithAssigneesRow,
} from '../dto.ts';
import type { DuplicateTaskInput, DuplicateTaskOptions } from '../inputs.ts';
import { PlannerError, requirePermission } from '../rbac.ts';
import { groupFilterFor } from '../read-helpers.ts';
import { isM365SystemActor } from './_actor.ts';
import { taskRowToDto } from './_task-dto.ts';
import { fetchAssigneesAndLabels } from './list-tasks.ts';
import { hintBetween, type PlanExternalSource } from './order-hint.ts';

const DEFAULTS: Required<DuplicateTaskOptions> = {
  include_description: true,
  include_checklist: true,
  include_assignees: false,
  include_labels: false,
  include_references: false,
  include_dates: false,
};

export async function duplicateTask(
  input: DuplicateTaskInput & { session: SessionScope },
): Promise<TaskWithAssigneesRow> {
  const opts: Required<DuplicateTaskOptions> = { ...DEFAULTS, ...(input.options ?? {}) };

  let newTaskId!: string;
  let insertedTask!: typeof tasks.$inferSelect;

  await withEmit(
    {
      actor: {
        userId: input.session.user_id,
        tenantId: input.session.tenant_id,
      },
    },
    async (tx) => {
      // Load source task under the same RBAC + tenant gates as getTask.
      const [source] = await tx
        .select()
        .from(tasks)
        .where(and(eq(tasks.id, input.task_id), isNull(tasks.deleted_at)))
        .limit(1);
      if (!source) {
        throw new PlannerError('NOT_FOUND', 'Task not found', { task_id: input.task_id });
      }
      if (source.tenant_id !== input.session.tenant_id) {
        throw new PlannerError('CROSS_TENANT', 'Task belongs to another tenant', {
          task_id: input.task_id,
        });
      }

      const [plan] = await tx.select().from(plans).where(eq(plans.id, source.plan_id)).limit(1);
      if (!plan) {
        throw new PlannerError('NOT_FOUND', 'Parent plan not found', { plan_id: source.plan_id });
      }

      // Read-side gate matches getTask (group access), and create-side gate
      // matches createTask (planner.task.create).
      requirePermission(input.session, 'planner.task.read', plan.group_id);
      const groupFilter = groupFilterFor(input.session);
      if (groupFilter !== null && !groupFilter.includes(plan.group_id)) {
        throw new PlannerError('FORBIDDEN', 'No access to group', {
          task_id: input.task_id,
          group_id: plan.group_id,
        });
      }
      requirePermission(input.session, 'planner.task.create', plan.group_id);

      // Append: pick a key after the last live task in this bucket scope. Matches
      // createTask's append rule so the copy lands at the tail of the same bucket.
      const bucketCondition =
        source.bucket_id !== null ? eq(tasks.bucket_id, source.bucket_id) : isNull(tasks.bucket_id);
      const existingTasks = await tx
        .select({ order_hint: tasks.order_hint })
        .from(tasks)
        .where(and(eq(tasks.plan_id, source.plan_id), bucketCondition, isNull(tasks.deleted_at)));
      const sortedHints = existingTasks
        .map((r) => r.order_hint)
        .filter((h): h is string => h !== null)
        .sort();
      const lastHint = sortedHints[sortedHints.length - 1] ?? null;
      const planSource = plan.external_source as PlanExternalSource;
      const orderHint = hintBetween(lastHint, null, planSource);

      const [row] = await tx
        .insert(tasks)
        .values({
          tenant_id: source.tenant_id,
          plan_id: source.plan_id,
          bucket_id: source.bucket_id,
          title: `Copy of ${source.title}`,
          description: opts.include_description ? source.description : null,
          priority_number: source.priority_number,
          percent_complete: 0,
          is_deferred: source.is_deferred,
          preview_type: source.preview_type,
          review_state: source.review_state,
          skill_tags: source.skill_tags,
          start_at: opts.include_dates ? source.start_at : null,
          due_at: opts.include_dates ? source.due_at : null,
          order_hint: orderHint,
          created_by: input.session.user_id,
        })
        .returning();
      if (!row) throw new PlannerError('VALIDATION', 'Insert returned no row');
      insertedTask = row;
      newTaskId = row.id;

      await emitPlannerTaskCreated({
        actor: { type: 'user', user_id: input.session.user_id },
        tenant_id: row.tenant_id,
        after: {
          task_id: row.id,
          plan_id: row.plan_id,
          group_id: plan.group_id,
          bucket_id: row.bucket_id,
          title: row.title,
          description: row.description,
          priority_number: row.priority_number as TaskPriorityNumber,
          percent_complete: row.percent_complete,
          is_deferred: row.is_deferred,
          preview_type: row.preview_type as TaskPreviewType,
          start_at: row.start_at ? row.start_at.toISOString() : null,
          due_at: row.due_at ? row.due_at.toISOString() : null,
          order_hint: row.order_hint,
          assignee_priority: row.assignee_priority,
          skill_tags: row.skill_tags,
          review_state: row.review_state,
          external_source: row.external_source as TaskExternalSource,
          external_id: row.external_id,
          created_by: row.created_by,
        },
      });

      if (opts.include_checklist) {
        const sourceItems = await tx
          .select()
          .from(checklistItems)
          .where(eq(checklistItems.task_id, source.id))
          .orderBy(sql`order_hint NULLS LAST`);

        // Re-hint from scratch to preserve order while keeping the keys monotone.
        let prevHint: string | null = null;
        for (const item of sourceItems) {
          const itemHint = hintBetween(prevHint, null, planSource);
          const [newItem] = await tx
            .insert(checklistItems)
            .values({
              task_id: newTaskId,
              label: item.label,
              checked: item.checked,
              order_hint: itemHint,
            })
            .returning();
          if (!newItem) throw new PlannerError('VALIDATION', 'Checklist insert returned no row');
          prevHint = itemHint;
          await emitPlannerChecklistItemAdded({
            actor: { type: 'user', user_id: input.session.user_id },
            tenant_id: row.tenant_id,
            group_id: plan.group_id,
            item_id: newItem.id,
            task_id: newTaskId,
            plan_id: row.plan_id,
            label: newItem.label,
            order_hint: newItem.order_hint,
          });
        }
      }

      if (opts.include_labels) {
        const sourceLabels = await tx
          .select({ label_id: taskLabels.label_id, category_slot: labelsTable.category_slot })
          .from(taskLabels)
          .innerJoin(labelsTable, eq(labelsTable.id, taskLabels.label_id))
          .where(and(eq(taskLabels.task_id, source.id), isNull(labelsTable.deleted_at)));

        const isLinkedM365 = plan.external_source === 'm365';
        const m365System = isM365SystemActor(input.session);

        for (const { label_id, category_slot } of sourceLabels) {
          // Mirrors applyLabel's m365 gate: on a linked plan, only slot-mapped
          // labels can be applied by non-system actors. Silently skip labels
          // we can't apply rather than failing the entire duplicate.
          if (isLinkedM365 && category_slot == null && !m365System) continue;

          const inserted = await tx
            .insert(taskLabels)
            .values({
              task_id: newTaskId,
              label_id,
              applied_by: input.session.user_id,
            })
            .onConflictDoNothing()
            .returning();
          if (inserted.length === 0) continue;

          await emitPlannerLabelApplied({
            actor: { type: 'user', user_id: input.session.user_id },
            tenant_id: row.tenant_id,
            group_id: plan.group_id,
            task_id: newTaskId,
            plan_id: row.plan_id,
            label_id,
          });
        }
      }

      if (opts.include_assignees) {
        const sourceAssignees = await tx
          .select()
          .from(taskAssignments)
          .where(eq(taskAssignments.task_id, source.id))
          .orderBy(sql`order_hint NULLS LAST`);

        for (const a of sourceAssignees) {
          const inserted = await tx
            .insert(taskAssignments)
            .values({
              task_id: newTaskId,
              user_id: a.user_id,
              order_hint: a.order_hint,
              assigned_by: input.session.user_id,
            })
            .onConflictDoNothing()
            .returning();
          if (inserted.length === 0) continue;

          await emitPlannerTaskAssigned({
            actor: { type: 'user', user_id: input.session.user_id },
            tenant_id: row.tenant_id,
            task_id: newTaskId,
            plan_id: row.plan_id,
            group_id: plan.group_id,
            user_id: a.user_id,
          });
        }
      }

      if (opts.include_references) {
        const sourceRefs = await tx
          .select()
          .from(taskReferences)
          .where(eq(taskReferences.task_id, source.id))
          .orderBy(asc(taskReferences.created_at));

        for (const r of sourceRefs) {
          const [newRef] = await tx
            .insert(taskReferences)
            .values({
              tenant_id: row.tenant_id,
              task_id: newTaskId,
              url: r.url,
              alias: r.alias,
              type: r.type,
              preview_priority: r.preview_priority,
            })
            .onConflictDoNothing()
            .returning();
          if (!newRef) continue;

          await emitPlannerTaskReferenceAdded({
            actor: { type: 'user', user_id: input.session.user_id },
            tenant_id: row.tenant_id,
            task_id: newTaskId,
            plan_id: row.plan_id,
            url: newRef.url,
            alias: newRef.alias,
            type: newRef.type as TaskReferenceType,
          });
        }
      }
    },
  );

  return stitchTaskWithAssignees(insertedTask);
}

async function stitchTaskWithAssignees(
  row: typeof tasks.$inferSelect,
): Promise<TaskWithAssigneesRow> {
  // Re-read assignees / labels / checklist / references through the same helpers
  // the read paths use so the return shape matches getTask/listTasks (modulo
  // the heavier `checklist` and `references` arrays exposed only by detail).
  const db = plannerDb();
  const [{ assigneesByTaskId, labelsByTaskId }, checklistRows, referenceRows] = await Promise.all([
    fetchAssigneesAndLabels(db, [row.id]),
    db
      .select()
      .from(checklistItems)
      .where(eq(checklistItems.task_id, row.id))
      .orderBy(sql`order_hint NULLS LAST`),
    db
      .select()
      .from(taskReferences)
      .where(eq(taskReferences.task_id, row.id))
      .orderBy(sql`preview_priority NULLS LAST`, asc(taskReferences.created_at)),
  ]);

  const checklist: ChecklistItemRow[] = checklistRows.map((c) => ({
    id: c.id,
    task_id: c.task_id,
    label: c.label,
    checked: c.checked,
    order_hint: c.order_hint,
    external_id: c.external_id,
    external_etag: c.external_etag,
    created_at: c.created_at.toISOString(),
    updated_at: c.updated_at.toISOString(),
  }));

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

  const checklist_preview: ChecklistPreviewItem[] = checklist
    .slice(0, 3)
    .map((c) => ({ id: c.id, label: c.label, checked: c.checked }));
  const reference_preview: ReferencePreviewItem[] = references.slice(0, 1).map((r) => ({
    id: r.id,
    url: r.url,
    alias: r.alias,
    type: r.type,
    host: safeHost(r.url),
  }));

  const assignees: AssigneeRow[] = assigneesByTaskId.get(row.id) ?? [];
  const labels: LabelRow[] = labelsByTaskId.get(row.id) ?? [];

  return {
    ...taskRowToDto(row),
    assignees,
    labels,
    checklist_summary: {
      total: checklist.length,
      checked: checklist.filter((c) => c.checked).length,
    },
    checklist_preview,
    reference_preview,
  };
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}
