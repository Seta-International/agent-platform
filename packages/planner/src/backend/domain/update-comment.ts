import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { and, eq, isNull } from 'drizzle-orm';
import { emitPlannerCommentUpdated } from '../../events/emit-helpers.ts';
import { assigneeProjection, plans, taskComments, tasks } from '../db/schema.ts';
import type { CommentDto } from '../dto.ts';
import type { UpdateCommentInput } from '../inputs.ts';
import { withSpan } from '../observability.ts';
import { PlannerError, requirePermission } from '../rbac.ts';

const BODY_MAX_LEN = 4000;

export async function updateComment(
  input: UpdateCommentInput & { session: SessionScope },
): Promise<CommentDto> {
  return withSpan(
    'planner.comment.update',
    {
      'planner.tenant_id': input.session.tenant_id,
      'planner.user_id': input.session.user_id,
      'planner.comment_id': input.comment_id,
    },
    () => updateCommentImpl(input),
  );
}

async function updateCommentImpl(
  input: UpdateCommentInput & { session: SessionScope },
): Promise<CommentDto> {
  const trimmed = input.body.trim();
  if (trimmed.length === 0) {
    throw new PlannerError('VALIDATION', 'Comment body cannot be empty');
  }
  if (input.body.length > BODY_MAX_LEN) {
    throw new PlannerError('VALIDATION', `Comment body exceeds ${BODY_MAX_LEN} characters`);
  }

  let dto!: CommentDto;

  await withEmit(
    { actor: { userId: input.session.user_id, tenantId: input.session.tenant_id } },
    async (tx) => {
      const [existing] = await tx
        .select()
        .from(taskComments)
        .where(and(eq(taskComments.id, input.comment_id), isNull(taskComments.deleted_at)))
        .limit(1);
      if (!existing || existing.tenant_id !== input.session.tenant_id) {
        throw new PlannerError('NOT_FOUND', 'Comment not found', {
          comment_id: input.comment_id,
        });
      }
      if (existing.author_id !== input.session.user_id) {
        throw new PlannerError('FORBIDDEN', 'Only the author can edit a comment', {
          comment_id: input.comment_id,
        });
      }

      const [task] = await tx.select().from(tasks).where(eq(tasks.id, existing.task_id)).limit(1);
      if (!task) throw new PlannerError('NOT_FOUND', 'Parent task not found');
      const [plan] = await tx.select().from(plans).where(eq(plans.id, task.plan_id)).limit(1);
      if (!plan) throw new PlannerError('NOT_FOUND', 'Parent plan not found');

      await requirePermission(input.session, 'planner.task.comment.create', plan.group_id);

      const beforeBody = existing.body;
      const [updated] = await tx
        .update(taskComments)
        .set({ body: input.body, updated_at: new Date() })
        .where(eq(taskComments.id, existing.id))
        .returning();
      if (!updated) throw new PlannerError('VALIDATION', 'Update returned no row');

      const [proj] = await tx
        .select({ display_name: assigneeProjection.display_name })
        .from(assigneeProjection)
        .where(eq(assigneeProjection.user_id, updated.author_id))
        .limit(1);

      const editedIso = (updated.updated_at as Date).toISOString();

      await emitPlannerCommentUpdated({
        actor: { type: 'user', user_id: input.session.user_id },
        tenant_id: task.tenant_id,
        comment_id: updated.id,
        task_id: task.id,
        plan_id: plan.id,
        group_id: plan.group_id,
        before_body: beforeBody,
        after_body: updated.body,
        edited_at: editedIso,
      });

      dto = {
        id: updated.id,
        task_id: updated.task_id,
        author_id: updated.author_id,
        author_display_name: proj?.display_name ?? 'Unknown user',
        body: updated.body,
        created_at: updated.created_at.toISOString(),
        edited_at: editedIso,
      };
    },
  );

  return dto;
}
