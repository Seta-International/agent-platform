import { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import type { MastraModelConfig } from '@mastra/core/llm';
import { ConsoleLogger, type LogLevel } from '@mastra/core/logger';
import { TokenLimiterProcessor } from '@mastra/core/processors';
import { RequestContext } from '@mastra/core/request-context';
import type { MastraCompositeStore } from '@mastra/core/storage';
import { MastraStorageExporter, Observability } from '@mastra/observability';
import {
  type AgentResult,
  type Citation,
  RC_AGENT_MEMORY,
  RC_THREAD_ID,
  type SpecializedAgentRunCtx,
  type SpecializedAgentSpec,
} from '@seta/agent-sdk';
import type { ChatStreamRun } from '@seta/shared-orchestration';
import type { z } from 'zod';
import { pickModel } from './model.ts';
import { makeOrchestratorTools } from './orchestrator.tools.ts';
import type { AssignPort, TaskSummary, UserProfilePort } from './ports.ts';
import {
  type AvailabilityResult,
  type CompletionStatus,
  OrchestratorInputSchema,
  type OrchestratorResult,
  OrchestratorResultSchema,
  type RankedCandidate,
  type Recommendation,
  type TaskAnalyzerIntent,
  type TaskAnalyzerOutput,
  type UserProfileResult,
} from './schemas.ts';
import { type MastraToolSignals, trustFromMastraResult } from './trust.ts';
import { loadUserContextSection, makeUpdateWorkingMemoryTool } from './working-memory.tools.ts';

type In = z.infer<typeof OrchestratorInputSchema>;
type Out = OrchestratorResult;

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

export interface OrchestratorDeps {
  taskAnalyzer: TaskAnalyzerSpec;
  skillMatcher: SkillMatcherSpec;
  avaiChecker: AvaiCheckerSpec;
  recommender: RecommenderSpec;
  generalAnswer: GeneralAnswerSpec;
  userProfileLookup: UserProfilePort;
  /** Performs the assignment a proposeAssignment approval confirms. Threaded
   *  into the composite tool. */
  assign: AssignPort;
  resolveModel: () => MastraModelConfig;
  /**
   * Store the per-turn Mastra wraps the orchestrator agent in so its
   * native-suspend snapshot persists. Injected from the composition root via
   * the staffing runtime deps; shared with the engine Mastra for cross-instance
   * resume. The test seams (runAgent/streamAgent) bypass the wrapped agent, so
   * fixtures default this to an InMemoryStore.
   */
  mastraStorage: MastraCompositeStore;
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
  /** Test-only seam mirroring runAgent for the streaming chat path. Returns a
   *  minimal MastraModelOutput-shaped object: an async-iterable fullStream that
   *  drives execution, plus awaitable toolCalls/toolResults/text. Production
   *  omits this and a real Agent.stream() is used. */
  streamAgent?: (args: {
    input: In;
    requestContext: RequestContext;
    instructions: string;
    tools: Record<string, unknown>;
  }) => {
    fullStream: AsyncIterable<unknown>;
    toolCalls: Promise<MastraToolSignals['toolCalls']>;
    toolResults: Promise<MastraToolSignals['toolResults']>;
    text: Promise<string | undefined>;
  };
  /** Test-only seam mirroring streamAgent for the RESUME chat path. Stands in for
   *  `built.agent.resumeStream(resume, { runId, requestContext })` so tests can
   *  assert the resume coordinates + forwarded events without a real Mastra
   *  snapshot. Production omits this and a real Agent.resumeStream() is used. */
  resumeAgent?: (args: {
    resume: ResumeDecision;
    runId: string;
    toolCallId?: string;
    requestContext: RequestContext;
  }) => {
    fullStream: AsyncIterable<unknown>;
    toolCalls: Promise<MastraToolSignals['toolCalls']>;
    toolResults: Promise<MastraToolSignals['toolResults']>;
    text: Promise<string | undefined>;
  };
}

/** The proposeAssignment composite's ResumeSchema shape — the decision the
 *  approval card resolves to. Forwarded verbatim into resumeStream. */
export type ResumeDecision = {
  decision: 'approve' | 'reject' | 'modify';
  overrideUserIds?: string[];
  alternateIndices?: number[];
  note?: string;
};

/** A run ctx PLUS the resume coordinates: the Mastra runId of the suspended run
 *  and (optionally) the suspended tool's call id. A single suspension resolves
 *  without toolCallId (spike-confirmed); it disambiguates only concurrent
 *  suspensions. */
export type ResumeCtx = SpecializedAgentRunCtx & {
  mastraRunId: string;
  toolCallId?: string;
};

/** Shape of an awaited Mastra stream/resumeStream result the drain reads. */
type DrainableStream = {
  fullStream: AsyncIterable<unknown>;
  toolCalls: Promise<MastraToolSignals['toolCalls']>;
  toolResults: Promise<MastraToolSignals['toolResults']>;
  text: Promise<string | undefined>;
};

const RECOMMEND_TASK_CAP = 5;

function instructionsText(cap: number): string {
  return [
    'You are a staffing assistant.',
    'For multi-step tasks (finding people for a task, recommending an assignee, looking up a',
    'profile), FIRST write one short sentence describing what you are about to do — e.g.',
    '"Let me find open React tasks." or "I\'ll look up Tuấn\'s profile." — THEN call the tools.',
    'For simple single-tool lookups you may skip the preamble and call immediately.',
    '',
    'Get skills or tasks with staffing_analyzeTasks, picking the intent that matches the request:',
    '- intent=resolve_task_skills (with the current taskRef): for "what skills does this task',
    '  need", and to get a task\'s skills before recommending people FOR that task.',
    '- intent=extract_named_skills: when the user asks for PEOPLE by skill they named, e.g.',
    '  "who has aws and k8s skills" / "find someone who knows terraform". This returns those',
    '  skills — it does NOT search tasks. Do not use find_tasks for a people question.',
    '- intent=find_tasks: when the user wants to list TASKS by area/skill, e.g. "find infra tasks".',
    '  Also pass completionStatus: "open" for incomplete tasks ("todo", "open", "not started",',
    '  "pending", "not completed"); "completed" for done ("done", "finished", "completed");',
    '  "any" when unspecified (default).',
    '',
    "PERSON PROFILE LOOKUP — when the user asks about a specific named individual's skills,",
    'role, or profile (e.g. "list skills of Alice", "what does Tuấn know", "show Bob\'s skills"),',
    "call staffing_lookupUserProfile with that person's name and STOP. Do NOT use staffing_analyzeTasks",
    'or staffing_matchCandidatesBySkill for this — those are for task-based skill searches.',
    '',
    'DOCUMENT / GENERAL QUESTION — when the user asks a general question, a',
    'conversational follow-up, or anything about an attached document (its text is',
    'inlined in this message under a `Context:` block delimited by `<<<FILE: ...>>>`,',
    'or appeared in an earlier turn), call staffing_answerQuestion and STOP. Do NOT use the',
    'staffing tools (staffing_analyzeTasks / find_tasks / skill / people tools) for a',
    'document or general question.',
    '',
    'staffing_analyzeTasks takes taskRef: a task UUID, or an ordinal reference into tasks already',
    'listed in this conversation — "first"/"#1", "second"/"#2", "last". When the user refers',
    'to a previously listed task ("the first task", "task đầu tiên"), pass the ordinal and',
    'NEVER invent a UUID. Its result includes resolvedTaskId (the real UUID): pass THAT as',
    'taskId to staffing_matchCandidatesBySkill, staffing_checkCandidateAvailability and staffing_rankRecommendations.',
    '',
    'PEOPLE SEARCH — the user just wants people who HAVE the skills, with no task to staff and',
    'no "who should do it" question (e.g. "find users with aws and docker", "who has k8s',
    'skills"): staffing_analyzeTasks(extract_named_skills), then staffing_matchCandidatesBySkill with those skills',
    'and taskId=null, then STOP. The matcher candidates are the answer — do NOT call',
    'staffing_checkCandidateAvailability or staffing_rankRecommendations for a people search.',
    '',
    'RECOMMEND OR ASSIGN AN ASSIGNEE for ONE task — the user asks who SHOULD do a specific task,',
    'to pick the best person for it, OR to ASSIGN it (e.g. "who should do this task", "recommend',
    'someone for the auth work", "assign this task", "assign it to the best person", or "assign',
    'to them" / "assign to him" right after candidates were listed): call staffing_proposeAssignment(taskId)',
    'ONCE and STOP. taskId is the task UUID, or an ordinal reference into tasks already listed in',
    'this conversation ("first"/"#1", "last") — never invent a UUID. For "assign to them" /',
    '"assign this" that refers to a task already discussed in this conversation, use that task',
    '(its UUID, or "first" if it was the one just listed). If the user names a task that has NOT',
    'been listed yet (e.g. "assign the AWS inventory task to someone"), FIRST call staffing_analyzeTasks',
    'with intent=find_tasks and that name as the query, THEN call staffing_proposeAssignment with the',
    'matching task ("first" when it is the top result). staffing_proposeAssignment runs the whole recommend',
    'pipeline itself and pauses for the user to confirm the assignment; do NOT call staffing_matchCandidatesBySkill/',
    'staffing_checkCandidateAvailability/staffing_rankRecommendations yourself for a single-task recommend. "Assign" is NEVER a direct',
    'write you perform — it ALWAYS goes through staffing_proposeAssignment, which asks the user to confirm.',
    '',
    'RECOMMEND FOR MULTIPLE FOUND TASKS — when the user asks to find tasks AND recommend people',
    'for them, you cannot use staffing_proposeAssignment (it is single-task). For each found task, after',
    'obtaining its skills, call in order: staffing_matchCandidatesBySkill with those skills; then staffing_checkCandidateAvailability',
    'with the returned candidates; then staffing_rankRecommendations with the candidates AND the availability',
    "returned by staffing_checkCandidateAvailability. Pass that task's resolvedTaskId through all three.",
    '',
    'If the user only asks what skills a task needs, or only to list tasks, answer with the',
    'staffing_analyzeTasks result and STOP — do not recommend people.',
    `When asked to find tasks AND recommend people, recommend for at most the first ${cap} tasks.`,
    'Never invent tasks, skills, or people.',
    '',
    'FINAL ANSWER — after the tools you need have run, write ONE concise, friendly answer in',
    "natural language that directly answers the user, grounded ONLY in the tools' results: state",
    'counts, names, and skills exactly as returned — never invent or round them. For a people or',
    'task list, summarize the top few in prose (the UI also shows a structured card, so do not',
    'dump a long bulleted list). If a tool returned nothing, say so plainly. When an assignment',
    "proposal is pending the user's confirmation, tell them to review the approval card.",
  ].join('\n');
}

interface BuiltOrchestrator {
  agent: Agent;
  /** Storage-backed Mastra the agent is bound to. Task 7's resume path reuses
   *  buildOrchestrator and calls built.agent.resumeStream against this handle. */
  mastra: Mastra;
  rc: RequestContext;
  message: string;
  /** Shared run options for generate()/stream(): memory wiring, maxSteps, abort. */
  runOptions: Record<string, unknown>;
  /** Exposed for the runAgent test seam (asserts wiring without an LLM). */
  instructions: string;
  tools: Record<string, unknown>;
}

async function buildOrchestrator(
  deps: OrchestratorDeps,
  input: In,
  ctx: SpecializedAgentRunCtx,
  cap: number,
): Promise<BuiltOrchestrator> {
  const rc = new RequestContext();
  rc.set('actor', { type: 'user', user_id: ctx.actorUserId });
  rc.set('tenant_id', ctx.tenantId);
  rc.set('effective_permissions', ctx.effectivePermissions ?? new Set<string>());
  if (ctx.threadId) rc.set(RC_THREAD_ID, ctx.threadId);
  if (ctx.entitiesMemory) rc.set(RC_AGENT_MEMORY, ctx.entitiesMemory);

  const tools: Record<string, unknown> = makeOrchestratorTools({
    taskAnalyzer: deps.taskAnalyzer,
    skillMatcher: deps.skillMatcher,
    avaiChecker: deps.avaiChecker,
    recommender: deps.recommender,
    generalAnswer: deps.generalAnswer,
    userProfileLookup: deps.userProfileLookup,
    assign: deps.assign,
    userText: input.userText,
    ctx,
  });
  const wmTool = makeUpdateWorkingMemoryTool(ctx);
  if (wmTool) tools.updateWorkingMemory = wmTool;

  const wmSection = await loadUserContextSection(ctx);
  const instructions = wmSection
    ? `${instructionsText(cap)}\n\n${wmSection}`
    : instructionsText(cap);

  const agent = new Agent({
    id: 'staffing.orchestrator',
    name: 'Staffing Orchestrator',
    instructions,
    model: pickModel(ctx, deps.resolveModel),
    tools: tools as never,
    ...(ctx.userMemory ? { memory: ctx.userMemory.memory } : {}),
    inputProcessors: [new TokenLimiterProcessor({ limit: 100_000 })],
  });

  // Wrap the per-turn agent in a storage-backed Mastra so .stream() persists its
  // native-suspend snapshot — a later resumeStream (Task 7) reloads it from the
  // SAME store. The store is injected (staffing owns no storage); the engine
  // Mastra shares this one instance so cross-Mastra-instance resume works.
  const mastra = new Mastra({
    agents: { 'staffing.orchestrator': agent },
    storage: deps.mastraStorage,
    // Framework-level logs (WARN by default; raise via MASTRA_LOG_LEVEL).
    logger: new ConsoleLogger({
      name: 'Mastra',
      level: (process.env.MASTRA_LOG_LEVEL as LogLevel) ?? 'warn',
    }),
    // AI tracing → agent.mastra_ai_spans. This is the per-turn agent that
    // actually decides tools (proposeAssignment etc.) and natively suspends,
    // so its span tree is the primary record for debugging chat HITL.
    observability: new Observability({
      configs: {
        default: {
          serviceName: 'seta-staffing-orchestrator',
          exporters: [new MastraStorageExporter()],
        },
      },
    }),
  });
  const boundAgent = mastra.getAgent('staffing.orchestrator');

  const message = [
    `User message: ${input.userText}`,
    `Current taskId: ${input.taskId ?? '(none)'}`,
  ].join('\n');

  const runOptions: Record<string, unknown> = {
    requestContext: rc,
    maxSteps: 12,
    abortSignal: ctx.abortSignal,
    // Ask OpenAI reasoning models to stream a summary of their thinking; without
    // this the `reasoning` parts arrive empty. Provider-namespaced, so non-OpenAI
    // models ignore it. Forwarded by Mastra to the AI SDK model call.
    providerOptions: { openai: { reasoningSummary: 'auto' } },
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
  };

  return { agent: boundAgent, mastra, rc, message, runOptions, instructions, tools };
}

/** Shared post-LLM step: assemble the structured result and derive the trust
 *  envelope. The single-task HITL approval card is now produced by the
 *  proposeAssignment composite tool (deterministic suspend), not a post-step. */
function finalizeOrchestratorResult(
  res: MastraToolSignals,
  _ctx: SpecializedAgentRunCtx,
): AgentResult<Out> {
  const result = assemble(res);
  const trust = trustFromMastraResult(res, {
    citations: (tr) => citationsFor(tr, result),
    confidence: confidenceFor(result, res),
  });
  return { result, trust };
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
      const built = await buildOrchestrator(deps, input, ctx, cap);
      const res: MastraToolSignals = deps.runAgent
        ? await deps.runAgent({
            input,
            requestContext: built.rc,
            instructions: built.instructions,
            tools: built.tools,
          })
        : await (async () => {
            const r = await built.agent.generate(built.message, built.runOptions);
            return {
              toolCalls: r.toolCalls as MastraToolSignals['toolCalls'],
              toolResults: r.toolResults as MastraToolSignals['toolResults'],
              text: r.text,
            };
          })();
      return finalizeOrchestratorResult(res, ctx);
    },
  };
}

