import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { and, eq, isNull } from 'drizzle-orm';
import { plans, taskReferences, tasks } from '../../db/schema.ts';
import { emitPlannerTaskReferenceAdded } from '../../events/emit-helpers.ts';
import type { TaskReferenceRow, TaskReferenceType } from '../dto.ts';
import type { AddTaskReferenceInput } from '../inputs.ts';
import { withSpan } from '../observability.ts';
import { PlannerError, requirePermission } from '../rbac.ts';

type TaskReferenceDbRow = typeof taskReferences.$inferSelect;

function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  if ('code' in err && (err as { code: unknown }).code === '23505') return true;
  const cause = (err as { cause?: unknown }).cause;
  if (
    typeof cause === 'object' &&
    cause !== null &&
    'code' in cause &&
    (cause as { code: unknown }).code === '23505'
  ) {
    return true;
  }
  return false;
}

function rowToDto(row: TaskReferenceDbRow): TaskReferenceRow {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    task_id: row.task_id,
    url: row.url,
    alias: row.alias,
    type: row.type as TaskReferenceType,
    preview_priority: row.preview_priority,
    external_etag: row.external_etag,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

export async function addTaskReference(
  input: AddTaskReferenceInput & { session: SessionScope },
): Promise<TaskReferenceRow> {
  return withSpan(
    'planner.task.add-reference',
    {
      'planner.tenant_id': input.session.tenant_id,
      'planner.user_id': input.session.user_id,
      'planner.task_id': input.task_id,
    },
    () => addTaskReferenceImpl(input),
  );
}

async function addTaskReferenceImpl(
  input: AddTaskReferenceInput & { session: SessionScope },
): Promise<TaskReferenceRow> {
  let result!: TaskReferenceDbRow;

  await withEmit(
    {
      actor: {
        userId: input.session.user_id,
        tenantId: input.session.tenant_id,
      },
    },
    async (tx) => {
      const [task] = await tx
        .select()
        .from(tasks)
        .where(and(eq(tasks.id, input.task_id), isNull(tasks.deleted_at)))
        .limit(1);
      if (!task) throw new PlannerError('NOT_FOUND', 'Task not found', { task_id: input.task_id });
      if (task.tenant_id !== input.session.tenant_id) {
        throw new PlannerError('CROSS_TENANT', 'Task belongs to another tenant', {
          task_id: input.task_id,
        });
      }

      const [plan] = await tx.select().from(plans).where(eq(plans.id, task.plan_id)).limit(1);
      if (!plan)
        throw new PlannerError('NOT_FOUND', 'Parent plan not found', {
          plan_id: task.plan_id,
        });

      requirePermission(input.session, 'planner.task.update', plan.group_id);

      const type: TaskReferenceType = input.type ?? 'other';
      const alias = input.alias ?? null;

      let inserted: TaskReferenceDbRow;
      try {
        const [row] = await tx
          .insert(taskReferences)
          .values({
            tenant_id: task.tenant_id,
            task_id: task.id,
            url: input.url,
            alias,
            type,
          })
          .returning();
        if (!row) throw new PlannerError('VALIDATION', 'Insert returned no row');
        inserted = row;
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new PlannerError(
            'DUPLICATE_REFERENCE',
            'Reference with this URL already exists on task',
            { task_id: task.id, url: input.url },
          );
        }
        throw err;
      }

      result = inserted;

      await emitPlannerTaskReferenceAdded({
        actor: { type: 'user', user_id: input.session.user_id },
        tenant_id: task.tenant_id,
        task_id: task.id,
        plan_id: task.plan_id,
        url: inserted.url,
        alias: inserted.alias,
        type: inserted.type as TaskReferenceType,
      });
    },
  );

  return rowToDto(result);
}
