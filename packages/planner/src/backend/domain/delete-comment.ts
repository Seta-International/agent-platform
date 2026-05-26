import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { and, eq, isNull } from 'drizzle-orm';
import { emitPlannerCommentDeleted } from '../../events/emit-helpers.ts';
import { groupMembers, plans, taskComments, tasks } from '../db/schema.ts';
import type { DeleteCommentInput } from '../inputs.ts';
import { withSpan } from '../observability.ts';
import { PlannerError, requirePermission } from '../rbac.ts';

export async function deleteComment(
  input: DeleteCommentInput & { session: SessionScope },
): Promise<void> {
  return withSpan(
    'planner.comment.delete',
    {
      'planner.tenant_id': input.session.tenant_id,
      'planner.user_id': input.session.user_id,
      'planner.comment_id': input.comment_id,
    },
    () => deleteCommentImpl(input),
  );
}

async function deleteCommentImpl(
  input: DeleteCommentInput & { session: SessionScope },
): Promise<void> {
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

      const [task] = await tx.select().from(tasks).where(eq(tasks.id, existing.task_id)).limit(1);
      if (!task) throw new PlannerError('NOT_FOUND', 'Parent task not found');
      const [plan] = await tx.select().from(plans).where(eq(plans.id, task.plan_id)).limit(1);
      if (!plan) throw new PlannerError('NOT_FOUND', 'Parent plan not found');

      const isAuthor = existing.author_id === input.session.user_id;
      let hasAnyDelete = false;
      try {
        requirePermission(input.session, 'planner.task.comment.delete.any');
        hasAnyDelete = true;
      } catch {
        // not an admin — fall through to author/owner check
      }

      let isGroupOwner = false;
      if (!isAuthor && !hasAnyDelete) {
        const [member] = await tx
          .select()
          .from(groupMembers)
          .where(
            and(
              eq(groupMembers.group_id, plan.group_id),
              eq(groupMembers.user_id, input.session.user_id),
            ),
          )
          .limit(1);
        isGroupOwner = member?.role === 'owner';
      }

      if (!isAuthor && !hasAnyDelete && !isGroupOwner) {
        throw new PlannerError('FORBIDDEN', 'Not permitted to delete this comment', {
          comment_id: input.comment_id,
        });
      }

      await tx
        .update(taskComments)
        .set({ deleted_at: new Date() })
        .where(eq(taskComments.id, existing.id));

      await emitPlannerCommentDeleted({
        actor: { type: 'user', user_id: input.session.user_id },
        tenant_id: task.tenant_id,
        comment_id: existing.id,
        task_id: task.id,
        plan_id: plan.id,
        group_id: plan.group_id,
        author_id: existing.author_id,
      });
    },
  );
}
