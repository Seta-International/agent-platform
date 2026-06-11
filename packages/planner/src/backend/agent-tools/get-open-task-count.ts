import { type CrossModuleReadToolSpec, defineCrossModuleReadAsTool } from '@seta/agent-sdk';
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
 * style agent self-summary flows.
 */
export const plannerGetOpenTaskCountSpec: CrossModuleReadToolSpec<
  GetOpenTaskCountInput,
  GetOpenTaskCountOutput
> = {
  id: 'planner_getOpenTaskCountForUser',
  description:
    'Count of open (not completed, not deleted) tasks currently assigned to a user.\n\n' +
    'Use for: workload comparison when ranking candidates; "how many open tasks does X have?".\n' +
    'Do NOT use when you need the task list — use planner_queryTasks with assigneeUserId instead.',
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

/**
 * LLM-visible Mastra tool wrapper that derives `session` from `requestContext`.
 * Specialists register this on their `tools` record; the underlying `*Spec`
 * remains the source of truth for non-LLM callers (the assignBySkill workflow).
 */
export const plannerGetOpenTaskCountTool = defineCrossModuleReadAsTool({
  id: plannerGetOpenTaskCountSpec.id,
  name: 'Open Task Count',
  description:
    'Count of open (not completed, not deleted) tasks currently assigned to a user.\n\n' +
    'Use for: workload comparison when ranking candidates; "how many open tasks does X have?".\n' +
    'Do NOT use when you need the task list — use planner_queryTasks with assigneeUserId instead.',
  inputSchema,
  outputSchema,
  rbac: plannerGetOpenTaskCountSpec.rbac,
  execute: plannerGetOpenTaskCountSpec.execute,
});
