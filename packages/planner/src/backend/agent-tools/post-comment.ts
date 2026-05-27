import { actorFromContext, defineAgentTool } from '@seta/agent-sdk';
import { buildActorSession } from '@seta/identity';
import { z } from 'zod';
import { createComment } from '../domain/create-comment.ts';

export const plannerPostCommentTool = defineAgentTool({
  id: 'planner_postComment',
  name: 'Post Task Comment',
  description: 'Post a plain-text comment on a planner task.',
  input: z.object({
    taskId: z.string().uuid().describe('The task ID'),
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
    const c = await createComment({ task_id: input.taskId, body: input.body, session });
    return {
      comment: { id: c.id, taskId: c.task_id, body: c.body, createdAt: c.created_at },
    };
  },
});
