import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { actorFromContext, RequestContextSchema, registerToolPermission } from '../_types.ts';

// ──────────────────────────────────────────────────────────────────────────────
// In-progress task shape
//
// Subset of TaskRow fields relevant to workload assessment.
// Fields come directly from planner.tasks — no invented columns.
// ──────────────────────────────────────────────────────────────────────────────

export type InProgressTask = {
  id: string;
  title: string;
  priority: 'urgent' | 'important' | 'medium' | 'low';
  due_at: string | null;
  plan_id: string;
};

// ──────────────────────────────────────────────────────────────────────────────
// Dependency contract
// ──────────────────────────────────────────────────────────────────────────────

export type CheckInProgressTasksDeps = {
  /**
   * Wraps listTasks() from @seta/planner.
   * Caller resolves SessionScope from userId internally.
   */
  getInProgressTasks: (params: {
    userId: string;
    filters: { assignee_id: string; progress: string };
  }) => Promise<InProgressTask[]>;
};

// ──────────────────────────────────────────────────────────────────────────────
// Tool 2 of the AvaiChecker pipeline.
//
// Queries planner.tasks for tasks currently assigned to the user with
// progress = 'in_progress'. Returns the tasks with their priority so the
// aggregation step can compute workload weight.
// ──────────────────────────────────────────────────────────────────────────────

export function makeAvaiCheckerCheckInProgressTasksTool(deps: CheckInProgressTasksDeps) {
  return registerToolPermission(
    createTool({
      id: 'avaiChecker_checkInProgressTasks',
      description: `
Second tool in the AvaiChecker pipeline.

Queries the planner.tasks table for tasks currently assigned to the given
user_id with progress = 'in_progress'. Returns each task's id, title,
priority, and due_at so the final step can assess current workload.

Call this for the same user_id used in avaiChecker_checkUserAvailability.
Pass the result to avaiChecker_buildAvailabilityQueue.
      `.trim(),

      inputSchema: z.object({
        user_id: z.string().uuid().describe('user_id from the Orchestrator queue payload.'),
      }),

      // Output mirrors planner.tasks columns — no invented fields.
      outputSchema: z.object({
        user_id: z.string(),
        in_progress_tasks: z.array(
          z.object({
            id: z.string(),
            title: z.string(),
            priority: z.enum(['urgent', 'important', 'medium', 'low']),
            due_at: z.string().nullable(),
            plan_id: z.string(),
          }),
        ),
        task_count: z.number().int(),
      }),

      requestContextSchema: RequestContextSchema,

      execute: async (input, ctx) => {
        actorFromContext(ctx); // enforce authentication

        const tasks = await deps.getInProgressTasks({
          userId: input.user_id,
          filters: { assignee_id: input.user_id, progress: 'in_progress' },
        });

        return {
          user_id: input.user_id,
          in_progress_tasks: tasks,
          task_count: tasks.length,
        };
      },
    }),
    'planner.task.read',
  );
}
