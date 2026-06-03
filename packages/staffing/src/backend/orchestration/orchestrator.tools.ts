import type { SpecializedAgentRunCtx, SpecializedAgentSpec } from '@seta/agent-sdk';
import { defineAgentTool } from '@seta/agent-sdk';
import { z } from 'zod';
import {
  type AvailabilityResult,
  AvailabilityResultSchema,
  type RankedCandidate,
  RankedCandidateSchema,
  type Recommendation,
  RecommendationSchema,
  type TaskAnalyzerOutput,
  TaskSummarySchema,
} from './schemas.ts';

type TaskAnalyzerSpec = SpecializedAgentSpec<
  { query: string; taskId: string | null },
  TaskAnalyzerOutput
>;
type SkillMatcherSpec = SpecializedAgentSpec<
  { taskId: string; skills: string[] },
  { taskId: string; candidates: RankedCandidate[] }
>;
type AvaiCheckerSpec = SpecializedAgentSpec<
  { taskId: string; candidates: RankedCandidate[] },
  { taskId: string; availability: AvailabilityResult[] }
>;
type RecommenderSpec = SpecializedAgentSpec<
  // availability is now produced by the avaiChecker step and passed through.
  {
    taskId: string;
    skills: string[];
    candidates: RankedCandidate[];
    availability: AvailabilityResult[];
  },
  { taskId: string; recommendations: Recommendation[] }
>;

export interface OrchestratorToolDeps {
  taskAnalyzer: TaskAnalyzerSpec;
  skillMatcher: SkillMatcherSpec;
  avaiChecker: AvaiCheckerSpec;
  recommender: RecommenderSpec;
  /** The orchestrator's run ctx: provides tenant/actor/abort + the onEvent sink. */
  ctx: SpecializedAgentRunCtx;
}

/** Build the four sub-agent delegation tools, bound to one orchestrator run. */
export function makeOrchestratorTools(deps: OrchestratorToolDeps) {
  const { taskAnalyzer, skillMatcher, avaiChecker, recommender, ctx } = deps;
  // Sub-agents run with the same tenant/actor but WITHOUT the onEvent sink, so
  // only the orchestrator (here) emits the sub-step cards.
  const subCtx: SpecializedAgentRunCtx = {
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    abortSignal: ctx.abortSignal,
  };

  const callTaskAnalyzer = defineAgentTool({
    id: 'callTaskAnalyzer',
    name: 'Analyze task',
    description:
      "Resolve a task's required skills, or find tasks by skill/area. Use the current taskId when the user refers to 'this task'.",
    input: z.object({ query: z.string(), taskId: z.string().nullable() }),
    output: z.object({
      skills: z.array(z.string()).optional(),
      tasks: z.array(TaskSummarySchema).optional(),
    }),
    execute: async ({ query, taskId }) => {
      ctx.onEvent?.({
        kind: 'step-start',
        stepId: 'taskAnalyzer',
        agentId: 'staffing.taskAnalyzer',
      });
      const res = await taskAnalyzer.run({ query, taskId }, subCtx);
      ctx.onEvent?.({ kind: 'step-done', stepId: 'taskAnalyzer', trust: res.trust });
      return res.result;
    },
  });

  const callSkillMatcher = defineAgentTool({
    id: 'callSkillMatcher',
    name: 'Find candidate people',
    description: 'Find and rank candidate users for a task by the required skills.',
    input: z.object({ taskId: z.string().min(1), skills: z.array(z.string()).min(1) }),
    output: z.object({ taskId: z.string(), candidates: z.array(RankedCandidateSchema) }),
    execute: async ({ taskId, skills }) => {
      const stepId = `skillMatcher:${taskId}`;
      ctx.onEvent?.({ kind: 'step-start', stepId, agentId: 'staffing.skillMatcher' });
      const res = await skillMatcher.run({ taskId, skills }, subCtx);
      ctx.onEvent?.({ kind: 'step-done', stepId, trust: res.trust });
      return res.result;
    },
  });

  const callAvaiChecker = defineAgentTool({
    id: 'callAvaiChecker',
    name: 'Check availability',
    description:
      'Score how available each candidate is (status + in-progress load) for a task. Pass the candidates from callSkillMatcher.',
    input: z.object({ taskId: z.string().min(1), candidates: z.array(RankedCandidateSchema) }),
    output: z.object({ taskId: z.string(), availability: z.array(AvailabilityResultSchema) }),
    execute: async ({ taskId, candidates }) => {
      const stepId = `avaiChecker:${taskId}`;
      ctx.onEvent?.({ kind: 'step-start', stepId, agentId: 'staffing.avaiChecker' });
      const res = await avaiChecker.run({ taskId, candidates }, subCtx);
      ctx.onEvent?.({ kind: 'step-done', stepId, trust: res.trust });
      return res.result;
    },
  });

  const callRecommender = defineAgentTool({
    id: 'callRecommender',
    name: 'Rank recommendations',
    description:
      'Produce the final ranked assignee recommendation from candidates and their availability.',
    input: z.object({
      taskId: z.string().min(1),
      skills: z.array(z.string()),
      candidates: z.array(RankedCandidateSchema),
      availability: z.array(AvailabilityResultSchema),
    }),
    output: z.object({ taskId: z.string(), recommendations: z.array(RecommendationSchema) }),
    execute: async ({ taskId, skills, candidates, availability }) => {
      const stepId = `recommender:${taskId}`;
      ctx.onEvent?.({ kind: 'step-start', stepId, agentId: 'staffing.recommender' });
      const res = await recommender.run({ taskId, skills, candidates, availability }, subCtx);
      ctx.onEvent?.({ kind: 'step-done', stepId, trust: res.trust });
      return res.result;
    },
  });

  return { callTaskAnalyzer, callSkillMatcher, callAvaiChecker, callRecommender };
}
