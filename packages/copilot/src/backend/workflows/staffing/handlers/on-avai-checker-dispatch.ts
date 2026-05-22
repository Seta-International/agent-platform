import { makeAvaiCheckerEnqueue } from '../enqueue.ts';
import { AvaiCheckerDispatchSchema } from '../types.ts';

// ──────────────────────────────────────────────────────────────────────────────
// Handler: staffing:avai_checker_dispatch
//
// Triggered when SkillMatcher pushes ranked candidates to the staffing workflow queue.
// Invokes the AvaiChecker agent with the list of candidate user_ids.
//
// The agent runs its 4-tool pipeline (check-user-availability →
// check-inprogress-tasks → rank-by-availability → build-availability-queue).
// The last tool calls enqueueForOrchestrator (injected here) which creates
// the staffing:recommend_dispatch job, carrying the full accumulated context
// (required_skills + skill_candidates + availability_results) to the final step.
// ──────────────────────────────────────────────────────────────────────────────

type AddJob = (identifier: string, payload?: unknown) => Promise<void>;

export type AvaiCheckerDispatchDeps = {
  /**
   * Runs the AvaiChecker Mastra agent for the given candidate list.
   * The agent executes its tool pipeline internally for each user_id.
   * `enqueueForOrchestrator` must be injected into the agent's
   * makeAvaiCheckerBuildAvailabilityQueueTool before invocation.
   */
  runAvaiCheckerAgent: (params: {
    task_id: string;
    user_ids: string[];
    enqueueForOrchestrator: ReturnType<typeof makeAvaiCheckerEnqueue>;
  }) => Promise<void>;
};

export function makeAvaiCheckerDispatchHandler(deps: AvaiCheckerDispatchDeps) {
  return async (rawPayload: unknown, helpers: { addJob: AddJob }) => {
    const { task_id, required_skills, skill_candidates } =
      AvaiCheckerDispatchSchema.parse(rawPayload);

    const user_ids = skill_candidates.map((c) => c.user_id);

    // Build enqueue dep scoped to this job — closes over task_id, required_skills,
    // and skill_candidates so they are forwarded to the Recommender dispatch payload.
    const enqueueForOrchestrator = makeAvaiCheckerEnqueue(
      { task_id, required_skills, skill_candidates },
      { addJob: helpers.addJob },
    );

    await deps.runAvaiCheckerAgent({
      task_id,
      user_ids,
      enqueueForOrchestrator,
    });
  };
}
