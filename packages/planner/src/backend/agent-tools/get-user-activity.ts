import { actorFromContext, defineAgentTool } from '@seta/agent-sdk';
import { buildActorSession } from '@seta/identity';
import { z } from 'zod';
import { getUserActivity } from '../domain/get-user-activity.ts';

export const plannerGetUserActivityTool = defineAgentTool({
  id: 'planner_getUserActivity',
  name: 'Get User Activity',
  description: "A person's recent activity across the boards you can see, newest first.",
  input: z.object({
    userId: z.string().uuid(),
    since: z.string().optional().describe('ISO lower bound.'),
    limit: z.number().int().min(1).max(200).optional(),
  }),
  output: z.object({
    events: z.array(
      z.object({
        id: z.string(),
        eventType: z.string(),
        aggregateType: z.string(),
        aggregateId: z.string(),
        occurredAt: z.string(),
      }),
    ),
  }),
  rbac: 'planner.reporting.read',
  execute: async (input, ctx) => {
    const session = await buildActorSession(actorFromContext(ctx));
    return getUserActivity({
      user_id: input.userId,
      session,
      since: input.since,
      limit: input.limit,
    });
  },
});
