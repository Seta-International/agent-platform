import { actorFromContext, defineAgentTool } from '@seta/agent-sdk';
import { buildActorSession } from '@seta/identity';
import { z } from 'zod';
import { getGroupWorkload } from '../domain/get-group-workload.ts';

export const plannerGetWorkloadTool = defineAgentTool({
  id: 'planner_getWorkload',
  name: 'Get Workload',
  description: 'Per-person open-task counts across a group, busiest first.',
  input: z.object({ groupId: z.string().uuid() }),
  output: z.object({
    rows: z.array(
      z.object({
        userId: z.string(),
        displayName: z.string(),
        openTaskCount: z.number(),
      }),
    ),
  }),
  rbac: 'planner.reporting.read',
  execute: async (input, ctx) => {
    const session = await buildActorSession(actorFromContext(ctx));
    return getGroupWorkload({ group_id: input.groupId, session });
  },
});
