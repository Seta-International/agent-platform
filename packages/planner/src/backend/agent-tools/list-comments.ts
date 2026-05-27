import { actorFromContext, defineAgentTool } from '@seta/agent-sdk';
import { buildActorSession } from '@seta/identity';
import { z } from 'zod';
import { listComments } from '../domain/list-comments.ts';

export const plannerListCommentsTool = defineAgentTool({
  id: 'planner_listComments',
  name: 'List Task Comments',
  description: 'List comments on a planner task, newest first.',
  input: z.object({
    taskId: z.string().uuid().describe('The task ID'),
    limit: z.number().int().min(1).max(100).optional(),
  }),
  output: z.object({
    comments: z.array(
      z.object({
        id: z.string(),
        authorDisplayName: z.string(),
        body: z.string(),
        createdAt: z.string(),
        editedAt: z.string().nullable(),
      }),
    ),
    hasMore: z.boolean(),
  }),
  rbac: 'planner.task.comment.read',
  execute: async (input, ctx) => {
    const actor = actorFromContext(ctx);
    const session = await buildActorSession(actor);
    const r = await listComments({ task_id: input.taskId, limit: input.limit, session });
    return {
      comments: r.comments.map((c) => ({
        id: c.id,
        authorDisplayName: c.author_display_name,
        body: c.body,
        createdAt: c.created_at,
        editedAt: c.edited_at,
      })),
      hasMore: r.has_more,
    };
  },
});
