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
import type {
  PlanRow,
  TaskExternalSource,
  TaskPreviewType,
  TaskPriorityNumber,
  TaskReferenceType,
} from '../dto.ts';
import { PlannerError, requirePermission } from '../rbac.ts';
import { resolveGroupMemberIds } from './recipients.ts';

type PlanDbRow = typeof plans.$inferSelect;

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

      const [row] = await tx
        .insert(plans)
        .values({
          tenant_id: source.tenant_id,
          group_id: source.group_id,
          name: newName,
          // Preserve category descriptions so copied labels keep their slot meaning.
          category_descriptions: source.category_descriptions,
          created_by: input.session.user_id,
        })
        .returning();
      if (!row) throw new PlannerError('VALIDATION', 'Insert returned no row');
      inserted = row;

      const { eventId } = await emitPlannerPlanCreated({
        actor: { type: 'user', user_id: input.session.user_id },
        tenant_id: source.tenant_id,
        after: {
          plan_id: row.id,
          group_id: row.group_id,
          name: row.name,
          created_by: row.created_by,
        },
      });

      // Labels are plan-scoped: copy the definitions first, then remap task labels.
      const sourceLabels = await tx
        .select()
        .from(labels)
        .where(and(eq(labels.plan_id, source.id), isNull(labels.deleted_at)));
      const labelIdMap = new Map<string, string>();
      for (const l of sourceLabels) {
        const [newLabel] = await tx
          .insert(labels)
          .values({
            tenant_id: source.tenant_id,
            plan_id: row.id,
            name: l.name,
            color: l.color,
            category_slot: l.category_slot,
          })
          .returning();
        if (!newLabel) continue;
        labelIdMap.set(l.id, newLabel.id);
        await emitPlannerLabelCreated({
          actor: { type: 'user', user_id: input.session.user_id },
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

      // Copy non-deleted buckets and map old→new ids so tasks land in the right bucket.
      const sourceBuckets = await tx
        .select()
        .from(buckets)
        .where(and(eq(buckets.plan_id, source.id), isNull(buckets.deleted_at)));
      const bucketIdMap = new Map<string, string>();

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
          actor: { type: 'user', user_id: input.session.user_id },
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

      // Copy non-deleted tasks with full fidelity (status/priority/dates/etc.),
      // remapping bucket ids; a task whose bucket was deleted lands bucketless.
      const sourceTasks = await tx
        .select()
        .from(tasks)
        .where(and(eq(tasks.plan_id, source.id), isNull(tasks.deleted_at)))
        .orderBy(sql`order_hint NULLS LAST`);

      for (const t of sourceTasks) {
        const newBucketId = t.bucket_id ? (bucketIdMap.get(t.bucket_id) ?? null) : null;
        const [newTask] = await tx
          .insert(tasks)
          .values({
            tenant_id: source.tenant_id,
            plan_id: row.id,
            bucket_id: newBucketId,
            title: t.title,
            description: t.description,
            description_text: t.description_text,
            priority_number: t.priority_number,
            percent_complete: t.percent_complete,
            is_deferred: t.is_deferred,
            preview_type: t.preview_type,
            review_state: t.review_state,
            start_at: t.start_at,
            due_at: t.due_at,
            order_hint: t.order_hint,
            assignee_priority: t.assignee_priority,
            created_by: input.session.user_id,
          })
          .returning();
        if (!newTask) continue;

        await emitPlannerTaskCreated({
          actor: { type: 'user', user_id: input.session.user_id },
          tenant_id: source.tenant_id,
          after: {
            task_id: newTask.id,
            plan_id: row.id,
            group_id: source.group_id,
            bucket_id: newTask.bucket_id,
            title: newTask.title,
            description: newTask.description,
            priority_number: newTask.priority_number as TaskPriorityNumber,
            percent_complete: newTask.percent_complete,
            is_deferred: newTask.is_deferred,
            preview_type: newTask.preview_type as TaskPreviewType,
            start_at: newTask.start_at ? newTask.start_at.toISOString() : null,
            due_at: newTask.due_at ? newTask.due_at.toISOString() : null,
            order_hint: newTask.order_hint,
            assignee_priority: newTask.assignee_priority,
            review_state: newTask.review_state,
            external_source: newTask.external_source as TaskExternalSource,
            external_id: newTask.external_id,
            created_by: newTask.created_by,
          },
        });

        const sourceChecklist = await tx
          .select()
          .from(checklistItems)
          .where(eq(checklistItems.task_id, t.id))
          .orderBy(sql`order_hint NULLS LAST`);
        for (const item of sourceChecklist) {
          const [newItem] = await tx
            .insert(checklistItems)
            .values({
              task_id: newTask.id,
              label: item.label,
              checked: item.checked,
              order_hint: item.order_hint,
            })
            .returning();
          if (!newItem) continue;
          await emitPlannerChecklistItemAdded({
            actor: { type: 'user', user_id: input.session.user_id },
            tenant_id: source.tenant_id,
            group_id: source.group_id,
            item_id: newItem.id,
            task_id: newTask.id,
            plan_id: row.id,
            label: newItem.label,
            order_hint: newItem.order_hint,
          });
        }

        const sourceAssignees = await tx
          .select()
          .from(taskAssignments)
          .where(eq(taskAssignments.task_id, t.id))
          .orderBy(sql`order_hint NULLS LAST`);
        for (const a of sourceAssignees) {
          const ins = await tx
            .insert(taskAssignments)
            .values({
              task_id: newTask.id,
              user_id: a.user_id,
              order_hint: a.order_hint,
              assigned_by: input.session.user_id,
            })
            .onConflictDoNothing()
            .returning();
          if (ins.length === 0) continue;
          await emitPlannerTaskAssigned({
            actor: { type: 'user', user_id: input.session.user_id },
            tenant_id: source.tenant_id,
            task_id: newTask.id,
            plan_id: row.id,
            group_id: source.group_id,
            user_id: a.user_id,
          });
        }

        const sourceRefs = await tx
          .select()
          .from(taskReferences)
          .where(eq(taskReferences.task_id, t.id))
          .orderBy(asc(taskReferences.created_at));
        for (const r of sourceRefs) {
          const [newRef] = await tx
            .insert(taskReferences)
            .values({
              tenant_id: source.tenant_id,
              task_id: newTask.id,
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
            tenant_id: source.tenant_id,
            task_id: newTask.id,
            plan_id: row.id,
            url: newRef.url,
            alias: newRef.alias,
            type: newRef.type as TaskReferenceType,
          });
        }

        const sourceTaskLabels = await tx
          .select({ label_id: taskLabels.label_id })
          .from(taskLabels)
          .where(eq(taskLabels.task_id, t.id));
        for (const { label_id } of sourceTaskLabels) {
          const newLabelId = labelIdMap.get(label_id);
          if (!newLabelId) continue;
          const ins = await tx
            .insert(taskLabels)
            .values({
              task_id: newTask.id,
              label_id: newLabelId,
              applied_by: input.session.user_id,
            })
            .onConflictDoNothing()
            .returning();
          if (ins.length === 0) continue;
          await emitPlannerLabelApplied({
            actor: { type: 'user', user_id: input.session.user_id },
            tenant_id: source.tenant_id,
            group_id: source.group_id,
            task_id: newTask.id,
            plan_id: row.id,
            label_id: newLabelId,
          });
        }
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
