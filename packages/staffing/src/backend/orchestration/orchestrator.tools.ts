import type { SpecializedAgentRunCtx, SpecializedAgentSpec } from '@seta/agent-sdk';
import { defineAgentTool, recordEntityExposure, resolveTaskRef } from '@seta/agent-sdk';
import { z } from 'zod';
import type { AssignPort, UserProfilePort } from './ports.ts';
import { makeProposeAssignmentTool } from './propose-assignment.tool.ts';
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
  UserProfileResultSchema,
} from './schemas.ts';

type TaskAnalyzerSpec = SpecializedAgentSpec<
  {
    intent: TaskAnalyzerIntent;
    query: string;
    taskId: string | null;
    completionStatus: CompletionStatus;
    limit?: number;
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
  userProfileLookup: UserProfilePort;
  /** Performs the assignment a proposeAssignment approval confirms. */
  assign: AssignPort;
  /** The orchestrator's current user message — already carries any injected
   *  `Context:` file block. Passed verbatim to the general-answer sub-agent so
   *  the routing LLM cannot paraphrase or truncate the document into a tool arg. */
  userText: string;
  /** The orchestrator's run ctx: provides tenant/actor/abort. */
  ctx: SpecializedAgentRunCtx;
}

/** Build the five sub-agent delegation tools, bound to one orchestrator run. */
export function makeOrchestratorTools(deps: OrchestratorToolDeps) {
  const {
    taskAnalyzer,
    skillMatcher,
    avaiChecker,
    recommender,
    generalAnswer,
    userProfileLookup,
    assign,
    userText,
    ctx,
  } = deps;
  // Sub-agents run with the same tenant/actor. The per-turn model override rides
  // along so sub-agent LLM calls honor the user's pick.
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

  const staffing_analyzeTasks = defineAgentTool({
    id: 'staffing_analyzeTasks',
    name: 'Analyze Tasks',
    description: [
      'Analyze task requirements or find tasks by intent. Use for: resolving which skills a task',
      'needs; extracting skill names the user mentioned; finding tasks by skill tag.',
      '',
      'intent values:',
      "- resolve_task_skills: the current task's required skills (pass its taskRef).",
      '- extract_named_skills: skills the user named in the message.',
      '- find_tasks: list tasks whose skill_tags match the message.',
      '',
      'taskRef is a UUID or an ordinal ("first"/"#1"). Pass resolvedTaskId to downstream tools.',
    ].join('\n'),
    input: z.object({
      intent: TaskAnalyzerIntentSchema,
      query: z.string(),
      taskRef: z.string().nullable(),
      completionStatus: CompletionStatus.default('any').describe(
        'Only for find_tasks. "open" = not completed, "completed" = done, "any" = all (default).',
      ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe(
          'Only for find_tasks. Max tasks to return. Set this to the count the user asked ' +
            'for — e.g. "find 5 infra tasks" → 5. Results are ranked by relevance, so this ' +
            'returns the best N. Omit for the default of 20.',
        ),
    }),
    output: z.object({
      resolvedTaskId: z.string().nullable(),
      skills: z.array(z.string()).optional(),
      title: z.string().optional(),
      tasks: z.array(TaskSummarySchema).optional(),
    }),
    execute: async ({ intent, query, taskRef, completionStatus, limit }, toolCtx) => {
      const taskId = taskRef ? (await resolveTaskRef(toolCtx as never, taskRef)).taskId : null;
      const res = await taskAnalyzer.run(
        { intent, query, taskId, completionStatus, limit },
        subCtx,
      );
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
  const staffing_matchCandidatesBySkill = defineAgentTool({
    id: 'staffing_matchCandidatesBySkill',
    name: 'Match Candidates By Skill',
    description:
      'Find and rank candidate users by required skills.\n\n' +
      'Use for: building a candidate pool for a task or a plain people search.\n' +
      'Pass taskId (or null), and all required skills at once.\n' +
      'For a plain people search ("find users with X"), this is the FINAL step.',
    input: z.object({ taskId: z.string().nullable(), skills: z.array(z.string()).min(1) }),
    output: z.object({ taskId: z.string().nullable(), candidates: z.array(RankedCandidateSchema) }),
    execute: async ({ taskId, skills }) => {
      const res = await skillMatcher.run({ taskId, skills }, subCtx);
      return res.result;
    },
  });

  const staffing_checkCandidateAvailability = defineAgentTool({
    id: 'staffing_checkCandidateAvailability',
    name: 'Check Candidate Availability',
    description:
      'Score availability (status + in-progress load) for each candidate.\n\n' +
      'Use for: filtering out busy or OOO people before recommending.\n' +
      'Pass candidates from staffing_matchCandidatesBySkill and the same taskId.',
    input: z.object({ taskId: z.string().nullable(), candidates: z.array(RankedCandidateSchema) }),
    output: z.object({
      taskId: z.string().nullable(),
      availability: z.array(AvailabilityResultSchema),
    }),
    execute: async ({ taskId, candidates }) => {
      const res = await avaiChecker.run({ taskId, candidates }, subCtx);
      return res.result;
    },
  });

  const staffing_rankRecommendations = defineAgentTool({
    id: 'staffing_rankRecommendations',
    name: 'Rank Recommendations',
    description:
      'Produce the final ranked assignee recommendations from candidates and availability scores.\n\n' +
      'Use for: the last step in any "recommend who should own this task" flow.\n' +
      'Pass taskId, skills, candidates (from staffing_matchCandidatesBySkill), ' +
      'and availability (from staffing_checkCandidateAvailability).',
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
      const res = await recommender.run({ taskId, skills, candidates, availability }, subCtx);
      if (res.result.taskId && res.result.recommendations.length > 0) {
        await recordEntityExposure(toolCtx as never, {
          lastDiscussedTaskId: res.result.taskId,
          lastProposedCandidateUserId: res.result.recommendations[0]?.userId ?? null,
        });
      }
      return res.result;
    },
  });

  const staffing_answerQuestion = defineAgentTool({
    id: 'staffing_answerQuestion',
    name: 'Answer Question',
    description:
      'Answer a general question or a question about an attached document in prose.\n\n' +
      'Use for: conversational follow-ups; document questions; any query that is NOT about ' +
      'finding tasks, skills, or recommending people.\n' +
      'Do NOT use for staffing requests — use the staffing_* tools instead.',
    input: z.object({}),
    output: z.object({ answer: z.string() }),
    execute: async () => {
      const res = await generalAnswer.run({ query: userText }, answerCtx);
      return res.result;
    },
  });

  const staffing_lookupUserProfile = defineAgentTool({
    id: 'staffing_lookupUserProfile',
    name: 'Look Up User Profile',
    description:
      "Look up a specific person's skills, role, and availability by display name.\n\n" +
      'Use for: "list skills of Alice"; "what does Bob know"; "show Tuấn\'s profile".\n' +
      'Pass the display name as the user wrote it.',
    input: z.object({
      name: z.string().describe("The person's display name to search for."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(25)
        .optional()
        .describe(
          'Max matching profiles to return. Set to the count the user asked for. Default 5.',
        ),
    }),
    output: z.object({ profiles: z.array(UserProfileResultSchema) }),
    execute: async ({ name, limit }) => {
      const profiles = await userProfileLookup.findByName(name, subCtx, limit);
      return { profiles };
    },
  });

  // The deterministic single-task recommend → approve → assign composite. It runs
  // the (resolve_task_skills → match → availability → recommend) pipeline as code
  // and suspends with the approval card, replacing the LLM-stepped recommend chain
  // for the single-task case. The match/availability/recommend tools above are kept
  // for the MULTI-task find+recommend and the people-search paths.
  const proposeAssignment = makeProposeAssignmentTool({
    taskAnalyzer,
    skillMatcher,
    avaiChecker,
    recommender,
    assign,
    ctx,
  });

  return {
    staffing_analyzeTasks,
    staffing_matchCandidatesBySkill,
    staffing_checkCandidateAvailability,
    staffing_rankRecommendations,
    staffing_answerQuestion,
    staffing_lookupUserProfile,
    proposeAssignment,
  };
}
