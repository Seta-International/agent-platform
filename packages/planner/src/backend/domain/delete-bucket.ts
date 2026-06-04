import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { and, eq, isNull } from 'drizzle-orm';
import { emitPlannerBucketDeleted, emitPlannerTaskDeleted } from '../../events/emit-helpers.ts';
import { buckets, plans, tasks } from '../db/schema.ts';
import { PlannerError, requirePermission } from '../rbac.ts';

export async function deleteBucket(input: {
  bucket_id: string;
  expected_version: number;
  session: SessionScope;
}): Promise<void> {
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
        .from(buckets)
        .where(and(eq(buckets.id, input.bucket_id), isNull(buckets.deleted_at)))
        .limit(1);
      if (!existing)
        throw new PlannerError('NOT_FOUND', 'Bucket not found', { bucket_id: input.bucket_id });
      if (existing.tenant_id !== input.session.tenant_id) {
        throw new PlannerError('CROSS_TENANT', 'Bucket belongs to another tenant', {
          bucket_id: input.bucket_id,
        });
      }

      const [plan] = await tx.select().from(plans).where(eq(plans.id, existing.plan_id)).limit(1);
      if (!plan)
        throw new PlannerError('NOT_FOUND', 'Parent plan not found', {
          plan_id: existing.plan_id,
        });

      requirePermission(input.session, 'planner.bucket.delete', plan.group_id);

      if (existing.version !== input.expected_version) {
        throw new PlannerError('CONFLICT', 'Version mismatch', {
          current_version: existing.version,
        });
      }

      // Soft-delete the bucket.
      const deletedAt = new Date();
      await tx
        .update(buckets)
        .set({ deleted_at: deletedAt, updated_at: deletedAt, version: existing.version + 1 })
        .where(eq(buckets.id, input.bucket_id));

      // Snapshot live tasks so we have their current version for the event payload.
      const liveTasks = await tx
        .select({ id: tasks.id, version: tasks.version })
        .from(tasks)
        .where(and(eq(tasks.bucket_id, input.bucket_id), isNull(tasks.deleted_at)));

      // Soft-delete all tasks in the bucket.
      const deletedTaskIds: string[] = [];
      for (const task of liveTasks) {
        const [deleted] = await tx
          .update(tasks)
          .set({ deleted_at: deletedAt, updated_at: deletedAt, version: task.version + 1 })
          .where(eq(tasks.id, task.id))
          .returning({ id: tasks.id });
        if (deleted) {
          deletedTaskIds.push(deleted.id);
          await emitPlannerTaskDeleted({
            actor: { type: 'user', user_id: input.session.user_id },
            tenant_id: existing.tenant_id,
            task_id: task.id,
            plan_id: existing.plan_id,
            group_id: plan.group_id,
            version_before: task.version,
            deleted_at: deletedAt.toISOString(),
          });
        }
      }

      await emitPlannerBucketDeleted({
        actor: { type: 'user', user_id: input.session.user_id },
        tenant_id: existing.tenant_id,
        bucket_id: existing.id,
        plan_id: existing.plan_id,
        group_id: plan.group_id,
        version_before: existing.version,
        deleted_task_ids: deletedTaskIds,
      });
    },
  );
}
