import { actorFromContext, defineAgentTool, resolveTaskRef } from '@seta/agent-sdk';
import { buildActorSession } from '@seta/identity';
import { z } from 'zod';
import { listTaskEvents } from '../domain/list-task-events.ts';

export const plannerGetItemActivityTool = defineAgentTool({
  id: 'planner_getItemActivity',
  name: 'Get Item Activity',
  description:
    'Get the change history (activity feed) for one task, newest first — ' +
    'status changes, comments, label and checklist edits.',
  input: z.object({
    taskRef: z
      .string()
      .trim()
      .min(1)
      .describe('Task UUID or an ordinal into recentTasks ("#1", "first", "last").'),
    limit: z.number().int().min(1).max(200).optional().describe('Max events (default 50).'),
    cursor: z.string().optional().describe('Opaque pagination cursor from a prior call.'),
  }),
  output: z.object({
    events: z.array(
      z.object({
        id: z.string(),
        eventType: z.string(),
        aggregateType: z.string(),
        occurredAt: z.string(),
      }),
    ),
    nextCursor: z.string().nullable(),
  }),
  rbac: 'planner.task.read',
  execute: async (input, ctx) => {
    const actor = actorFromContext(ctx);
    const session = await buildActorSession(actor);
    const { taskId } = await resolveTaskRef(ctx as never, input.taskRef);

    const { events, next_cursor } = await listTaskEvents({
      task_id: taskId,
      session,
      limit: input.limit,
      cursor: input.cursor,
    });

    return {
      events: events.map((e) => ({
        id: e.id,
        eventType: e.event_type,
        aggregateType: e.aggregate_type,
        occurredAt: e.occurred_at.toISOString(),
      })),
      nextCursor: next_cursor ?? null,
    };
  },
});
