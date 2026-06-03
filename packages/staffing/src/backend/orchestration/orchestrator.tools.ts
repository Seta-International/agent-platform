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
  type TaskAnalyzerIntent,
  TaskAnalyzerIntent as TaskAnalyzerIntentSchema,
  type TaskAnalyzerOutput,
  TaskSummarySchema,
} from './schemas.ts';

type TaskAnalyzerSpec = SpecializedAgentSpec<
  { intent: TaskAnalyzerIntent; query: string; taskId: string | null },
  TaskAnalyzerOutput
>;
type SkillMatcherSpec = SpecializedAgentSpec<
  { taskId: string | null; skills: string[] },
  { taskId: string | null; candidates: RankedCandidate[] }
>;
type AvaiCheckerSpec = SpecializedAgentSpec<
  { taskId: string | null; candidates: RankedCandidate[] },
  { taskId: string | null; availability: AvailabilityResult[] }
>;
type RecommenderSpec = SpecializedAgentSpec<
  // availability is now produced by the avaiChecker step and passed through.
  {
    taskId: string | null;
    skills: string[];
    candidates: RankedCandidate[];
    availability: AvailabilityResult[];
  },
  { taskId: string | null; recommendations: Recommendation[] }
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
    description: [
      'Get skills or tasks, per `intent`:',
      "- resolve_task_skills: the current task's required skills (pass its taskId). Use for",
      '  "what skills does this task need" and to get skills before recommending people FOR a task.',
      '- extract_named_skills: the skills the user named in the message. Use when the user asks',
      '  for people by skill (e.g. "who has aws and k8s skills") — returns those skills, NOT tasks.',
      '- find_tasks: list tasks whose skill_tags match the message (e.g. "find infra tasks").',
    ].join('\n'),
    input: z.object({
      intent: TaskAnalyzerIntentSchema,
      query: z.string(),
      taskId: z.string().nullable(),
    }),
    output: z.object({
      skills: z.array(z.string()).optional(),
      tasks: z.array(TaskSummarySchema).optional(),
    }),
    execute: async ({ intent, query, taskId }) => {
      ctx.onEvent?.({
        kind: 'step-start',
        stepId: 'taskAnalyzer',
        agentId: 'staffing.taskAnalyzer',
      });
      const res = await taskAnalyzer.run({ intent, query, taskId }, subCtx);
      ctx.onEvent?.({ kind: 'step-done', stepId: 'taskAnalyzer', trust: res.trust });
      return res.result;
    },
  });

  // taskId is the task being staffed, or null for a task-less people search
  // ("find users with aws and docker"). It is only a correlation label here.
  const callSkillMatcher = defineAgentTool({
    id: 'callSkillMatcher',
    name: 'Find candidate people',
    description:
      'Find and rank candidate users by the required skills. Pass the current taskId, or null when the search is not tied to a task.',
    input: z.object({ taskId: z.string().nullable(), skills: z.array(z.string()).min(1) }),
    output: z.object({ taskId: z.string().nullable(), candidates: z.array(RankedCandidateSchema) }),
    execute: async ({ taskId, skills }) => {
      const stepId = `skillMatcher:${taskId ?? 'adhoc'}`;
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
      'Score how available each candidate is (status + in-progress load). Pass the candidates from callSkillMatcher, and the same taskId (or null).',
    input: z.object({ taskId: z.string().nullable(), candidates: z.array(RankedCandidateSchema) }),
    output: z.object({
      taskId: z.string().nullable(),
      availability: z.array(AvailabilityResultSchema),
    }),
    execute: async ({ taskId, candidates }) => {
      const stepId = `avaiChecker:${taskId ?? 'adhoc'}`;
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
      taskId: z.string().nullable(),
      skills: z.array(z.string()),
      candidates: z.array(RankedCandidateSchema),
      availability: z.array(AvailabilityResultSchema),
    }),
    output: z.object({
      taskId: z.string().nullable(),
      recommendations: z.array(RecommendationSchema),
    }),
    execute: async ({ taskId, skills, candidates, availability }) => {
      const stepId = `recommender:${taskId ?? 'adhoc'}`;
      ctx.onEvent?.({ kind: 'step-start', stepId, agentId: 'staffing.recommender' });
      const res = await recommender.run({ taskId, skills, candidates, availability }, subCtx);
      ctx.onEvent?.({ kind: 'step-done', stepId, trust: res.trust });
      return res.result;
    },
  });

  return { callTaskAnalyzer, callSkillMatcher, callAvaiChecker, callRecommender };
}
