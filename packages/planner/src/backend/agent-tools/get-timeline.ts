import { actorFromContext, defineAgentTool } from '@seta/agent-sdk';
import { buildActorSession } from '@seta/identity';
import { z } from 'zod';
import { listPlanTasksByDateRange } from '../domain/list-plan-tasks-by-date-range.ts';
import { resolvePlanScope, withScopeError } from './resolve-scope.ts';

export const plannerGetTimelineTool = defineAgentTool({
  id: 'planner_getTimeline',
  name: 'Get Timeline',
  description:
    "List a plan's tasks across a date window by start/due date for a timeline view. " +
    'Dependency edges are not available yet — dependenciesAvailable is always false.\n' +
    'Resolves planId automatically: provide planName for name-based lookup, or omit both ' +
    'to auto-resolve when the user has exactly one plan.',
  input: z.object({
    planId: z
      .string()
      .uuid()
      .optional()
      .describe('The plan UUID. Optional if planName is provided or user has exactly one plan.'),
    planName: z.string().optional().describe('Plan name (case-insensitive substring match).'),
    from: z.string().describe('ISO start of the window (inclusive).'),
    to: z.string().describe('ISO end of the window (inclusive).'),
    limit: z.number().int().min(1).max(200).optional().describe('Page size (default 50).'),
    cursor: z.string().optional().describe('Opaque pagination cursor from a prior call.'),
  }),
  output: withScopeError(
    z.object({
      items: z.array(
        z.object({
          taskId: z.string(),
          title: z.string(),
          startAt: z.string().nullable(),
          dueAt: z.string().nullable(),
        }),
      ),
      totalCount: z.number(),
      nextCursor: z.string().nullable(),
      dependenciesAvailable: z.literal(false),
    }),
  ),
  rbac: 'planner.task.read',
  execute: async (input, ctx) => {
    const session = await buildActorSession(actorFromContext(ctx));

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

    const planId = resolved.id;

    const result = await listPlanTasksByDateRange(
      {
        plan_id: planId,
        from: input.from,
        to: input.to,
        limit: input.limit,
        cursor: input.cursor,
      },
      session,
    );

    return {
      items: result.tasks.map((t) => ({
        taskId: t.id,
        title: t.title,
        startAt: t.start_at,
        dueAt: t.due_at,
      })),
      totalCount: result.total_count,
      nextCursor: result.next_cursor ?? null,
      dependenciesAvailable: false as const,
    };
  },
});