/** Streaming chat entrypoint. Drives the orchestrator via Agent.stream() and
 *  returns the live Mastra output (the route converts it to AI SDK v6 parts)
 *  plus a finalize() that, once the run completes, assembles the structured
 *  result + trust from the tool results. The suspend signal is surfaced by the
 *  converter as a data part downstream — the orchestrator no longer drains the
 *  stream itself. */
export function makeChatOrchestrationStreamer(deps: OrchestratorDeps) {
  const cap = deps.recommendTaskCap ?? RECOMMEND_TASK_CAP;
  return async function startChat(input: In, ctx: SpecializedAgentRunCtx): Promise<ChatStreamRun> {
    const built = await buildOrchestrator(deps, input, ctx, cap);
    const output = deps.streamAgent
      ? (deps.streamAgent({
          input,
          requestContext: built.rc,
          instructions: built.instructions,
          tools: built.tools,
        }) as unknown as ChatStreamRun['output'])
      : ((await built.agent.stream(
          built.message,
          built.runOptions,
        )) as unknown as ChatStreamRun['output']);

    const finalize = async () => {
      const stream = output as unknown as DrainableStream;
      const res: MastraToolSignals = {
        toolCalls: await stream.toolCalls,
        toolResults: await stream.toolResults,
        text: await stream.text,
      };
      return finalizeOrchestratorResult(res, ctx);
    };
    return { output, finalize };
  };
}

