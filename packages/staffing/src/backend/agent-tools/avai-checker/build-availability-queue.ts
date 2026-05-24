import { actorFromContext, defineCopilotTool } from '@seta/copilot-sdk';
import { z } from 'zod';

// ──────────────────────────────────────────────────────────────────────────────
// Final output shape pushed to the Orchestrator queue.
// One record per user processed by this AvaiChecker run.
// ──────────────────────────────────────────────────────────────────────────────

// Shape of each user after avaiChecker_rankByAvailability (Tool 3).
// Fields are exactly what Tool 3 outputs — nothing added.
export type UserAvailabilityResult = {
  user_id: string;
  name: string | null;
  status: 'available' | 'busy' | 'ooo';
  in_progress_tasks: Array<{
    task_id: string;
    priority: 'urgent' | 'important' | 'medium' | 'low';
  }>;
};

// ──────────────────────────────────────────────────────────────────────────────
// Dependency contract
// ──────────────────────────────────────────────────────────────────────────────

export type BuildAvailabilityQueueDeps = {
  enqueueForOrchestrator: (params: {
    results: UserAvailabilityResult[];
    enqueuedBy: string;
  }) => Promise<{ job_id: string; queue: string; enqueued_at: string }>;
};

// ──────────────────────────────────────────────────────────────────────────────
// Shared item schema
// ──────────────────────────────────────────────────────────────────────────────

const InProgressTaskSchema = z.object({
  task_id: z.string(),
  priority: z.enum(['urgent', 'important', 'medium', 'low']),
});

// Mirrors UserAvailabilityResult — output of avaiChecker_rankByAvailability.
const UserAvailabilityResultSchema = z.object({
  user_id: z.string(),
  name: z.string().nullable(),
  status: z.enum(['available', 'busy', 'ooo']),
  in_progress_tasks: z.array(InProgressTaskSchema),
});

// ──────────────────────────────────────────────────────────────────────────────
// Tool 4 (final) of the AvaiChecker pipeline.
//
// Receives the ranked user list from avaiChecker_rankByAvailability (Tool 3)
// and pushes it to the Orchestrator queue. Order is preserved — highest
// availability first, lowest last.
//
// The Orchestrator receives:
//   [ { user_id, name, status, in_progress_tasks[] } ]  ← ranked high→low
//
// Call this ONCE after avaiChecker_rankByAvailability completes.
// ──────────────────────────────────────────────────────────────────────────────

export function makeAvaiCheckerBuildAvailabilityQueueTool(deps: BuildAvailabilityQueueDeps) {
  return defineCopilotTool({
    id: 'avaiChecker_buildAvailabilityQueue',
    name: 'Build Availability Queue',
    description: `
Final tool in the AvaiChecker pipeline (Tool 4).

Receives the ranked user list from avaiChecker_rankByAvailability and pushes
it to the Orchestrator queue. The list order must be preserved exactly as
received — highest availability first, lowest availability last.

Pass the ranked_users array from avaiChecker_rankByAvailability directly
into the results field here without reordering.

Call this ONCE after avaiChecker_rankByAvailability completes.
      `.trim(),

    input: z.object({
      results: z
        .array(UserAvailabilityResultSchema)
        .min(1)
        .describe(
          'One entry per user. Combine the outputs of ' +
            'avaiChecker_checkUserAvailability and avaiChecker_checkInProgressTasks ' +
            'for each user_id before passing here.',
        ),
    }),

    output: z.object({
      // Enqueue confirmation.
      job_id: z.string(),
      queue: z.string(),
      enqueued_at: z.string(),
      // Summary for TrustLayer / logging.
      user_count: z.number().int(),
      // Full payload echoed back — order preserved from Tool 3.
      payload: z.array(UserAvailabilityResultSchema),
    }),

    rbac: 'planner.task.read',

    execute: async (input, ctx) => {
      const actor = actorFromContext(ctx);

      // Push to Orchestrator queue — order from Tool 3 preserved.
      const enqueue = await deps.enqueueForOrchestrator({
        results: input.results,
        enqueuedBy: actor.user_id,
      });

      return {
        job_id: enqueue.job_id,
        queue: enqueue.queue,
        enqueued_at: enqueue.enqueued_at,
        user_count: input.results.length,
        payload: input.results,
      };
    },
  });
}
