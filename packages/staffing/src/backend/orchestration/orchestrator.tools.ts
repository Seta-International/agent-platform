import type { SpecializedAgentRunCtx, SpecializedAgentSpec } from '@seta/agent-sdk';
import { defineAgentTool, recordEntityExposure, resolveTaskRef } from '@seta/agent-sdk';
import { z } from 'zod';
import {
  type AvailabilityResult,
  AvailabilityResultSchema,
  CompletionStatus,
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
  {
    intent: TaskAnalyzerIntent;
    query: string;
    taskId: string | null;
    completionStatus: CompletionStatus;
  },
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
type GeneralAnswerSpec = SpecializedAgentSpec<{ query: string }, { answer: string }>;

export interface OrchestratorToolDeps {
  taskAnalyzer: TaskAnalyzerSpec;
  skillMatcher: SkillMatcherSpec;
  avaiChecker: AvaiCheckerSpec;
  recommender: RecommenderSpec;
  generalAnswer: GeneralAnswerSpec;
  /** The orchestrator's current user message — already carries any injected
   *  `Context:` file block. Passed verbatim to the general-answer sub-agent so
   *  the routing LLM cannot paraphrase or truncate the document into a tool arg. */
  userText: string;
  /** The orchestrator's run ctx: provides tenant/actor/abort + the onEvent sink. */
  ctx: SpecializedAgentRunCtx;
}

/** Build the four sub-agent delegation tools, bound to one orchestrator run. */
export function makeOrchestratorTools(deps: OrchestratorToolDeps) {
  const { taskAnalyzer, skillMatcher, avaiChecker, recommender, generalAnswer, userText, ctx } =
    deps;
  // Sub-agents run with the same tenant/actor but WITHOUT the onEvent sink, so
  // only the orchestrator (here) emits the sub-step cards. The per-turn model
  // override rides along so sub-agent LLM calls honor the user's pick.
  const subCtx: SpecializedAgentRunCtx = {
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    abortSignal: ctx.abortSignal,
    model: ctx.model,
  };

  // The general-answer sub-agent additionally needs thread memory (readOnly) so a
  // follow-up about an already-consumed file can read the persisted Context from
  // history. The staffing sub-agents deliberately run memory-free (subCtx).
  const answerCtx: SpecializedAgentRunCtx = {
    ...subCtx,
    threadId: ctx.threadId,
    userMemory: ctx.userMemory,
  };

  const callTaskAnalyzer = defineAgentTool({
    id: 'callTaskAnalyzer',
    name: 'Analyze task',
    description: [
      'Get skills or tasks, per `intent`:',
      "- resolve_task_skills: the current task's required skills (pass its taskRef). Use for",
      '  "what skills does this task need" and to get skills before recommending people FOR a task.',
      '- extract_named_skills: the skills the user named in the message. Use when the user asks',
      '  for people by skill (e.g. "who has aws and k8s skills") — returns those skills, NOT tasks.',
      '- find_tasks: list tasks whose skill_tags match the message (e.g. "find infra tasks").',
      '  Pass completionStatus: "open" for not-yet-done tasks ("todo", "open", "not started",',
      '  "pending", "not completed"); "completed" for done tasks ("done", "finished",',
      '  "completed"); "any" when unspecified (default).',
      '',
      'taskRef is a task UUID, or an ordinal reference into the tasks already listed in this',
      'conversation: "first"/"#1", "second"/"#2", ... "last". When the user refers to a task',
      'from an earlier answer ("the first task", "that one"), pass the ordinal — NEVER invent',
      "a UUID. The result's resolvedTaskId is the real UUID: pass THAT as taskId to",
      'callSkillMatcher, callAvaiChecker and callRecommender.',
    ].join('\n'),
    input: z.object({
      intent: TaskAnalyzerIntentSchema,
      query: z.string(),
      taskRef: z.string().nullable(),
      completionStatus: CompletionStatus.default('any').describe(
        'Only for find_tasks. "open" = not completed, "completed" = done, "any" = all (default).',
      ),
    }),
    output: z.object({
      resolvedTaskId: z.string().nullable(),
      skills: z.array(z.string()).optional(),
      title: z.string().optional(),
      tasks: z.array(TaskSummarySchema).optional(),
    }),
    execute: async ({ intent, query, taskRef, completionStatus }, toolCtx) => {
      // Resolve BEFORE emitting step-start: a failed resolution throws back to
      // the LLM (same pattern as the planner tools) without leaving a dangling
      // step card in the trace timeline.
      const taskId = taskRef ? (await resolveTaskRef(toolCtx as never, taskRef)).taskId : null;
      ctx.onEvent?.({
        kind: 'step-start',
        stepId: 'taskAnalyzer',
        agentId: 'staffing.taskAnalyzer',
      });
      const res = await taskAnalyzer.run({ intent, query, taskId, completionStatus }, subCtx);
      ctx.onEvent?.({ kind: 'step-done', stepId: 'taskAnalyzer', trust: res.trust });
      // Server-owned exposure tracking (thread-scoped working memory): the
      // recorder no-ops without RC_AGENT_MEMORY/RC_THREAD_ID and swallows its
      // own failures — never breaks the staffing answer.
      if (intent === 'find_tasks' && res.result.tasks?.length) {
        await recordEntityExposure(toolCtx as never, {
          recentTasks: res.result.tasks.map((t) => ({ taskId: t.taskId, title: t.title })),
        });
      }
      if (intent === 'resolve_task_skills' && taskId) {
        await recordEntityExposure(toolCtx as never, {
          lastDiscussedTaskId: taskId,
          ...(res.result.title ? { recentTasks: [{ taskId, title: res.result.title }] } : {}),
        });
      }
      return { resolvedTaskId: taskId, ...res.result };
    },
  });

  // taskId is the task being staffed, or null when no task is named (a people
  // search, or a task-less recommend). It is only a correlation label here.
  // For a plain people search ("find users with aws and docker") this is the
  // FINAL step: the orchestrator answers with these candidates and stops.
  const callSkillMatcher = defineAgentTool({
    id: 'callSkillMatcher',
    name: 'Find candidate people',
    description:
      'Find and rank candidate users by the required skills. Pass the current taskId, or null when the search is not tied to a task. For a plain people search ("find users with X") this is the FINAL step — answer with the returned candidates.',
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
    execute: async ({ taskId, skills, candidates, availability }, toolCtx) => {
      const stepId = `recommender:${taskId ?? 'adhoc'}`;
      ctx.onEvent?.({ kind: 'step-start', stepId, agentId: 'staffing.recommender' });
      const res = await recommender.run({ taskId, skills, candidates, availability }, subCtx);
      ctx.onEvent?.({ kind: 'step-done', stepId, trust: res.trust });
      if (res.result.taskId && res.result.recommendations.length > 0) {
        await recordEntityExposure(toolCtx as never, {
          lastDiscussedTaskId: res.result.taskId,
          lastProposedCandidateUserId: res.result.recommendations[0]?.userId ?? null,
        });
      }
      return res.result;
    },
  });

  const callGeneralAnswer = defineAgentTool({
    id: 'callGeneralAnswer',
    name: 'Answer a general or document question',
    description: [
      "Answer the user's question directly, in prose. Use for a general question, a",
      'conversational follow-up, or any question about an attached document (its text',
      'is supplied to you automatically). Do NOT use for staffing requests (tasks,',
      'skills, or finding/recommending people). Takes no arguments.',
    ].join(' '),
    input: z.object({}),
    output: z.object({ answer: z.string() }),
    execute: async () => {
      ctx.onEvent?.({
        kind: 'step-start',
        stepId: 'generalAnswer',
        agentId: 'staffing.generalAnswer',
      });
      const res = await generalAnswer.run({ query: userText }, answerCtx);
      ctx.onEvent?.({ kind: 'step-done', stepId: 'generalAnswer', trust: res.trust });
      return res.result;
    },
  });

  return {
    callTaskAnalyzer,
    callSkillMatcher,
    callAvaiChecker,
    callRecommender,
    callGeneralAnswer,
  };
}
