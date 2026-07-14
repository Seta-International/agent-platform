import type { AgentTool } from '@seta/agent-sdk';
import {
  defineEvalCase,
  defineEvalSuite,
  type EvalManifest,
  type EvalSuite,
} from '@seta/shared-agent-evals';
import { makeQnaTaskQueryAgent } from './agents/task-query.ts';
import { makeAvaiCheckerAgent } from './assignment/agents/avai-checker.ts';
import { makeRecommenderAgent } from './assignment/agents/recommender.ts';
import type { AvailabilityPort } from './assignment/ports.ts';

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

// Deterministic availability port: user 'u1' is available with no WIP → score 1.
const fakeAvailability: AvailabilityPort = {
  status: async () => ({ status: 'available', name: 'Ada', note: '' }),
  inProgressCount: async () => 0,
};

export const avaiCheckerEvalSuite = defineEvalSuite({
  specId: 'staffing.avaiChecker',
  buildSpec: () => makeAvaiCheckerAgent({ availability: fakeAvailability }),
  cases: [
    defineEvalCase({
      name: 'available + no WIP → score 1',
      layer: 'deterministic',
      input: {
        taskId: '11111111-1111-1111-1111-111111111111',
        candidates: [
          {
            userId: 'u1',
            name: 'Ada',
            skills: ['ts'],
            role: 'eng',
            skillMatch: ['ts'],
            skillMatchCount: 1,
            relevanceScore: 1,
            rank: 1,
          },
        ],
      },
      actor: { tenantId: 't1', userId: 'requester' },
      groundTruth: {
        taskId: '11111111-1111-1111-1111-111111111111',
        availability: [
          {
            userId: 'u1',
            name: 'Ada',
            status: 'available',
            inProgressCount: 0,
            availabilityScore: 1,
          },
        ],
      },
    }),
  ],
});

export const recommenderEvalSuite = defineEvalSuite({
  specId: 'staffing.recommender',
  buildSpec: () => makeRecommenderAgent(),
  cases: [
    defineEvalCase({
      name: 'blends 0.7*rel + 0.3*avail and ranks',
      layer: 'deterministic',
      input: {
        taskId: '22222222-2222-2222-2222-222222222222',
        skills: ['ts'],
        candidates: [
          {
            userId: 'u1',
            name: 'Ada',
            skills: ['ts'],
            role: 'eng',
            skillMatch: ['ts'],
            skillMatchCount: 1,
            relevanceScore: 1,
            rank: 1,
          },
        ],
        availability: [
          {
            userId: 'u1',
            name: 'Ada',
            status: 'available' as const,
            inProgressCount: 0,
            availabilityScore: 1,
          },
        ],
      },
      actor: { tenantId: 't1', userId: 'requester' },
      groundTruth: {
        taskId: '22222222-2222-2222-2222-222222222222',
        recommendations: [
          {
            userId: 'u1',
            name: 'Ada',
            skillMatch: ['ts'],
            skillMatchCount: 1,
            status: 'available',
            availabilityScore: 1,
            relevanceScore: 1,
            score: 1,
          },
        ],
      },
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
  suites: [
    taskQueryEvalSuite as EvalSuite,
    avaiCheckerEvalSuite as EvalSuite,
    recommenderEvalSuite as EvalSuite,
  ],
};
