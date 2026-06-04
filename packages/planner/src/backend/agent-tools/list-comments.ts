import {
  actorFromContext,
  defineAgentTool,
  recordEntityExposure,
  resolveTaskRef,
} from '@seta/agent-sdk';
import { buildActorSession } from '@seta/identity';
import { z } from 'zod';
import { listComments } from '../domain/list-comments.ts';

export const plannerListCommentsTool = defineAgentTool({
  id: 'planner_listComments',
  name: 'List Task Comments',
  description: 'List comments on a planner task, newest first.',
  input: z.object({
    taskRef: z
      .string()
      .trim()
      .min(1)
      .describe(
        'Task UUID, or an ordinal reference into your working memory `recentTasks` list: ' +
          '"#1" / "1" / "first" → most recent, "#2" / "second" → next, "last" → most recent. ' +
          'Prefer ordinals when the user is referring to something you just discussed.',
      ),
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
    const { taskId } = await resolveTaskRef(ctx as never, input.taskRef);
    const r = await listComments({ task_id: taskId, limit: input.limit, session });
    await recordEntityExposure(ctx as never, { lastDiscussedTaskId: taskId });
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
