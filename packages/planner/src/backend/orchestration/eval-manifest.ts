import type { AgentTool } from '@seta/agent-sdk';
import {
  defineEvalCase,
  defineEvalSuite,
  type EvalManifest,
  type EvalSuite,
} from '@seta/shared-agent-evals';
import { makeQnaTaskQueryAgent } from './agents/task-query.ts';

// The discovery tool is injected as a stub — the deterministic gate never
// executes tools (the runAgent seam returns canned prose, no tool loop).
const stubFindSimilar = { id: 'planner_findSimilarTasks' } as unknown as AgentTool;

export const taskQueryEvalSuite = defineEvalSuite({
  specId: 'planner.qna.taskQuery',
  buildSpec: () =>
    makeQnaTaskQueryAgent({
      resolveModel: () => ({}) as never,
      findSimilarTasksTool: stubFindSimilar,
      // Canned, deterministic "LLM" output — no network, no model.
      runAgent: async ({ input }) => ({ text: `You have open tasks matching: ${input.query}` }),
    }),
  cases: [
    defineEvalCase({
      name: 'lists open tasks in prose',
      layer: 'deterministic',
      input: { query: 'my open tasks' },
      actor: { tenantId: 't1', userId: 'u1' },
    }),
    defineEvalCase({
      name: 'handles a count-style query',
      layer: 'deterministic',
      input: { query: 'how many tasks are assigned to me' },
      actor: { tenantId: 't1', userId: 'u1' },
    }),
  ],
});

export const plannerEvalManifest: EvalManifest = {
  module: '@seta/planner',
  // `EvalSuite<I, O>`'s `run` is contravariant in `I` (like
  // `SpecializedAgentSpec` — see `sdks/agent/src/specialized-agent.ts`'s
  // `SpecializedAgentRegistry.register`), so a concrete suite can't
  // structurally widen into `EvalSuite<unknown, unknown>[]`. Same cast
  // pattern as that registry.
  suites: [taskQueryEvalSuite as EvalSuite],
};