/** Resume chat entrypoint. Rebuilds the orchestrator on the shared
 *  storage-backed Mastra so the persisted native-suspend snapshot reloads by
 *  runId, calls Agent.resumeStream with the approval decision, and returns the
 *  same ChatStreamRun shape as the forward path. */
export function makeChatOrchestrationResumer(deps: OrchestratorDeps) {
  const cap = deps.recommendTaskCap ?? RECOMMEND_TASK_CAP;
  return async function resumeChat(resume: ResumeDecision, ctx: ResumeCtx): Promise<ChatStreamRun> {
    const built = await buildOrchestrator(deps, { userText: '', taskId: null }, ctx, cap);
    const output = deps.resumeAgent
      ? (deps.resumeAgent({
          resume,
          runId: ctx.mastraRunId,
          ...(ctx.toolCallId ? { toolCallId: ctx.toolCallId } : {}),
          requestContext: built.rc,
        }) as unknown as ChatStreamRun['output'])
      : ((await (
          built.agent as unknown as {
            resumeStream: (
              resumeData: ResumeDecision,
              opts: { runId: string; toolCallId?: string; requestContext: RequestContext },
            ) => Promise<unknown>;
          }
        ).resumeStream(resume, {
          runId: ctx.mastraRunId,
          ...(ctx.toolCallId ? { toolCallId: ctx.toolCallId } : {}),
          requestContext: built.rc,
        })) as ChatStreamRun['output']);

    const finalize = async () => {
      const stream = output as unknown as DrainableStream;
      const res: MastraToolSignals = {
        toolCalls: await stream.toolCalls,
        toolResults: await stream.toolResults,
        text: await stream.text,
      };
      return finalizeOrchestratorResult(res, ctx);
    };
    return { output, finalize };
  };
}

