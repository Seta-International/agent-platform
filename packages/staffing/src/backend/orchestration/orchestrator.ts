import { Agent } from '@mastra/core/agent';
import type { MastraModelConfig } from '@mastra/core/llm';
import { TokenLimiterProcessor } from '@mastra/core/processors';
import { RequestContext } from '@mastra/core/request-context';
import {
  type AgentResult,
  type Citation,
  RC_AGENT_MEMORY,
  RC_THREAD_ID,
  type SpecializedAgentRunCtx,
  type SpecializedAgentSpec,
} from '@seta/agent-sdk';
import type { z } from 'zod';
import { buildAssignApprovalCard } from './approval-card.ts';
import { pickModel } from './model.ts';
import { makeOrchestratorTools } from './orchestrator.tools.ts';
import type { TaskSummary } from './ports.ts';
import {
  type AvailabilityResult,
  OrchestratorInputSchema,
  type OrchestratorResult,
  OrchestratorResultSchema,
  type RankedCandidate,
  type Recommendation,
  type TaskAnalyzerIntent,
  type TaskAnalyzerOutput,
} from './schemas.ts';
import { type MastraToolSignals, trustFromMastraResult } from './trust.ts';
import { loadUserContextSection, makeUpdateWorkingMemoryTool } from './working-memory.tools.ts';

type In = z.infer<typeof OrchestratorInputSchema>;
type Out = OrchestratorResult;

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
type GeneralAnswerSpec = SpecializedAgentSpec<{ query: string }, { answer: string }>;

export interface OrchestratorDeps {
  taskAnalyzer: TaskAnalyzerSpec;
  skillMatcher: SkillMatcherSpec;
  avaiChecker: AvaiCheckerSpec;
  recommender: RecommenderSpec;
  generalAnswer: GeneralAnswerSpec;
  resolveModel: () => MastraModelConfig;
  /** Cap on how many found tasks the orchestrator recommends people for. */
  recommendTaskCap?: number;
  /** Test-only seam; production builds + runs a real Mastra Agent. Receives the
   *  fully assembled prompt + tool map so tests can assert wiring without an LLM. */
  runAgent?: (args: {
    input: In;
    requestContext: RequestContext;
    instructions: string;
    tools: Record<string, unknown>;
  }) => Promise<MastraToolSignals>;
}

const RECOMMEND_TASK_CAP = 5;

function instructions(cap: number): string {
  return [
    'You are a staffing assistant. Decide which tools to call to answer the user, then stop.',
    '',
    'Get skills or tasks with callTaskAnalyzer, picking the intent that matches the request:',
    '- intent=resolve_task_skills (with the current taskRef): for "what skills does this task',
    '  need", and to get a task\'s skills before recommending people FOR that task.',
    '- intent=extract_named_skills: when the user asks for PEOPLE by skill they named, e.g.',
    '  "who has aws and k8s skills" / "find someone who knows terraform". This returns those',
    '  skills — it does NOT search tasks. Do not use find_tasks for a people question.',
    '- intent=find_tasks: when the user wants to list TASKS by area/skill, e.g. "find infra tasks".',
    '',
    'DOCUMENT / GENERAL QUESTION — when the user asks a general question, a',
    'conversational follow-up, or anything about an attached document (its text is',
    'inlined in this message under a `Context:` block delimited by `<<<FILE: ...>>>`,',
    'or appeared in an earlier turn), call callGeneralAnswer and STOP. Do NOT use the',
    'staffing tools (callTaskAnalyzer / find_tasks / skill / people tools) for a',
    'document or general question.',
    '',
    'callTaskAnalyzer takes taskRef: a task UUID, or an ordinal reference into tasks already',
    'listed in this conversation — "first"/"#1", "second"/"#2", "last". When the user refers',
    'to a previously listed task ("the first task", "task đầu tiên"), pass the ordinal and',
    'NEVER invent a UUID. Its result includes resolvedTaskId (the real UUID): pass THAT as',
    'taskId to callSkillMatcher, callAvaiChecker and callRecommender.',
    '',
    'PEOPLE SEARCH — the user just wants people who HAVE the skills, with no task to staff and',
    'no "who should do it" question (e.g. "find users with aws and docker", "who has k8s',
    'skills"): callTaskAnalyzer(extract_named_skills), then callSkillMatcher with those skills',
    'and taskId=null, then STOP. The matcher candidates are the answer — do NOT call',
    'callAvaiChecker or callRecommender for a people search.',
    '',
    'RECOMMEND AN ASSIGNEE — the user asks who SHOULD do a task or to pick the best person',
    '(e.g. "who should do this task", "recommend someone for the auth work"): after obtaining',
    'the skills, call in order: callSkillMatcher with those skills; then callAvaiChecker with',
    'the returned candidates; then callRecommender with the candidates AND the availability',
    "returned by callAvaiChecker. Pass the same taskId through all three: callTaskAnalyzer's",
    'resolvedTaskId, or null when the request names no task — taskId is only a correlation',
    'label.',
    '',
    'If the user only asks what skills a task needs, or only to list tasks, answer with the',
    'callTaskAnalyzer result and STOP — do not recommend people.',
    `When asked to find tasks AND recommend people, recommend for at most the first ${cap} tasks.`,
    'Never invent tasks, skills, or people.',
  ].join('\n');
}

