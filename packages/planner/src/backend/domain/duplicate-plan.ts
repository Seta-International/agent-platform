import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { and, asc, eq, isNull, notInArray, sql } from 'drizzle-orm';
import {
  emitPlannerBucketCreated,
  emitPlannerChecklistItemAdded,
  emitPlannerLabelApplied,
  emitPlannerLabelCreated,
  emitPlannerPlanCreated,
  emitPlannerTaskAssigned,
  emitPlannerTaskCreated,
  emitPlannerTaskReferenceAdded,
} from '../../events/emit-helpers.ts';
import { plannerDb } from '../db/index.ts';
import {
  buckets,
  checklistItems,
  labels,
  planCategories,
  plans,
  taskAssignments,
  taskLabels,
  taskReferences,
  tasks,
} from '../db/schema.ts';
import { priorityToNumber, progressToPercent } from '../db/task-enums.ts';
import type { PlanRow, TaskPreviewType, TaskReferenceType } from '../dto.ts';
import { PlannerError, requirePermission } from '../rbac.ts';
import { fetchCategoryDescriptions, planRowToDto } from './_plan-dto.ts';
import { TASK_LINK_KIND_LIST } from './_task-link-row.ts';

type PlanDbRow = typeof plans.$inferSelect;
type TaskDbRow = typeof tasks.$inferSelect;

export async function duplicatePlan(input: {
  plan_id: string;
  session: SessionScope;
}): Promise<PlanRow> {
  let inserted!: PlanDbRow;

  await withEmit(
    {
      actor: {
        userId: input.session.user_id,
        tenantId: input.session.tenant_id,
      },
    },
    async (tx) => {
      const [source] = await tx
        .select()
        .from(plans)
        .where(and(eq(plans.id, input.plan_id), isNull(plans.deleted_at)))
        .limit(1);
      if (!source)
        throw new PlannerError('NOT_FOUND', 'Plan not found', { plan_id: input.plan_id });
      if (source.tenant_id !== input.session.tenant_id) {
        throw new PlannerError('CROSS_TENANT', 'Plan belongs to another tenant', {
          plan_id: input.plan_id,
        });
      }

      await requirePermission(input.session, 'planner.plan.create', source.group_id);

      const newName = `${source.name} (copy)`;
      const actor = { type: 'user' as const, user_id: input.session.user_id };

      const [row] = await tx
        .insert(plans)
        .values({
          tenant_id: source.tenant_id,
          group_id: source.group_id,
          name: newName,
          created_by: input.session.user_id,
        })
        .returning();
      if (!row) throw new PlannerError('VALIDATION', 'Insert returned no row');
      inserted = row;

      const sourceCategories = await tx
        .select({ slot: planCategories.slot, name: planCategories.name })
        .from(planCategories)
        .where(eq(planCategories.plan_id, source.id));
      if (sourceCategories.length > 0) {
        await tx.insert(planCategories).values(
          sourceCategories.map((c) => ({
            tenant_id: source.tenant_id,
            plan_id: row.id,
            slot: c.slot,
            name: c.name,
          })),
        );
      }

      await emitPlannerPlanCreated({
        actor,
        tenant_id: source.tenant_id,
        after: {
          plan_id: row.id,
          group_id: row.group_id,
          name: row.name,
          created_by: row.created_by,
        },
      });

      const bucketIdMap = new Map<string, string>();
      const sourceBuckets = await tx
        .select()
        .from(buckets)
        .where(and(eq(buckets.plan_id, source.id), isNull(buckets.deleted_at)));

      for (const b of sourceBuckets) {
        const [newBucket] = await tx
          .insert(buckets)
          .values({
            tenant_id: source.tenant_id,
            plan_id: row.id,
            name: b.name,
            order_hint: b.order_hint,
            created_by: input.session.user_id,
          })
          .returning();
        if (!newBucket) continue;

        bucketIdMap.set(b.id, newBucket.id);

        await emitPlannerBucketCreated({
          actor,
          tenant_id: source.tenant_id,
          after: {
            bucket_id: newBucket.id,
            plan_id: row.id,
            group_id: source.group_id,
            name: newBucket.name,
            order_hint: newBucket.order_hint,
          },
        });
      }

      const labelIdMap = new Map<string, string>();
      const sourceLabels = await tx
        .select()
        .from(labels)
        .where(and(eq(labels.plan_id, source.id), isNull(labels.deleted_at)));

      for (const label of sourceLabels) {
        const [newLabel] = await tx
          .insert(labels)
          .values({
            tenant_id: source.tenant_id,
            plan_id: row.id,
            name: label.name,
            color: label.color,
            category_slot: label.category_slot,
          })
          .returning();
        if (!newLabel) continue;

        labelIdMap.set(label.id, newLabel.id);

        await emitPlannerLabelCreated({
          actor,
          tenant_id: source.tenant_id,
          after: {
            label_id: newLabel.id,
            plan_id: row.id,
            group_id: source.group_id,
            name: newLabel.name,
            color: newLabel.color,
          },
        });
      }

      const sourceTasks = await tx
        .select()
        .from(tasks)
        .where(and(eq(tasks.plan_id, source.id), isNull(tasks.deleted_at)))
        .orderBy(sql`order_hint NULLS LAST`);

      for (const sourceTask of sourceTasks) {
        const newBucketId =
          sourceTask.bucket_id === null ? null : (bucketIdMap.get(sourceTask.bucket_id) ?? null);
        if (sourceTask.bucket_id !== null && newBucketId === null) continue;

        await copyTask({
          tx,
          actor,
          sourceTask,
          newPlanId: row.id,
          groupId: source.group_id,
          newBucketId,
          labelIdMap,
          createdBy: input.session.user_id,
        });
      }
    },
  );

  const categoryDescriptions = await fetchCategoryDescriptions(plannerDb(), inserted.id);
  return planRowToDto(inserted, categoryDescriptions);
}

