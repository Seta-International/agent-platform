import { actorFromContext, defineAgentTool } from '@seta/agent-sdk';
import { buildActorSession } from '@seta/identity';
import { z } from 'zod';
import { listBuckets } from '../domain/list-buckets.ts';
import { resolvePlanScope } from './resolve-scope.ts';

export const plannerListBucketsTool = defineAgentTool({
  id: 'planner_listBuckets',
  name: 'List Buckets',
  description:
    'List the buckets (columns) in a plan, in board order.\n\n' +
    'Use for: "what buckets are in this plan?", "show me the columns of plan X".\n' +
    'Resolves planId automatically: provide planName for name-based lookup, or omit both ' +
    'to auto-resolve when the user has exactly one plan.\n' +
    'Read-only.',
  input: z.object({
    planId: z
      .string()
      .uuid()
      .optional()
      .describe('The plan UUID. Optional if planName is provided or user has exactly one plan.'),
    planName: z.string().optional().describe('Plan name (case-insensitive substring match).'),
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

    const resolved = await resolvePlanScope(session, {
      planId: input.planId,
      planName: input.planName,
    });
    if ('notFound' in resolved) {
      return { error: 'No accessible plan found matching that criteria.' } as never;
    }
    if ('ambiguous' in resolved) {
      const names = resolved.options.map((o) => o.name).join(', ');
      return { error: `Multiple plans found: ${names}. Please specify which one.` } as never;
    }

    const planId = resolved.id;
    const rows = await listBuckets({ plan_id: planId, session });
    return {
      buckets: rows.map((b) => ({ id: b.id, name: b.name, planId: b.plan_id })),
    };
  },
});