export function makeOrchestratorAgent(deps: OrchestratorDeps): SpecializedAgentSpec<In, Out> {
  const cap = deps.recommendTaskCap ?? RECOMMEND_TASK_CAP;
  return {
    id: 'staffing.orchestrator',
    description:
      'Routes a staffing chat message across the task-analysis and recommendation sub-agents.',
    inputSchema: OrchestratorInputSchema,
    outputSchema: OrchestratorResultSchema,
    run: async (input, ctx): Promise<AgentResult<Out>> => {
      const rc = new RequestContext();
      rc.set('actor', { type: 'user', user_id: ctx.actorUserId });
      rc.set('tenant_id', ctx.tenantId);
      rc.set('effective_permissions', ctx.effectivePermissions ?? new Set<string>());
      // Conversation-scoped memory wiring: the SDK entity recorder and
      // task-ref resolver key on these two request-context entries. Absent
      // (first turn before a thread id exists, queued runner) they no-op.
      if (ctx.threadId) rc.set(RC_THREAD_ID, ctx.threadId);
      if (ctx.entitiesMemory) rc.set(RC_AGENT_MEMORY, ctx.entitiesMemory);

      const tools: Record<string, unknown> = makeOrchestratorTools({
        taskAnalyzer: deps.taskAnalyzer,
        skillMatcher: deps.skillMatcher,
        avaiChecker: deps.avaiChecker,
        recommender: deps.recommender,
        generalAnswer: deps.generalAnswer,
        userText: input.userText,
        ctx,
      });
      const wmTool = makeUpdateWorkingMemoryTool(ctx);
      if (wmTool) tools.updateWorkingMemory = wmTool;

      const wmSection = await loadUserContextSection(ctx);
      const baseInstructions = wmSection
        ? `${instructions(cap)}\n\n${wmSection}`
        : instructions(cap);
      const agentInstructions = baseInstructions;

      const res: MastraToolSignals = deps.runAgent
        ? await deps.runAgent({ input, requestContext: rc, instructions: agentInstructions, tools })
        : await (async () => {
            const agent = new Agent({
              id: 'staffing.orchestrator',
              name: 'Staffing Orchestrator',
              instructions: agentInstructions,
              model: pickModel(ctx, deps.resolveModel),
              tools: tools as never,
              ...(ctx.userMemory ? { memory: ctx.userMemory.memory } : {}),
              inputProcessors: [new TokenLimiterProcessor({ limit: 100_000 })],
            });
            const r = await agent.generate(
              [
                `User message: ${input.userText}`,
                `Current taskId: ${input.taskId ?? '(none)'}`,
              ].join('\n'),
              {
                requestContext: rc,
                maxSteps: 12,
                abortSignal: ctx.abortSignal,
                // Restore supervisor parity: Mastra injects lastMessages history
                // + semanticRecall and fires generateTitle. readOnly => it does
                // NOT persist messages (our chat route persists via
                // userMemory.saveMessages). workingMemory disabled here because
                // the orchestrator still injects userContext manually via
                // loadUserContextSection (no double handling).
                ...(ctx.userMemory && ctx.threadId
                  ? {
                      memory: {
                        thread: ctx.threadId,
                        resource: `${ctx.tenantId}:${ctx.actorUserId}`,
                        options: { readOnly: true, workingMemory: { enabled: false } },
                      },
                    }
                  : {}),
              },
            );
            return {
              toolCalls: r.toolCalls as MastraToolSignals['toolCalls'],
              toolResults: r.toolResults as MastraToolSignals['toolResults'],
              text: r.text,
            };
          })();

      const result = await recordApprovalIfRecommended(assemble(res), res, ctx);
      const trust = trustFromMastraResult(res, {
        citations: (tr) => citationsFor(tr, result),
        confidence: confidenceFor(result, res),
      });
      return { result, trust };
    },
  };
}

