import { actorFromContext, defineAgentTool } from '@seta/agent-sdk';
import { buildActorSession } from '@seta/identity';
import { z } from 'zod';
import { getPlanChartData } from '../domain/get-plan-chart-data.ts';
import { listGroupPlansWithRollups } from '../domain/list-group-plans-with-rollups.ts';

export const plannerGetStatsTool = defineAgentTool({
  id: 'planner_getStats',
  name: 'Get Stats',
  description:
    'Aggregate task metrics for a plan (planId) or a whole group (groupId): ' +
    'totals and status breakdowns.',
  input: z
    .object({
      planId: z.string().uuid().optional(),
      groupId: z.string().uuid().optional(),
    })
    .refine((v) => Boolean(v.planId) !== Boolean(v.groupId), {
      message: 'Provide exactly one of planId or groupId.',
    }),
  output: z.object({
    scope: z.enum(['plan', 'group']),
    totalTasks: z.number(),
    byStatus: z.object({
      notStarted: z.number(),
      inProgress: z.number(),
      completed: z.number(),
    }),
  }),
  rbac: 'planner.reporting.read',
  execute: async (input, ctx) => {
    const session = await buildActorSession(actorFromContext(ctx));

    if (input.planId) {
      const chart = await getPlanChartData({ plan_id: input.planId }, session);
      const { kpis } = chart;
      return {
        scope: 'plan' as const,
        totalTasks: kpis.total,
        byStatus: {
          notStarted: kpis.not_started,
          inProgress: kpis.in_progress,
          completed: kpis.completed,
        },
      };
    }

    const rollups = await listGroupPlansWithRollups({
      group_id: input.groupId!,
      session,
    });

    const agg = rollups.reduce(
      (a, p) => ({
        notStarted: a.notStarted + p.not_started_count,
        inProgress: a.inProgress + p.in_progress_count,
        completed: a.completed + p.completed_count,
      }),
      { notStarted: 0, inProgress: 0, completed: 0 },
    );

    return {
      scope: 'group' as const,
      totalTasks: agg.notStarted + agg.inProgress + agg.completed,
      byStatus: agg,
    };
  },
});
