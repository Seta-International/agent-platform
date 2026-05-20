import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { buckets, plans, tasks } from '../../db/schema.ts';
import { emitPlannerTaskMoved } from '../../events/emit-helpers.ts';
import type { TaskRow } from '../dto.ts';
import { PlannerError, requirePermission } from '../rbac.ts';
import { needsRebalance, placeAfter, rebalancedOrders } from '../sort-order.ts';

type TaskDbRow = typeof tasks.$inferSelect;

export async function moveTask(input: {
  task_id: string;
  expected_version: number;
  to_bucket_id: string | null;
  after_task_id?: string;
  session: SessionScope;
}): Promise<TaskRow> {
  let result!: TaskDbRow;
  await withEmit(
    {
      actor: {
        userId: input.session.user_id,
        tenantId: input.session.tenant_id,
      },
    },
    async (tx) => {
      const [existing] = await tx
        .select()
        .from(tasks)
        .where(and(eq(tasks.id, input.task_id), isNull(tasks.deleted_at)))
        .limit(1);
      if (!existing)
        throw new PlannerError('NOT_FOUND', 'Task not found', { task_id: input.task_id });
      if (existing.tenant_id !== input.session.tenant_id) {
        throw new PlannerError('CROSS_TENANT', 'Task belongs to another tenant', {
          task_id: input.task_id,
        });
      }

      const [plan] = await tx.select().from(plans).where(eq(plans.id, existing.plan_id)).limit(1);
      if (!plan)
        throw new PlannerError('NOT_FOUND', 'Parent plan not found', {
          plan_id: existing.plan_id,
        });

      requirePermission(input.session, 'planner.task.update', plan.group_id);

      if (existing.version !== input.expected_version) {
        throw new PlannerError('CONFLICT', 'Version mismatch', {
          current_version: existing.version,
        });
      }

      // Validate target bucket if provided.
      if (input.to_bucket_id !== null) {
        const [targetBucket] = await tx
          .select()
          .from(buckets)
          .where(eq(buckets.id, input.to_bucket_id))
          .limit(1);
        if (!targetBucket || targetBucket.plan_id !== existing.plan_id) {
          throw new PlannerError('VALIDATION', 'Target bucket does not belong to the same plan', {
            to_bucket_id: input.to_bucket_id,
          });
        }
        if (targetBucket.deleted_at !== null) {
          throw new PlannerError('VALIDATION', 'Target bucket is deleted', {
            to_bucket_id: input.to_bucket_id,
          });
        }
      }

      // List live tasks in the target bucket scope, excluding the task being moved.
      const bucketCondition =
        input.to_bucket_id !== null
          ? eq(tasks.bucket_id, input.to_bucket_id)
          : isNull(tasks.bucket_id);
      const targetTasks = await tx
        .select()
        .from(tasks)
        .where(and(eq(tasks.plan_id, existing.plan_id), bucketCondition, isNull(tasks.deleted_at)))
        .orderBy(asc(tasks.sort_order));

      const otherTasks = targetTasks.filter((t) => t.id !== input.task_id);

      let afterSortOrder: number | undefined;
      let nextSortOrder: number | undefined;

      if (input.after_task_id === undefined) {
        // Insert at top.
        afterSortOrder = undefined;
        nextSortOrder = otherTasks[0]?.sort_order;
      } else {
        const afterIdx = otherTasks.findIndex((t) => t.id === input.after_task_id);
        if (afterIdx === -1) {
          throw new PlannerError('VALIDATION', 'after_task_id not in target bucket', {
            after_task_id: input.after_task_id,
          });
        }
        // biome-ignore lint/style/noNonNullAssertion: afterIdx was verified !== -1 above
        afterSortOrder = otherTasks[afterIdx]!.sort_order;
        nextSortOrder = otherTasks[afterIdx + 1]?.sort_order;
      }

      const targetSortOrder = placeAfter(afterSortOrder, nextSortOrder);

      // No-op: same bucket and same computed sort_order position.
      if (input.to_bucket_id === existing.bucket_id && targetSortOrder === existing.sort_order) {
        result = existing;
        return;
      }

      // Check if a rebalance is needed for the target bucket.
      const gapIsSmall =
        (afterSortOrder !== undefined && needsRebalance(afterSortOrder, targetSortOrder)) ||
        (nextSortOrder !== undefined && needsRebalance(targetSortOrder, nextSortOrder));

      if (gapIsSmall) {
        // Build the new ordered list with the task placed correctly.
        const reordered: TaskDbRow[] = [];
        if (input.after_task_id === undefined) {
          reordered.push(existing);
          reordered.push(...otherTasks);
        } else {
          const afterIdx = otherTasks.findIndex((t) => t.id === input.after_task_id);
          reordered.push(...otherTasks.slice(0, afterIdx + 1));
          reordered.push(existing);
          reordered.push(...otherTasks.slice(afterIdx + 1));
        }

        const freshOrders = rebalancedOrders(reordered.length);
        const now = new Date();

        for (let i = 0; i < reordered.length; i++) {
          // biome-ignore lint/style/noNonNullAssertion: loop index is within bounds
          const task = reordered[i]!;
          // biome-ignore lint/style/noNonNullAssertion: freshOrders has same length as reordered
          const newOrder = freshOrders[i]!;
          const versionAfter = task.version + 1;

          // The moved task also gets the new bucket_id.
          const newBucketId = task.id === input.task_id ? input.to_bucket_id : task.bucket_id;

          const [updated] = await tx
            .update(tasks)
            .set({
              bucket_id: newBucketId,
              sort_order: newOrder,
              updated_at: now,
              version: versionAfter,
            })
            .where(eq(tasks.id, task.id))
            .returning();
          if (!updated) throw new PlannerError('VALIDATION', 'Rebalance update returned no row');

          if (task.id === input.task_id) {
            result = updated;
          }

          await emitPlannerTaskMoved({
            actor: { type: 'user', user_id: input.session.user_id },
            tenant_id: existing.tenant_id,
            task_id: task.id,
            plan_id: existing.plan_id,
            group_id: plan.group_id,
            before: { bucket_id: task.bucket_id, sort_order: task.sort_order },
            after: { bucket_id: newBucketId, sort_order: newOrder },
            version_before: task.version,
            version_after: versionAfter,
          });
        }
      } else {
        // Normal case: update just this task.
        const versionAfter = existing.version + 1;
        const [updated] = await tx
          .update(tasks)
          .set({
            bucket_id: input.to_bucket_id,
            sort_order: targetSortOrder,
            updated_at: new Date(),
            version: versionAfter,
          })
          .where(eq(tasks.id, input.task_id))
          .returning();
        if (!updated) throw new PlannerError('VALIDATION', 'Update returned no row');
        result = updated;

        await emitPlannerTaskMoved({
          actor: { type: 'user', user_id: input.session.user_id },
          tenant_id: existing.tenant_id,
          task_id: existing.id,
          plan_id: existing.plan_id,
          group_id: plan.group_id,
          before: { bucket_id: existing.bucket_id, sort_order: existing.sort_order },
          after: { bucket_id: input.to_bucket_id, sort_order: targetSortOrder },
          version_before: existing.version,
          version_after: versionAfter,
        });
      }
    },
  );

  return rowToDto(result);
}

function rowToDto(row: TaskDbRow): TaskRow {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    plan_id: row.plan_id,
    bucket_id: row.bucket_id,
    title: row.title,
    description: row.description,
    priority: row.priority,
    progress: row.progress,
    review_state: row.review_state,
    skill_tags: row.skill_tags,
    due_at: row.due_at ? row.due_at.toISOString() : null,
    sort_order: row.sort_order,
    created_by: row.created_by,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    deleted_at: row.deleted_at ? row.deleted_at.toISOString() : null,
    version: row.version,
  };
}
