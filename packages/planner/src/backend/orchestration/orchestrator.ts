import { Mastra } from '@mastra/core';
import { Agent, type MastraDBMessage } from '@mastra/core/agent';
import type { MastraModelConfig } from '@mastra/core/llm';
import { ConsoleLogger, type LogLevel } from '@mastra/core/logger';
import { RequestContext } from '@mastra/core/request-context';
import type { MastraCompositeStore } from '@mastra/core/storage';
import { MastraStorageExporter, Observability } from '@mastra/observability';
import {
  type AgentResult,
  type AgentTool,
  type SpecializedAgentRunCtx,
  type SpecializedAgentSpec,
  withTemporalContext,
} from '@seta/agent-sdk';
import type { ChatStreamRun } from '@seta/shared-orchestration';
import { z } from 'zod';
import { pickModel } from './model.ts';
import { makeQueryOrchestratorTools } from './orchestrator.tools.ts';
import type { QuerySubAgentInput, QuerySubAgentOutput } from './schemas.ts';
import type { OnToolActivity } from './tool-activity.ts';

type SubAgent = SpecializedAgentSpec<QuerySubAgentInput, QuerySubAgentOutput>;

export const QueryOrchestratorInputSchema = z.object({
  userText: z.string(),
  taskId: z.string().nullable(),
});
export type QueryOrchestratorInput = z.infer<typeof QueryOrchestratorInputSchema>;

export const QueryOrchestratorResultSchema = z.object({ answer: z.string() });
export type QueryOrchestratorResult = z.infer<typeof QueryOrchestratorResultSchema>;

export interface QueryOrchestratorDeps {
  /** Injectable clock for deterministic date anchors (evals pass a frozen instant). */
  now?: () => Date;
  taskQuery: SubAgent;
  taskDetail: SubAgent;
  teamInfo: SubAgent;
  generalAnswer: SubAgent;
  resolveModel: () => MastraModelConfig;
  mastraStorage: MastraCompositeStore;
  /** Eval seam — receives the orchestrator's delegation (routing) calls. */
  onToolActivity?: OnToolActivity;
  /** Test seam — replaces agent.stream(); returns a minimal output with `.text`. */
  streamAgent?: (args: {
    message: string;
    requestContext: RequestContext;
    tools: Record<string, AgentTool>;
    sessionHistory?: MastraDBMessage[];
  }) => { text: Promise<string> };
}

const INSTRUCTIONS = `You are the planner Q&A orchestrator. The user asks read-only
questions about their tasks and team. Choose the right delegation tool, then answer
the user in clear prose.

Routing:
- A SET of tasks (list/count/search, "my tasks", "due this week", "about X")
  → planner_queryTasksAgent.
- ONE known task's details ("what does this task include", "who's on it",
  "comments", "tell me about this task") → planner_taskDetailAgent.
- A person's ACTIVITY / history — what someone DID over a period, not which tasks
  they hold ("what did I do", "hôm nay/tuần này tôi đã làm gì", "what has X been
  up to", "recent activity") → planner_teamInfoAgent. Note the contrast: "my tasks"
  / "due this week" is a task LIST (planner_queryTasksAgent); "what I DID this week"
  is an activity feed (planner_teamInfoAgent).
- Group/plan/bucket/member/skill structure, or a plan's BOARD overview
  ("how many members", "what plans exist", "show me the board", "board của X",
  "how's plan X looking") → planner_teamInfoAgent.
- Compound questions spanning the above, summaries, or off-topic
  → planner_answerQuestion (optionally after gathering data from the others).

Rules: call at most the tools you need; prefer ONE. This is READ-ONLY: never
assign, comment, or claim to have changed anything.

Passing context to a delegate:
- Page context arrives as a "[Context: planner.<kind>#<id>]" prefix. When one is
  present, forward that id to the delegate EXACTLY as written — copy the literal
  id characters, never a task/board name and never an example title. Do not
  invent a title. The id is re-attached to the delegate query for you
  automatically, so when in doubt just restate the user's question verbatim.
- The current user's identity is implicit — questions about "me/my/I" never need
  an id (delegates resolve the caller from the session). For a NAMED other person,
  let the delegate resolve them; only ask the user to clarify when a name is
  genuinely ambiguous.`;

const AGENT_ID = 'planner.query.orchestrator';

