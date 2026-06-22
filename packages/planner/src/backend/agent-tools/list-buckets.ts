import { actorFromContext, defineAgentTool } from '@seta/agent-sdk';
import { buildActorSession } from '@seta/identity';
import { z } from 'zod';
import { listBuckets } from '../domain/list-buckets.ts';

export const plannerListBucketsTool = defineAgentTool({
  id: 'planner_listBuckets',
  name: 'List Buckets',
  description:
    'List the buckets (columns) in a plan, in board order.\n\n' +
    'Use for: "what buckets are in this plan?", "show me the columns of plan X". ' +
    'Requires a planId — resolve it from page context or a prior planner_listPlans result.\n' +
    'Read-only.',
  input: z.object({
    planId: z.string().uuid().describe('The plan whose buckets to list'),
  }),
  output: z.object({
    buckets: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        planId: z.string(),
      }),
    ),
  }),
  rbac: 'planner.bucket.read',
  execute: async (input, ctx) => {
    const actor = actorFromContext(ctx);
    const session = await buildActorSession(actor);
    const rows = await listBuckets({ plan_id: input.planId, session });
    return {
      buckets: rows.map((b) => ({ id: b.id, name: b.name, planId: b.plan_id })),
    };
  },
});
