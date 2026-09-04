import { actorFromContext, defineAgentTool } from '@seta/agent-sdk';
import { buildActorSession } from '@seta/identity';
import { z } from 'zod';
import { getPlanChartData } from '../domain/get-plan-chart-data.ts';
import { listGroupPlansWithRollups } from '../domain/list-group-plans-with-rollups.ts';
import {
  archivedGroupError,
  resolveGroupScope,
  resolvePlanScope,
  withScopeError,
} from './resolve-scope.ts';

export const plannerGetStatsTool = defineAgentTool({
  id: 'planner_getStats',
  name: 'Get Stats',
  description:
    'Aggregate task metrics for a plan or a whole group: totals and status breakdowns.\n' +
    'Supports name-based lookup: pass planName/groupName instead of UUIDs.\n' +
    'Omit all to auto-resolve when the user has exactly one group.',
  input: z
    .object({
      planId: z.string().uuid().optional(),
      planName: z.string().optional(),
      groupId: z.string().uuid().optional(),
      groupName: z.string().optional(),
    })
    .refine(
      (v) => {
        const hasPlan = Boolean(v.planId || v.planName);
        const hasGroup = Boolean(v.groupId || v.groupName);
        return hasPlan !== hasGroup || (!hasPlan && !hasGroup);
      },
      {
        message:
          'Provide plan (planId/planName) OR group (groupId/groupName), or omit all to auto-resolve.',
      },
    ),
  output: withScopeError(
    z.object({
      scope: z.enum(['plan', 'group']),
      totalTasks: z.number(),
      byStatus: z.object({
        notStarted: z.number(),
        inProgress: z.number(),
        completed: z.number(),
      }),
    }),
  ),
  rbac: 'planner.reporting.read',
  execute: async (input, ctx) => {
    const session = await buildActorSession(actorFromContext(ctx));

    if (input.planId || input.planName) {
      const resolved = await resolvePlanScope(session, {
        planId: input.planId,
        planName: input.planName,
      });
      if ('notFound' in resolved) {
        return { error: 'No accessible plan found matching that criteria.' };
      }
      if ('ambiguous' in resolved) {
        const names = resolved.options.map((o) => o.name).join(', ');
        return { error: `Multiple plans found: ${names}. Please specify which one.` };
      }

      const chart = await getPlanChartData({ plan_id: resolved.id }, session);
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

    const resolved = await resolveGroupScope(session, {
      groupId: input.groupId,
      groupName: input.groupName,
    });
    if ('notFound' in resolved) {
      return { error: 'No accessible group found matching that criteria.' };
    }
    if ('archived' in resolved) {
      return { error: archivedGroupError(resolved.name) };
    }
    if ('ambiguous' in resolved) {
      const names = resolved.options.map((o) => o.name).join(', ');
      return { error: `Multiple groups found: ${names}. Please specify which one.` };
    }

    const rollups = await listGroupPlansWithRollups({
      group_id: resolved.id,
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
