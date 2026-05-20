import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { and, eq, isNull } from 'drizzle-orm';
import { plans, tasks } from '../../db/schema.ts';
import { emitPlannerTaskUpdated } from '../../events/emit-helpers.ts';
import type { TaskMutableFields } from '../../events/types.ts';
import type { TaskRow } from '../dto.ts';
import type { UpdateTaskPatch } from '../inputs.ts';
import { PlannerError, requirePermission } from '../rbac.ts';

type TaskDbRow = typeof tasks.$inferSelect;
type TaskSetFields = {
  title?: string;
  description?: string | null;
  priority?: 'urgent' | 'important' | 'medium' | 'low';
  review_state?: 'needs_review' | null;
  skill_tags?: string[];
  due_at?: Date | null;
  updated_at: Date;
  version: number;
};

export async function updateTask(input: {
  task_id: string;
  expected_version: number;
  patch: UpdateTaskPatch;
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

      const before: Partial<TaskMutableFields> = {};
      const after: Partial<TaskMutableFields> = {};
      const setFields: TaskSetFields = {
        updated_at: new Date(),
        version: existing.version + 1,
      };

      if (input.patch.title !== undefined && input.patch.title !== existing.title) {
        before.title = existing.title;
        after.title = input.patch.title;
        setFields.title = input.patch.title;
      }

      if (
        input.patch.description !== undefined &&
        input.patch.description !== existing.description
      ) {
        before.description = existing.description;
        after.description = input.patch.description;
        setFields.description = input.patch.description;
      }

      if (input.patch.priority !== undefined && input.patch.priority !== existing.priority) {
        before.priority = existing.priority;
        after.priority = input.patch.priority;
        setFields.priority = input.patch.priority;
      }

      if (
        input.patch.review_state !== undefined &&
        input.patch.review_state !== existing.review_state
      ) {
        before.review_state = existing.review_state;
        after.review_state = input.patch.review_state;
        setFields.review_state = input.patch.review_state;
      }

      if (input.patch.skill_tags !== undefined) {
        const existingStr = JSON.stringify(existing.skill_tags);
        const patchStr = JSON.stringify(input.patch.skill_tags);
        if (existingStr !== patchStr) {
          before.skill_tags = existing.skill_tags;
          after.skill_tags = input.patch.skill_tags;
          setFields.skill_tags = input.patch.skill_tags;
        }
      }

      if (input.patch.due_at !== undefined) {
        const existingIso = existing.due_at ? existing.due_at.toISOString() : null;
        const patchIso = input.patch.due_at ?? null;
        if (existingIso !== patchIso) {
          before.due_at = existingIso;
          after.due_at = patchIso;
          setFields.due_at = patchIso ? new Date(patchIso) : null;
        }
      }

      // No fields changed — return existing row without version bump or event.
      if (Object.keys(after).length === 0) {
        result = existing;
        return;
      }

      const [row] = await tx
        .update(tasks)
        .set(setFields)
        .where(eq(tasks.id, input.task_id))
        .returning();
      if (!row) throw new PlannerError('VALIDATION', 'Update returned no row');
      result = row;

      await emitPlannerTaskUpdated({
        actor: { type: 'user', user_id: input.session.user_id },
        tenant_id: existing.tenant_id,
        task_id: existing.id,
        plan_id: existing.plan_id,
        group_id: plan.group_id,
        before,
        after,
        version_before: existing.version,
        version_after: existing.version + 1,
      });
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
