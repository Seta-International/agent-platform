import { actorFromContext, defineAgentTool } from '@seta/agent-sdk';
import { buildActorSession } from '@seta/identity';
import { z } from 'zod';
import { listPlanTasksByDateRange } from '../domain/list-plan-tasks-by-date-range.ts';

export const plannerGetTimelineTool = defineAgentTool({
  id: 'planner_getTimeline',
  name: 'Get Timeline',
  description:
    "List a plan's tasks across a date window by start/due date for a timeline view. " +
    'Dependency edges are not available yet — dependenciesAvailable is always false.',
  input: z.object({
    planId: z.string().uuid(),
    from: z.string().describe('ISO start of the window (inclusive).'),
    to: z.string().describe('ISO end of the window (inclusive).'),
    limit: z.number().int().min(1).max(200).optional().describe('Page size (default 50).'),
    cursor: z.string().optional().describe('Opaque pagination cursor from a prior call.'),
  }),
  output: z.object({
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
  rbac: 'planner.task.read',
  execute: async (input, ctx) => {
    const session = await buildActorSession(actorFromContext(ctx));

    const result = await listPlanTasksByDateRange(
      {
        plan_id: input.planId,
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
