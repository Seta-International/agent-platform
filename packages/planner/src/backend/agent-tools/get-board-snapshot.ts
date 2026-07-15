import { actorFromContext, defineAgentTool } from '@seta/agent-sdk';
import { buildActorSession } from '@seta/identity';
import { z } from 'zod';
import { getPlan } from '../domain/get-plan.ts';
import { getPlanChartData } from '../domain/get-plan-chart-data.ts';
import { listBuckets } from '../domain/list-buckets.ts';

export const plannerGetBoardSnapshotTool = defineAgentTool({
  id: 'planner_getBoardSnapshot',
  name: 'Get Board Snapshot',
  description:
    'Current state of a plan (board): its buckets/columns and task counts by status and priority.',
  input: z.object({ planId: z.string().uuid() }),
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

    const [plan, bucketRows, chart] = await Promise.all([
      getPlan({ plan_id: input.planId, session }),
      listBuckets({ plan_id: input.planId, session }),
      getPlanChartData({ plan_id: input.planId }, session),
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