function results(res: MastraToolSignals, name: string): unknown[] {
  return res.toolResults.filter((t) => t.payload.toolName === name).map((t) => t.payload.result);
}

function assemble(res: MastraToolSignals): OrchestratorResult {
  const ta = results(res, 'callTaskAnalyzer') as TaskAnalyzerOutput[];
  const recs = results(res, 'callRecommender') as {
    taskId: string | null;
    recommendations: Recommendation[];
  }[];

  const foundTasks = ta.flatMap((o) => o.tasks ?? []);
  if (foundTasks.length > 0) {
    const byTask = new Map(recs.map((r) => [r.taskId, r.recommendations]));
    return {
      tasks: foundTasks.map((task: TaskSummary) => {
        const recommendations = byTask.get(task.taskId);
        return recommendations ? { task, recommendations } : { task };
      }),
    };
  }
  const [firstRec] = recs;
  if (firstRec) return { recommendations: firstRec.recommendations };

  // Stopping at skillMatcher is the people-search terminal ("find users with
  // aws and docker"): the candidates ARE the answer. It only counts as a stall
  // when the pipeline went PAST the matcher — avaiChecker/recommender called
  // (even unsuccessfully) means an assignee recommendation was attempted.
  const downstreamAttempted = ['callAvaiChecker', 'callRecommender'].some(
    (name) =>
      res.toolCalls.some((c) => c.payload.toolName === name) ||
      res.toolResults.some((t) => t.payload.toolName === name),
  );
  if (!downstreamAttempted) {
    const [match] = results(res, 'callSkillMatcher') as {
      taskId: string | null;
      candidates: RankedCandidate[];
    }[];
    if (match) return { candidates: match.candidates };
  }

  // taskAnalyzer's skills double as pipeline INPUT for skillMatcher. They are a
  // terminal answer ONLY when the user asked just for skills — i.e. the recommend
  // pipeline never started. If recommendation WAS attempted but produced nothing,
  // returning those skills would mis-answer "find an assignee" as "what skills
  // does this need". Surface an honest failure instead.
  if (!downstreamAttempted) {
    const skills = ta.find((o) => o.skills)?.skills;
    if (skills) return { skills };
  }

  // A document / general question routes here: the general-answer sub-agent's
  // prose IS the terminal answer. It runs only when the LLM called NO staffing
  // tools, so the structured branches above never fire alongside it. An empty
  // answer falls through to the honest capability message below.
  const generalAnswer = (results(res, 'callGeneralAnswer') as { answer?: string }[]).find((g) =>
    g.answer?.trim(),
  )?.answer;
  if (generalAnswer) return { message: generalAnswer.trim() };

  // A turn where the LLM called no tools at all is conversational — e.g. the
  // "Approved"/"Declined" follow-up ChatEmbeddedHitl appends after a card
  // decision, or a plain greeting. Answer with the LLM's own words. Turns
  // where tools ran but produced nothing keep the honest hardcoded messages.
  const noToolsRan = res.toolCalls.length === 0 && res.toolResults.length === 0;
  const llmText = res.text?.trim();
  if (noToolsRan && llmText) return { message: llmText };

  return {
    message: downstreamAttempted
      ? "I couldn't complete the recommendation for this task. Please try again."
      : "I can describe a task's required skills, find tasks by area, or recommend people for a task.",
  };
}