function results(res: MastraToolSignals, name: string): unknown[] {
  return res.toolResults.filter((t) => t.payload.toolName === name).map((t) => t.payload.result);
}

function assemble(res: MastraToolSignals): OrchestratorResult {
  const ta = results(res, 'staffing_analyzeTasks') as TaskAnalyzerOutput[];
  const recs = results(res, 'staffing_rankRecommendations') as {
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
  const downstreamAttempted = [
    'staffing_checkCandidateAvailability',
    'staffing_rankRecommendations',
  ].some(
    (name) =>
      res.toolCalls.some((c) => c.payload.toolName === name) ||
      res.toolResults.some((t) => t.payload.toolName === name),
  );
  if (!downstreamAttempted) {
    const [match] = results(res, 'staffing_matchCandidatesBySkill') as {
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

  // Profile lookup: terminal answer for "list skills of <name>".
  const profileHits = (
    results(res, 'staffing_lookupUserProfile') as { profiles?: UserProfileResult[] }[]
  ).flatMap((r) => r.profiles ?? []);
  if (profileHits.length > 0) return { userProfiles: profileHits };

  // A document / general question routes here: the general-answer sub-agent's
  // prose IS the terminal answer. It runs only when the LLM called NO staffing
  // tools, so the structured branches above never fire alongside it. An empty
  // answer falls through to the honest capability message below.
  const generalAnswer = (results(res, 'staffing_answerQuestion') as { answer?: string }[]).find(
    (g) => g.answer?.trim(),
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

function citationsFor(
  tr: { payload: { toolName: string; result: unknown } },
  result: OrchestratorResult,
): Citation[] {
  if (tr.payload.toolName === 'staffing_analyzeTasks') {
    const ts = (tr.payload.result as { tasks?: TaskSummary[] }).tasks ?? [];
    return ts.map<Citation>((t) => ({ kind: 'task', id: t.taskId, label: t.title }));
  }
  if (tr.payload.toolName === 'staffing_rankRecommendations') {
    const rs = (tr.payload.result as { recommendations?: Recommendation[] }).recommendations ?? [];
    return rs.map<Citation>((r) => ({ kind: 'user', id: r.userId, label: r.name ?? undefined }));
  }
  // Matcher candidates are evidence only when they ARE the answer (people-search
  // terminal); in the recommend flow the recommender already cites those users.
  if (tr.payload.toolName === 'staffing_matchCandidatesBySkill' && result.candidates) {
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
  if (result.userProfiles?.length) return 0.9;
  // A surfaced general answer is a real (if unsourced) answer — rank it above the
  // 0.2 honest-failure floor that bare `message` results carry.
  if (
    res &&
    (results(res, 'staffing_answerQuestion') as { answer?: string }[]).some((g) => g.answer?.trim())
  ) {
    return 0.6;
  }
  return 0.2;
}
