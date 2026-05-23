import { makeSkillMatcherEnqueue } from '../enqueue.ts';
import { SkillMatcherDispatchSchema } from '../types.ts';

// ──────────────────────────────────────────────────────────────────────────────
// Handler: staffing:skill_matcher_dispatch
//
// Triggered when TaskAnalyzer pushes a task to the staffing workflow queue.
// Invokes the SkillMatcher agent with the task context.
//
// The agent runs its 4-tool pipeline (format-query → context-search →
// llm-parser → rank-candidates). The last tool calls enqueueForOrchestrator
// (injected here) which creates the staffing:avai_checker_dispatch job,
// carrying required_skills forward to the next step.
// ──────────────────────────────────────────────────────────────────────────────

type AddJob = (identifier: string, payload?: unknown) => Promise<void>;

export type SkillMatcherDispatchDeps = {
  /**
   * Runs the SkillMatcher Mastra agent for the given task.
   * The agent executes its tool pipeline internally.
   * `enqueueForOrchestrator` must be injected into the agent's
   * makeSkillMatcherRankCandidatesTool before the agent is invoked.
   */
  runSkillMatcherAgent: (params: {
    task_id: string;
    title: string;
    required_skills: string[];
    enqueueForOrchestrator: ReturnType<typeof makeSkillMatcherEnqueue>;
    rolePriority: Record<string, number>;
  }) => Promise<void>;

  rolePriority: Record<string, number>;
};

export function makeSkillMatcherDispatchHandler(deps: SkillMatcherDispatchDeps) {
  return async (rawPayload: unknown, helpers: { addJob: AddJob }) => {
    const { task_id, title, required_skills } = SkillMatcherDispatchSchema.parse(rawPayload);

    // Build enqueue dep scoped to this job — closes over required_skills
    // so it is forwarded to the AvaiChecker dispatch payload.
    const enqueueForOrchestrator = makeSkillMatcherEnqueue(
      { required_skills },
      { addJob: helpers.addJob },
    );

    await deps.runSkillMatcherAgent({
      task_id,
      title,
      required_skills,
      enqueueForOrchestrator,
      rolePriority: deps.rolePriority,
    });
  };
}
