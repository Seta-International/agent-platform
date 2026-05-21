import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { buckets, plans, tasks } from '../../db/schema.ts';
import { emitPlannerTaskCreated } from '../../events/emit-helpers.ts';
import type { TaskRow } from '../dto.ts';
import type { CreateTaskInput } from '../inputs.ts';
import { PlannerError, requirePermission } from '../rbac.ts';
import { placeAfter } from '../sort-order.ts';

type TaskDbRow = typeof tasks.$inferSelect;

export async function createTask(
  input: CreateTaskInput & { session: SessionScope },
): Promise<TaskRow> {
  let inserted!: TaskDbRow;
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

      // Compute sort_order: append after the last live task in this bucket scope.
      const bucketCondition =
        input.bucket_id !== undefined
          ? eq(tasks.bucket_id, input.bucket_id)
          : isNull(tasks.bucket_id);
      const existingTasks = await tx
        .select({ sort_order: tasks.sort_order })
        .from(tasks)
        .where(and(eq(tasks.plan_id, input.plan_id), bucketCondition, isNull(tasks.deleted_at)))
        .orderBy(asc(tasks.sort_order));

      const last = existingTasks[existingTasks.length - 1];
      const sortOrder = placeAfter(last?.sort_order, undefined);

      const [row] = await tx
        .insert(tasks)
        .values({
          tenant_id: plan.tenant_id,
          plan_id: input.plan_id,
          bucket_id: input.bucket_id ?? null,
          title: input.title,
          description: input.description ?? null,
          priority: input.priority ?? 'medium',
          progress: input.progress ?? 'not_started',
          review_state: input.review_state ?? null,
          skill_tags: input.skill_tags ?? [],
          due_at: input.due_at ? new Date(input.due_at) : null,
          sort_order: sortOrder,
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
          priority: row.priority,
          due_at: row.due_at ? row.due_at.toISOString() : null,
          skill_tags: row.skill_tags,
          review_state: row.review_state,
          sort_order: row.sort_order,
          created_by: row.created_by,
        },
      });
    },
  );

  return rowToDto(inserted);
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
