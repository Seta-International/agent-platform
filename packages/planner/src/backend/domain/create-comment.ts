import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { and, eq, isNull } from 'drizzle-orm';
import { emitPlannerCommentCreated } from '../../events/emit-helpers.ts';
import { assigneeProjection, plans, taskComments, tasks } from '../db/schema.ts';
import type { CommentDto } from '../dto.ts';
import type { CreateCommentInput } from '../inputs.ts';
import { withSpan } from '../observability.ts';
import { PlannerError, requirePermission } from '../rbac.ts';

const BODY_MAX_LEN = 4000;

export async function createComment(
  input: CreateCommentInput & { session: SessionScope },
): Promise<CommentDto> {
  return withSpan(
    'planner.comment.create',
    {
      'planner.tenant_id': input.session.tenant_id,
      'planner.user_id': input.session.user_id,
      'planner.task_id': input.task_id,
    },
    () => createCommentImpl(input),
  );
}

async function createCommentImpl(
  input: CreateCommentInput & { session: SessionScope },
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
      const [task] = await tx
        .select()
        .from(tasks)
        .where(and(eq(tasks.id, input.task_id), isNull(tasks.deleted_at)))
        .limit(1);
      if (!task) {
        throw new PlannerError('NOT_FOUND', 'Task not found', { task_id: input.task_id });
      }
      if (task.tenant_id !== input.session.tenant_id) {
        throw new PlannerError('CROSS_TENANT', 'Task belongs to another tenant', {
          task_id: input.task_id,
        });
      }

      const [plan] = await tx.select().from(plans).where(eq(plans.id, task.plan_id)).limit(1);
      if (!plan) {
        throw new PlannerError('NOT_FOUND', 'Parent plan not found', { plan_id: task.plan_id });
      }

      await requirePermission(input.session, 'planner.task.comment.create', plan.group_id);

      const [inserted] = await tx
        .insert(taskComments)
        .values({
          tenant_id: task.tenant_id,
          task_id: task.id,
          author_id: input.session.user_id,
          body: input.body,
        })
        .returning();
      if (!inserted) throw new PlannerError('VALIDATION', 'Insert returned no row');

      const [proj] = await tx
        .select({ display_name: assigneeProjection.display_name })
        .from(assigneeProjection)
        .where(eq(assigneeProjection.user_id, inserted.author_id))
        .limit(1);

      const createdIso = inserted.created_at.toISOString();

      await emitPlannerCommentCreated({
        actor: { type: 'user', user_id: input.session.user_id },
        tenant_id: task.tenant_id,
        comment_id: inserted.id,
        task_id: task.id,
        plan_id: plan.id,
        group_id: plan.group_id,
        author_id: inserted.author_id,
        body: inserted.body,
        created_at: createdIso,
      });

      dto = {
        id: inserted.id,
        task_id: inserted.task_id,
        author_id: inserted.author_id,
        author_display_name: proj?.display_name ?? 'Unknown user',
        body: inserted.body,
        created_at: createdIso,
        edited_at: null,
      };
    },
  );

  return dto;
}