/** Deterministic HITL post-step: after a successful single-task recommend flow,
 *  record the in-thread approval card so the user can one-click assign. NOT an
 *  LLM tool by design — the card must always appear when the flow succeeds
 *  (the avaiChecker stall regression is why the recommend path avoids
 *  LLM-discretionary steps). Fail-open: a recorder error logs and falls back
 *  to the plain recommendations answer. */
async function recordApprovalIfRecommended(
  result: OrchestratorResult,
  res: MastraToolSignals,
  ctx: SpecializedAgentRunCtx,
): Promise<OrchestratorResult> {
  if (!ctx.recordHitlApproval || !result.recommendations?.length) return result;
  const [rec] = results(res, 'callRecommender') as { taskId: string | null }[];
  const taskId = rec?.taskId ?? null;
  if (!taskId) return result; // task-less recommend — nothing to assign
  const ta = results(res, 'callTaskAnalyzer') as TaskAnalyzerOutput[];
  const title = ta.find((o) => o.title)?.title ?? null;
  const card = buildAssignApprovalCard({
    taskId,
    title,
    recommendations: result.recommendations,
    tenantId: ctx.tenantId,
    userId: ctx.actorUserId,
  });
  ctx.onEvent?.({
    kind: 'step-start',
    stepId: 'proposeAssignment',
    agentId: 'staffing.orchestrator',
  });
  try {
    const { approvalId, cardInThread } = await ctx.recordHitlApproval(card);
    // Absent means true: legacy recorders always bind the card to this thread.
    const inThread = cardInThread !== false;
    ctx.onEvent?.({
      kind: 'step-done',
      stepId: 'proposeAssignment',
      trust: {
        reasoningTrace: [
          {
            step: 'proposeAssignment',
            detail: inThread
              ? `approval card recorded for task ${taskId}`
              : `existing pending proposal reused for task ${taskId} (card surfaces in another thread)`,
            at: new Date().toISOString(),
          },
        ],
        evidenceCitations: [],
        confidenceScore: 0.9,
      },
    });
    return { ...result, pendingApproval: { approvalId, taskId, inThread } };
  } catch (err) {
    // Fail-open: the user still gets the plain recommendation list.
    console.error('[staffing.orchestrator] HITL approval card failed; falling back', err);
    ctx.onEvent?.({
      kind: 'step-done',
      stepId: 'proposeAssignment',
      trust: { reasoningTrace: [], evidenceCitations: [], confidenceScore: 0.2 },
    });
    return result;
  }
}

function citationsFor(
  tr: { payload: { toolName: string; result: unknown } },
  result: OrchestratorResult,
): Citation[] {
  if (tr.payload.toolName === 'callTaskAnalyzer') {
    const ts = (tr.payload.result as { tasks?: TaskSummary[] }).tasks ?? [];
    return ts.map<Citation>((t) => ({ kind: 'task', id: t.taskId, label: t.title }));
  }
  if (tr.payload.toolName === 'callRecommender') {
    const rs = (tr.payload.result as { recommendations?: Recommendation[] }).recommendations ?? [];
    return rs.map<Citation>((r) => ({ kind: 'user', id: r.userId, label: r.name ?? undefined }));
  }
  // Matcher candidates are evidence only when they ARE the answer (people-search
  // terminal); in the recommend flow the recommender already cites those users.
  if (tr.payload.toolName === 'callSkillMatcher' && result.candidates) {
    const cs = (tr.payload.result as { candidates?: RankedCandidate[] }).candidates ?? [];
    return cs.map<Citation>((c) => ({ kind: 'user', id: c.userId, label: c.name ?? undefined }));
  }
  return [];
}

function confidenceFor(result: OrchestratorResult, res?: MastraToolSignals): number {
  if (result.recommendations?.length) return 0.8;
  if (result.tasks?.length) return 0.8;
  if (result.candidates?.length) return 0.8;
  if (result.skills?.length) return 0.8;
  // A surfaced general answer is a real (if unsourced) answer — rank it above the
  // 0.2 honest-failure floor that bare `message` results carry.
  if (
    res &&
    (results(res, 'callGeneralAnswer') as { answer?: string }[]).some((g) => g.answer?.trim())
  ) {
    return 0.6;
  }
  return 0.2;
}
