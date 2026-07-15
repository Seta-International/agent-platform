import type { AgentTool } from '@seta/agent-sdk';
import {
  defineEvalCase,
  defineEvalSuite,
  type EvalManifest,
  type EvalSuite,
} from '@seta/shared-agent-evals';
import { makeQnaGeneralAnswerAgent } from './agents/general-answer.ts';
import { makeQnaTaskQueryAgent } from './agents/task-query.ts';
import { makeAvaiCheckerAgent } from './assignment/agents/avai-checker.ts';
import { makeRecommenderAgent } from './assignment/agents/recommender.ts';
import type { AvailabilityPort } from './assignment/ports.ts';
import { makeQnaOrchestrator } from './orchestrator.ts';
import { makeWeeklyPlanOrchestrator } from './weekly-plan/orchestrator.ts';

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

// Trust envelope shared by the stubbed sub-agents below — its shape is never
// asserted on (the orchestrator suites only score the outer AgentResult), it
// just needs to satisfy the `run` return type.
const STUB_SUB_AGENT_TRUST = { reasoningTrace: [], evidenceCitations: [], confidenceScore: 0.6 };

/**
 * A sub-agent stub whose `run()` is never actually invoked by the orchestrator
 * suites below: both orchestrators' `streamAgent` seam bypasses the tool loop
 * entirely (same seam exercised by
 * `packages/planner/tests/unit/orchestration/weekly-plan/orchestrator.test.ts`),
 * so this only needs to satisfy the deps' structural shape.
 */
const stubSubAgent = (id: string) =>
  ({
    id,
    description: 'stub',
    inputSchema: {} as never,
    outputSchema: {} as never,
    run: async () => ({ result: {} as never, trust: STUB_SUB_AGENT_TRUST }),
  }) as never;

export const qnaOrchestratorEvalSuite = defineEvalSuite({
  specId: 'planner.qna.orchestrator',
  buildSpec: () =>
    makeQnaOrchestrator({
      taskQuery: stubSubAgent('planner.qna.taskQuery'),
      taskDetail: stubSubAgent('planner.qna.taskDetail'),
      teamInfo: stubSubAgent('planner.qna.teamInfo'),
      generalAnswer: stubSubAgent('planner.qna.generalAnswer'),
      resolveModel: () => ({}) as never,
      // Test seam — replaces agent.stream()/the model call outright, so the
      // tool loop (and thus the stub sub-agents above) is never invoked.
      streamAgent: () => ({ text: Promise.resolve('You have 3 open tasks due this week.') }),
    }),
  cases: [
    defineEvalCase({
      name: 'answers a Q&A turn via the streamAgent seam',
      layer: 'deterministic',
      input: { userText: 'what are my open tasks?', taskId: null },
      actor: { tenantId: 't1', userId: 'u1' },
    }),
  ],
});

export const weeklyPlanOrchestratorEvalSuite = defineEvalSuite({
  specId: 'planner.weeklyPlan.orchestrator',
  buildSpec: () =>
    makeWeeklyPlanOrchestrator({
      collector: stubSubAgent('planner.weeklyPlan.taskCollector'),
      builder: stubSubAgent('planner.weeklyPlan.scheduleBuilder'),
      insighter: stubSubAgent('planner.weeklyPlan.insightGenerator'),
      resolveModel: () => ({}) as never,
      now: () => new Date('2026-07-08T09:00:00Z'), // a Wednesday — pins the window
      // Test seam — replaces agent.stream()/the model call outright, so the
      // tool loop (and thus the stub sub-agents above) is never invoked.
      streamAgent: () => ({ text: Promise.resolve('Here is your weekly plan.') }),
    }),
  cases: [
    defineEvalCase({
      name: 'answers a weekly-plan turn via the streamAgent seam',
      layer: 'deterministic',
      input: { userText: 'plan my week', taskId: null },
      actor: { tenantId: 't1', userId: 'u1' },
    }),
  ],
});

export const taskQueryQualitySuite = defineEvalSuite({
  specId: 'planner.qna.taskQuery',
  // Deterministic build kept for type-completeness (canned seam, LLM-free).
  buildSpec: () =>
    makeQnaTaskQueryAgent({
      resolveModel: () => ({}) as never,
      findSimilarTasksTool: stubFindSimilar,
      runAgent: async ({ input }) => ({ text: `re: ${input.query}` }),
    }),
  // Quality build: NO runAgent seam ⇒ the real Agent + tool loop runs; every
  // tool is a per-case mock so nothing hits the DB. runQualityEvals sets ctx.model.
  buildQualitySpec: (mocks) => {
    const tool = (id: string) => mocks.find((m) => (m as { id: string }).id === id) as AgentTool;
    return makeQnaTaskQueryAgent({
      resolveModel: () => ({}) as never,
      findSimilarTasksTool: tool('planner_findSimilarTasks'),
      queryTasksTool: tool('planner_queryTasks'),
      getOpenTaskCountTool: tool('planner_getOpenTaskCountForUser'),
      resolveMemberTool: tool('planner_resolveMember'),
    });
  },
  cases: [
    defineEvalCase({
      name: "lists the user's open tasks from queried evidence",
      layer: 'quality',
      input: { query: 'what are my open tasks?' },
      actor: { tenantId: 't1', userId: 'u1' },
      toolMocks: [
        {
          toolId: 'planner_queryTasks',
          respond: () => [
            { taskId: 't-1', title: 'Ship billing migration', status: 'in_progress' },
          ],
        },
        { toolId: 'planner_findSimilarTasks', respond: () => [] },
        { toolId: 'planner_getOpenTaskCountForUser', respond: () => ({ count: 1 }) },
        { toolId: 'planner_resolveMember', respond: () => [] },
      ],
    }),
  ],
});

export const generalAnswerQualitySuite = defineEvalSuite({
  specId: 'planner.qna.generalAnswer',
  // Deterministic build is unused for this quality-only suite, but the type
  // requires it; a canned-seam build keeps it LLM-free if ever run.
  buildSpec: () =>
    makeQnaGeneralAnswerAgent({
      resolveModel: () => ({}) as never,
      runAgent: async ({ input }) => ({ text: `re: ${input.query}` }),
    }),
  // Quality build: NO runAgent seam ⇒ the real Mastra Agent + model path runs.
  // resolveModel is a safety fallback; runQualityEvals sets ctx.model, which wins.
  buildQualitySpec: () =>
    makeQnaGeneralAnswerAgent({
      resolveModel: () => ({}) as never,
    }),
  cases: [
    defineEvalCase({
      name: 'summarizes open tasks relevantly',
      layer: 'quality',
      input: { query: 'how many open tasks do I have this week?' },
      actor: { tenantId: 't1', userId: 'u1' },
    }),
    defineEvalCase({
      name: 'stays on-topic for a planning question',
      layer: 'quality',
      input: { query: 'what should I focus on first?' },
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
  suites: [
    taskQueryEvalSuite as EvalSuite,
    avaiCheckerEvalSuite as EvalSuite,
    recommenderEvalSuite as EvalSuite,
    qnaOrchestratorEvalSuite as EvalSuite,
    weeklyPlanOrchestratorEvalSuite as EvalSuite,
    generalAnswerQualitySuite as EvalSuite,
    taskQueryQualitySuite as EvalSuite,
  ],
};