async function copyTask(args: {
  // biome-ignore lint/suspicious/noExplicitAny: tx is the inner Drizzle transaction handle
  tx: any;
  actor: { type: 'user'; user_id: string };
  sourceTask: TaskDbRow;
  newPlanId: string;
  groupId: string;
  newBucketId: string | null;
  labelIdMap: Map<string, string>;
  createdBy: string;
}): Promise<void> {
  const { tx, actor, sourceTask, newPlanId, groupId, newBucketId, labelIdMap, createdBy } = args;

  const [row] = await tx
    .insert(tasks)
    .values({
      tenant_id: sourceTask.tenant_id,
      plan_id: newPlanId,
      bucket_id: newBucketId,
      title: sourceTask.title,
      description: sourceTask.description,
      description_text: sourceTask.description_text,
      priority: sourceTask.priority,
      progress: sourceTask.progress,
      is_deferred: sourceTask.is_deferred,
      preview_type: sourceTask.preview_type,
      review_state: sourceTask.review_state,
      start_at: sourceTask.start_at,
      due_at: sourceTask.due_at,
      order_hint: sourceTask.order_hint,
      assignee_priority: sourceTask.assignee_priority,
      created_by: createdBy,
    })
    .returning();
  if (!row) throw new PlannerError('VALIDATION', 'Task insert returned no row');

  const newTaskId = row.id;

  await emitPlannerTaskCreated({
    actor,
    tenant_id: row.tenant_id,
    after: {
      task_id: row.id,
      plan_id: row.plan_id,
      group_id: groupId,
      bucket_id: row.bucket_id,
      title: row.title,
      description: row.description,
      priority_number: priorityToNumber(row.priority),
      percent_complete: progressToPercent(row.progress),
      is_deferred: row.is_deferred,
      preview_type: row.preview_type as TaskPreviewType,
      start_at: row.start_at ? row.start_at.toISOString() : null,
      due_at: row.due_at ? row.due_at.toISOString() : null,
      order_hint: row.order_hint,
      assignee_priority: row.assignee_priority,
      review_state: row.review_state,
      external_source: 'native',
      external_id: null,
      created_by: row.created_by,
    },
  });

  const sourceChecklist = await tx
    .select()
    .from(checklistItems)
    .where(eq(checklistItems.task_id, sourceTask.id))
    .orderBy(sql`order_hint NULLS LAST`);

  for (const item of sourceChecklist) {
    const [newItem] = await tx
      .insert(checklistItems)
      .values({
        tenant_id: row.tenant_id,
        task_id: newTaskId,
        label: item.label,
        checked: item.checked,
        order_hint: item.order_hint,
      })
      .returning();
    if (!newItem) throw new PlannerError('VALIDATION', 'Checklist insert returned no row');

    await emitPlannerChecklistItemAdded({
      actor,
      tenant_id: row.tenant_id,
      group_id: groupId,
      item_id: newItem.id,
      task_id: newTaskId,
      plan_id: newPlanId,
      label: newItem.label,
      order_hint: newItem.order_hint,
    });
  }

  const sourceAssignees = await tx
    .select()
    .from(taskAssignments)
    .where(eq(taskAssignments.task_id, sourceTask.id))
    .orderBy(sql`order_hint NULLS LAST`);

  for (const assignee of sourceAssignees) {
    const inserted = await tx
      .insert(taskAssignments)
      .values({
        tenant_id: row.tenant_id,
        task_id: newTaskId,
        user_id: assignee.user_id,
        order_hint: assignee.order_hint,
        assigned_by: createdBy,
      })
      .onConflictDoNothing()
      .returning();
    if (inserted.length === 0) continue;

    await emitPlannerTaskAssigned({
      actor,
      tenant_id: row.tenant_id,
      task_id: newTaskId,
      plan_id: newPlanId,
      group_id: groupId,
      user_id: assignee.user_id,
    });
  }

  const sourceTaskLabels = await tx
    .select({ label_id: taskLabels.label_id })
    .from(taskLabels)
    .where(eq(taskLabels.task_id, sourceTask.id));

  for (const { label_id } of sourceTaskLabels) {
    const mappedLabelId = labelIdMap.get(label_id);
    if (!mappedLabelId) continue;

    const inserted = await tx
      .insert(taskLabels)
      .values({
        tenant_id: row.tenant_id,
        task_id: newTaskId,
        label_id: mappedLabelId,
        applied_by: createdBy,
      })
      .onConflictDoNothing()
      .returning();
    if (inserted.length === 0) continue;

    await emitPlannerLabelApplied({
      actor,
      tenant_id: row.tenant_id,
      group_id: groupId,
      task_id: newTaskId,
      plan_id: newPlanId,
      label_id: mappedLabelId,
    });
  }

  const sourceRefs = await tx
    .select()
    .from(taskReferences)
    .where(
      and(
        eq(taskReferences.task_id, sourceTask.id),
        // A copied plan must not link its copies back to the ORIGINALS, and the
        // target lives inside `url`, so a copied link row would do exactly that
        // (design §3.1).
        notInArray(taskReferences.type, TASK_LINK_KIND_LIST),
      ),
    )
    .orderBy(asc(taskReferences.created_at));

  for (const ref of sourceRefs) {
    const [newRef] = await tx
      .insert(taskReferences)
      .values({
        tenant_id: row.tenant_id,
        task_id: newTaskId,
        url: ref.url,
        alias: ref.alias,
        type: ref.type,
        preview_priority: ref.preview_priority,
      })
      .onConflictDoNothing()
      .returning();
    if (!newRef) continue;

    await emitPlannerTaskReferenceAdded({
      actor,
      tenant_id: row.tenant_id,
      group_id: groupId,
      task_id: newTaskId,
      plan_id: newPlanId,
      url: newRef.url,
      alias: newRef.alias,
      type: newRef.type as TaskReferenceType,
    });
  }
}