const CONTEXT_PREFIX_RE = /\[Context:\s*planner\.[a-z]+#[^\]]+\]/i;

/** Deterministically recover the page-context prefix so it can be re-attached to
 *  the delegate query regardless of what the LLM wrote. Prefers the literal
 *  "[Context: planner.<kind>#<id>]" already in the user's text; falls back to a
 *  structured taskId channel. This is fix B for PQ-008: the delegate's task id
 *  must not depend on the model copying a UUID out of the prompt. */
export function extractContextPrefix(input: {
  userText: string;
  taskId: string | null;
}): string | undefined {
  const match = input.userText.match(CONTEXT_PREFIX_RE);
  if (match) return match[0];
  if (input.taskId) return `[Context: planner.task#${input.taskId}]`;
  return undefined;
}

interface BuiltQueryOrchestrator {
  agent: Agent;
  message: string;
  rc: RequestContext;
  tools: Record<string, AgentTool>;
}

function buildQueryOrchestrator(
  deps: QueryOrchestratorDeps,
  input: QueryOrchestratorInput,
  ctx: SpecializedAgentRunCtx,
): BuiltQueryOrchestrator {
  const rc = new RequestContext();
  rc.set('actor', { type: 'user', user_id: ctx.actorUserId });
  rc.set('tenant_id', ctx.tenantId);
  rc.set('effective_permissions', ctx.effectivePermissions ?? new Set<string>());

  const tools = makeQueryOrchestratorTools({
    taskQuery: deps.taskQuery,
    taskDetail: deps.taskDetail,
    teamInfo: deps.teamInfo,
    generalAnswer: deps.generalAnswer,
    ctx,
    contextPrefix: extractContextPrefix(input),
    onToolActivity: deps.onToolActivity,
  }) as unknown as Record<string, AgentTool>;

  const rawAgent = new Agent({
    id: AGENT_ID,
    name: 'Planner Query Orchestrator',
    instructions: withTemporalContext(INSTRUCTIONS, { now: deps.now?.() }),
    model: pickModel(ctx, deps.resolveModel),
    tools: tools as never,
  });

  const hasStorage = typeof deps.mastraStorage?.getStore === 'function';
  const mastra = new Mastra({
    agents: { [AGENT_ID]: rawAgent },
    ...(hasStorage ? { storage: deps.mastraStorage } : {}),
    logger: new ConsoleLogger({
      name: 'Mastra',
      level: (process.env.MASTRA_LOG_LEVEL as LogLevel) ?? 'warn',
    }),
    ...(hasStorage
      ? {
          observability: new Observability({
            configs: {
              default: {
                serviceName: 'query-orchestrator',
                exporters: [new MastraStorageExporter()],
              },
            },
          }),
        }
      : {}),
  });

  const agent = mastra.getAgent(AGENT_ID);

  return { agent, message: input.userText, rc, tools };
}

const EMPTY_TRUST = { reasoningTrace: [], evidenceCitations: [], confidenceScore: 0.6 };

/** Non-streaming spec (queued runner / direct call). */
export function makeQueryOrchestrator(
  deps: QueryOrchestratorDeps,
): SpecializedAgentSpec<QueryOrchestratorInput, QueryOrchestratorResult> {
  return {
    id: 'planner.query.orchestrator',
    description:
      'Routes a planner Q&A turn across the task-query/detail/team-info/general sub-agents.',
    inputSchema: QueryOrchestratorInputSchema,
    outputSchema: QueryOrchestratorResultSchema,
    run: async (input, ctx): Promise<AgentResult<QueryOrchestratorResult>> => {
      const built = buildQueryOrchestrator(deps, input, ctx);
      const text = deps.streamAgent
        ? await deps.streamAgent({
            message: built.message,
            requestContext: built.rc,
            tools: built.tools,
            sessionHistory: ctx.sessionHistory,
          }).text
        : (
            await built.agent.generate(
              ctx.sessionHistory?.length ? [...ctx.sessionHistory, built.message] : built.message,
              {
                requestContext: built.rc,
                abortSignal: ctx.abortSignal,
              },
            )
          ).text;
      const answer = text?.trim() ?? '';
      return { result: { answer }, trust: { ...EMPTY_TRUST, confidenceScore: answer ? 0.6 : 0.2 } };
    },
  };
}

/** Streaming entry — the chat route consumes the returned ChatStreamRun. */
export function makeQueryChatStreamer(deps: QueryOrchestratorDeps) {
  return async function startQueryChat(
    input: QueryOrchestratorInput,
    ctx: SpecializedAgentRunCtx,
  ): Promise<ChatStreamRun> {
    const built = buildQueryOrchestrator(deps, input, ctx);

    if (deps.streamAgent) {
      const fake = deps.streamAgent({
        message: built.message,
        requestContext: built.rc,
        tools: built.tools,
        sessionHistory: ctx.sessionHistory,
      });
      return {
        output: fake as unknown as ChatStreamRun['output'],
        finalize: async () => {
          const answer = (await fake.text)?.trim() ?? '';
          return {
            result: { answer },
            trust: { ...EMPTY_TRUST, confidenceScore: answer ? 0.6 : 0.2 },
          };
        },
      };
    }

    const output = await built.agent.stream(
      ctx.sessionHistory?.length ? [...ctx.sessionHistory, built.message] : built.message,
      {
        requestContext: built.rc,
        abortSignal: ctx.abortSignal,
      },
    );
    return {
      output: output as unknown as ChatStreamRun['output'],
      finalize: async () => {
        const answer = (await (output as unknown as { text: Promise<string> }).text)?.trim() ?? '';
        return {
          result: { answer },
          trust: { ...EMPTY_TRUST, confidenceScore: answer ? 0.6 : 0.2 },
        };
      },
    };
  };
}
