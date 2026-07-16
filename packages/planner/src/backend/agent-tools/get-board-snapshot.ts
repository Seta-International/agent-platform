import { actorFromContext, defineAgentTool } from '@seta/agent-sdk';
import { buildActorSession } from '@seta/identity';
import { z } from 'zod';
import { getPlan } from '../domain/get-plan.ts';
import { getPlanChartData } from '../domain/get-plan-chart-data.ts';
import { listBuckets } from '../domain/list-buckets.ts';
import { resolvePlanScope } from './resolve-scope.ts';

export const plannerGetBoardSnapshotTool = defineAgentTool({
  id: 'planner_getBoardSnapshot',
  name: 'Get Board Snapshot',
  description:
    'Current state of a plan (board): its buckets/columns and task counts by status and priority.\n' +
    'Resolves planId automatically: provide planName for name-based lookup, or omit both ' +
    'to auto-resolve when the user has exactly one plan.',
  input: z.object({
    planId: z
      .string()
      .uuid()
      .optional()
      .describe('The plan UUID. Optional if planName is provided or user has exactly one plan.'),
    planName: z.string().optional().describe('Plan name (case-insensitive substring match).'),
  }),
  output: z.object({
    plan: z.object({ planId: z.string(), name: z.string(), groupId: z.string() }),
    buckets: z.array(z.object({ id: z.string(), name: z.string() })),
    counts: z.object({
      notStarted: z.number(),
      inProgress: z.number(),
      completed: z.number(),
      total: z.number(),
    }),
  }),
  rbac: 'planner.reporting.read',
  execute: async (input, ctx) => {
    const session = await buildActorSession(actorFromContext(ctx));

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

    const [plan, bucketRows, chart] = await Promise.all([
      getPlan({ plan_id: planId, session }),
      listBuckets({ plan_id: planId, session }),
      getPlanChartData({ plan_id: planId }, session),
    ]);

    const { kpis } = chart;

    return {
      plan: { planId: plan.id, name: plan.name, groupId: plan.group_id },
      buckets: bucketRows.map((b) => ({ id: b.id, name: b.name })),
      counts: {
        notStarted: kpis.not_started,
        inProgress: kpis.in_progress,
        completed: kpis.completed,
        total: kpis.total,
      },
    };
  },
});
