import {
  actorFromContext,
  defineAgentTool,
  recordEntityExposure,
  resolveTaskRef,
  TASK_REF_DESCRIPTION,
} from '@seta/agent-sdk';
import { buildActorSession } from '@seta/identity';
import { z } from 'zod';
import { createComment } from '../domain/create-comment.ts';

export const plannerPostCommentTool = defineAgentTool({
  id: 'planner_postComment',
  name: 'Post Task Comment',
  description: 'Post a plain-text comment on a planner task.',
  input: z.object({
    taskRef: z.string().trim().min(1).describe(TASK_REF_DESCRIPTION),
    body: z.string().min(1).max(4000).describe('Comment body, plain text'),
  }),
  output: z.object({
    comment: z.object({
      id: z.string(),
      taskId: z.string(),
      body: z.string(),
      createdAt: z.string(),
    }),
  }),
  rbac: 'planner.task.comment.create',
  needsApproval: true,
  execute: async (input, ctx) => {
    const actor = actorFromContext(ctx);
    const session = await buildActorSession(actor);
    const { taskId } = await resolveTaskRef(ctx as never, input.taskRef);
    const c = await createComment({ task_id: taskId, body: input.body, session });
    await recordEntityExposure(ctx as never, { lastDiscussedTaskId: taskId });
    return {
      comment: { id: c.id, taskId: c.task_id, body: c.body, createdAt: c.created_at },
    };
  },
});
