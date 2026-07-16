import { Agent, type MastraDBMessage } from '@mastra/core/agent';
import type { MastraModelConfig } from '@mastra/core/llm';
import { RequestContext } from '@mastra/core/request-context';
import type {
  AgentResult,
  AgentTool,
  SpecializedAgentRunCtx,
  SpecializedAgentSpec,
} from '@seta/agent-sdk';
import type { ChatStreamRun } from '@seta/shared-orchestration';
import { z } from 'zod';
import { pickModel } from './model.ts';
import { makeQueryOrchestratorTools } from './orchestrator.tools.ts';
import type { QuerySubAgentInput, QuerySubAgentOutput } from './schemas.ts';

type SubAgent = SpecializedAgentSpec<QuerySubAgentInput, QuerySubAgentOutput>;

export const QueryOrchestratorInputSchema = z.object({
  userText: z.string(),
  taskId: z.string().nullable(),
});
export type QueryOrchestratorInput = z.infer<typeof QueryOrchestratorInputSchema>;

export const QueryOrchestratorResultSchema = z.object({ answer: z.string() });
export type QueryOrchestratorResult = z.infer<typeof QueryOrchestratorResultSchema>;

export interface QueryOrchestratorDeps {
  taskQuery: SubAgent;
  taskDetail: SubAgent;
  teamInfo: SubAgent;
  generalAnswer: SubAgent;
  resolveModel: () => MastraModelConfig;
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
- ONE known task's details ("what does this task include", "who's on it", "comments",
  "tell me about task Plan AI") → planner_taskDetailAgent.
- Group/plan/bucket/member/skill structure ("how many members", "what plans exist")
  → planner_teamInfoAgent.
- Compound questions spanning the above, summaries, or off-topic
  → planner_answerQuestion (optionally after gathering data from the others).

Rules: call at most the tools you need; prefer ONE. Page context arrives as a
"[Context: planner.<kind>#<id>]" prefix — pass the relevant id through to the
delegate. This is READ-ONLY: never assign, comment, or claim to have changed
anything. The current user's identity is implicit — questions about "me/my/I" never need
an id (the delegates resolve the caller from the session). For a NAMED other person, let the
delegate resolve them; only ask the user to clarify when a name is genuinely ambiguous.`;

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
  }) as unknown as Record<string, AgentTool>;

  const agent = new Agent({
    id: 'planner.query.orchestrator',
    name: 'Planner Query Orchestrator',
    instructions: INSTRUCTIONS,
    model: pickModel(ctx, deps.resolveModel),
    tools: tools as never,
  });

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
