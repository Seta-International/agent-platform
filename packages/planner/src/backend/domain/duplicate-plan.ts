import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { requestNotification } from '@seta/notifications';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
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
import {
  buckets,
  checklistItems,
  groups,
  labels,
  plans,
  taskAssignments,
  taskLabels,
  taskReferences,
  tasks,
} from '../db/schema.ts';
import type { PlanRow, TaskPreviewType, TaskPriorityNumber, TaskReferenceType } from '../dto.ts';
import { PlannerError, requirePermission } from '../rbac.ts';
import { resolveGroupMemberIds } from './recipients.ts';

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

      requirePermission(input.session, 'planner.plan.create', source.group_id);

      const [group] = await tx
        .select({ name: groups.name })
        .from(groups)
        .where(eq(groups.id, source.group_id))
        .limit(1);

      const newName = `${source.name} (copy)`;
      const actor = { type: 'user' as const, user_id: input.session.user_id };

      const [row] = await tx
        .insert(plans)
        .values({
          tenant_id: source.tenant_id,
          group_id: source.group_id,
          name: newName,
          category_descriptions: source.category_descriptions,
          created_by: input.session.user_id,
        })
        .returning();
      if (!row) throw new PlannerError('VALIDATION', 'Insert returned no row');
      inserted = row;

      const { eventId } = await emitPlannerPlanCreated({
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

      const memberIds = await resolveGroupMemberIds(source.tenant_id, source.group_id, tx);
      const recipients = memberIds.filter((u) => u !== input.session.user_id);
      await requestNotification({
        tenant_id: source.tenant_id,
        event_type: 'planner.plan.created',
        user_ids: recipients,
        source_event_id: eventId,
        payload: {
          title: 'Plan duplicated',
          body: `Plan "${newName}" was created in "${group?.name ?? ''}"`,
          plan_id: row.id,
          group_id: source.group_id,
          actor: { user_id: input.session.user_id, name: input.session.user_id },
        },
      });
    },
  );

  return rowToDto(inserted);
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
      priority_number: sourceTask.priority_number,
      percent_complete: sourceTask.percent_complete,
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
      priority_number: row.priority_number as TaskPriorityNumber,
      percent_complete: row.percent_complete,
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
    .where(eq(taskReferences.task_id, sourceTask.id))
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

function rowToDto(row: PlanDbRow): PlanRow {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    group_id: row.group_id,
    name: row.name,
    category_descriptions: (row.category_descriptions ?? {}) as Record<string, string>,
    external_source: row.external_source as 'native' | 'm365',
    external_id: row.external_id,
    external_etag: row.external_etag,
    external_synced_at: row.external_synced_at ? row.external_synced_at.toISOString() : null,
    sync_status: row.sync_status as PlanRow['sync_status'],
    last_error: row.last_error,
    created_by: row.created_by,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    deleted_at: row.deleted_at ? row.deleted_at.toISOString() : null,
    archived_at: row.archived_at ? row.archived_at.toISOString() : null,
    version: row.version,
  };
}
