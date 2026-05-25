import type { CrossModuleReadToolSpec } from '@seta/copilot-sdk';
import { and, count, eq, isNull, lt } from 'drizzle-orm';
import { z } from 'zod';
import { plannerDb } from '../db/index.ts';
import { taskAssignments, tasks } from '../db/schema.ts';

const inputSchema = z.object({
  userId: z.string().uuid().describe('Assignee user id'),
});

const outputSchema = z.object({
  openCount: z.number().int().min(0),
});

export type GetOpenTaskCountInput = z.infer<typeof inputSchema>;
export type GetOpenTaskCountOutput = z.infer<typeof outputSchema>;

/**
 * Cross-module read tool: count of open tasks currently assigned to a user
 * in the caller's tenant. "Open" = not soft-deleted and percent_complete < 100.
 *
 * Consumed by planner.assignBySkill (load signal) and `should I take this on`
 * style copilot self-summary flows.
 */
export const plannerGetOpenTaskCountSpec: CrossModuleReadToolSpec<
  GetOpenTaskCountInput,
  GetOpenTaskCountOutput
> = {
  id: 'planner_getOpenTaskCountForUser',
  description:
    'Returns the count of open tasks (percent_complete < 100, not soft-deleted) ' +
    'currently assigned to a user in the caller tenant.',
  inputSchema,
  outputSchema,
  rbac: 'planner.task.read.tenant',
  availableTo: 'all-specialists',
  execute: async ({ session, input }) => {
    const parsed = inputSchema.parse(input);
    const [row] = await plannerDb()
      .select({ n: count() })
      .from(taskAssignments)
      .innerJoin(tasks, eq(tasks.id, taskAssignments.task_id))
      .where(
        and(
          eq(taskAssignments.user_id, parsed.userId),
          eq(tasks.tenant_id, session.tenant_id),
          isNull(tasks.deleted_at),
          lt(tasks.percent_complete, 100),
        ),
      );
    return { openCount: Number(row?.n ?? 0) };
  },
};
