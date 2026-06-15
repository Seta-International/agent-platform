import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { and, eq, isNull } from 'drizzle-orm';
import { emitPlannerTaskCreated } from '../../events/emit-helpers.ts';
import { buckets, plans, tasks } from '../db/schema.ts';
import type { TaskRow } from '../dto.ts';
import type { CreateTaskInput } from '../inputs.ts';
import { PlannerError, requirePermission } from '../rbac.ts';
import { taskRowToDto } from './_task-dto.ts';
import { hintBetween, type PlanExternalSource } from './order-hint.ts';

export async function createTask(
  input: CreateTaskInput & { session: SessionScope },
): Promise<TaskRow> {
  let inserted!: typeof tasks.$inferSelect;
  await withEmit(
    {
      actor: {
        userId: input.session.user_id,
        tenantId: input.session.tenant_id,
      },
    },
    async (tx) => {
      const [plan] = await tx
        .select()
        .from(plans)
        .where(and(eq(plans.id, input.plan_id), isNull(plans.deleted_at)))
        .limit(1);
      if (!plan) throw new PlannerError('NOT_FOUND', 'Plan not found', { plan_id: input.plan_id });
      if (plan.tenant_id !== input.session.tenant_id) {
        throw new PlannerError('CROSS_TENANT', 'Plan belongs to another tenant', {
          plan_id: input.plan_id,
        });
      }

      requirePermission(input.session, 'planner.task.create', plan.group_id);

      if (input.bucket_id !== undefined) {
        const [bucket] = await tx
          .select()
          .from(buckets)
          .where(eq(buckets.id, input.bucket_id))
          .limit(1);
        if (!bucket || bucket.plan_id !== plan.id) {
          throw new PlannerError('VALIDATION', 'bucket not in plan', {
            bucket_id: input.bucket_id,
          });
        }
        if (bucket.deleted_at !== null) {
          throw new PlannerError('VALIDATION', 'bucket is deleted', {
            bucket_id: input.bucket_id,
          });
        }
      }

      // Append: pick a key after the current last live task in this bucket scope.
      const bucketCondition =
        input.bucket_id !== undefined
          ? eq(tasks.bucket_id, input.bucket_id)
          : isNull(tasks.bucket_id);
      const existingTasks = await tx
        .select({ order_hint: tasks.order_hint })
        .from(tasks)
        .where(and(eq(tasks.plan_id, input.plan_id), bucketCondition, isNull(tasks.deleted_at)));
      const sortedHints = existingTasks
        .map((r) => r.order_hint)
        .filter((h): h is string => h !== null)
        .sort();
      const lastHint = sortedHints[sortedHints.length - 1] ?? null;
      const orderHint = hintBetween(lastHint, null, plan.external_source as PlanExternalSource);

      const [row] = await tx
        .insert(tasks)
        .values({
          tenant_id: plan.tenant_id,
          plan_id: input.plan_id,
          bucket_id: input.bucket_id ?? null,
          title: input.title,
          description: input.description ?? null,
          priority_number: input.priority_number ?? 5,
          percent_complete: input.percent_complete ?? 0,
          is_deferred: input.is_deferred ?? false,
          preview_type: input.preview_type ?? 'automatic',
          review_state: input.review_state ?? null,
          start_at: input.start_at ? new Date(input.start_at) : null,
          due_at: input.due_at ? new Date(input.due_at) : null,
          order_hint: orderHint,
          created_by: input.session.user_id,
        })
        .returning();
      if (!row) throw new PlannerError('VALIDATION', 'Insert returned no row');
      inserted = row;

      await emitPlannerTaskCreated({
        actor: { type: 'user', user_id: input.session.user_id },
        tenant_id: plan.tenant_id,
        after: {
          task_id: row.id,
          plan_id: input.plan_id,
          group_id: plan.group_id,
          bucket_id: row.bucket_id,
          title: row.title,
          description: row.description,
          priority_number: row.priority_number as 1 | 3 | 5 | 9,
          percent_complete: row.percent_complete,
          is_deferred: row.is_deferred,
          preview_type: row.preview_type as
            | 'automatic'
            | 'noPreview'
            | 'checklist'
            | 'description'
            | 'reference',
          start_at: row.start_at ? row.start_at.toISOString() : null,
          due_at: row.due_at ? row.due_at.toISOString() : null,
          order_hint: row.order_hint,
          assignee_priority: row.assignee_priority,
          review_state: row.review_state,
          external_source: row.external_source as 'native' | 'm365',
          external_id: row.external_id,
          created_by: row.created_by,
        },
      });
    },
  );

  return taskRowToDto(inserted);
}
