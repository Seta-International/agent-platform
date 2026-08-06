import { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import type { MastraModelConfig } from '@mastra/core/llm';
import { ConsoleLogger, type LogLevel } from '@mastra/core/logger';
import type { RequestContext } from '@mastra/core/request-context';
import type { MastraCompositeStore } from '@mastra/core/storage';
import { MastraStorageExporter, Observability } from '@mastra/observability';
import {
  type AgentResult,
  type AgentTool,
  buildAgentRequestContext,
  type SpecializedAgentRunCtx,
  type SpecializedAgentSpec,
  temporalContextBlock,
} from '@seta/agent-sdk';
import {
  plannerGetBoardSnapshotTool,
  plannerGetOpenTaskCountTool,
  plannerGetStatsTool,
  plannerQueryTasksTool,
  plannerResolveMemberTool,
} from '@seta/planner/agent-tools';
import { pickModel } from '../model.ts';
import {
  type QuerySubAgentInput as In,
  type QuerySubAgentOutput as Out,
  QuerySubAgentInputSchema,
  QuerySubAgentOutputSchema,
} from '../schemas.ts';
import { mapToolActivity, type OnToolActivity } from '../tool-activity.ts';
import { GROUNDING_POLICY } from './grounding.ts';

export const TASK_SEARCH_TOOL_IDS = [
  'planner_queryTasks',
  'planner_findSimilarTasks',
  'planner_getBoardSnapshot',
  'planner_getStats',
  'planner_getOpenTaskCountForUser',
  'planner_resolveMember',
] as const;

export interface QueryTaskSearchDeps {
  resolveModel: () => MastraModelConfig;
  mastraStorage: MastraCompositeStore;
  /** Built find-similar tool (factory needs provider + databaseUrl), injected by the runtime. */
  findSimilarTasksTool: AgentTool;
  /** Injectable clock for deterministic date anchors (evals pass a frozen instant). */
  now?: () => Date;
  runAgent?: (args: { input: In; requestContext: RequestContext }) => Promise<{ text: string }>;
  /** Eval seam — receives this agent's executed tool calls after generate(). */
  onToolActivity?: OnToolActivity;
}

export function buildInstructions(now: Date = new Date()): string {
  return `You answer "which tasks?" questions — the user is discovering a
SET of tasks, not asking about one known task. Answer in prose.

${temporalContextBlock(now)}

Tools:
- planner_queryTasks: structured filter (assignee, plan, status, due window, title substring) → list.
  For title/name-based lookup ("task named X", "find the billing migration task"), pass titleContains.
- planner_findSimilarTasks: semantic/topic search ("tasks about the billing migration").
  Do NOT use for title/name lookups — use planner_queryTasks with titleContains instead.
- planner_getBoardSnapshot: current state of a plan — buckets and task counts by status.
- planner_getStats: aggregate task metrics for a plan (planId) or whole group (groupId).
- planner_getOpenTaskCountForUser: a COUNT when the user only wants a number.
- planner_resolveMember: turn a person's NAME/email into their userId.

Identity (never ask the user for an id, never invent one):
- "my/I/me" tasks → planner_queryTasks with assigneeScope: "me" (count → getOpenTaskCount scope: "me").
- A named OTHER person ("Tuan's tasks") → call planner_resolveMember first; pass the
  returned userId as assigneeUserId. If it returns MORE THAN ONE candidate, ask the user
  which person they mean. If it returns none, say you couldn't find that person.

Filter discipline: pass ONLY the filters the user actually asked for. For "all my open tasks"
send just assigneeScope + status:"open" — do NOT add dueBefore or isDeferred. Those are narrowing
filters that hide most tasks unless the user asked for that subset. status maps to progress:
"open" (percent < 100, default), "not_started", "in_progress", "completed", "any" — pick the one
the user means ("what have I finished" → completed; "what am I working on" → in_progress).
"due this week" → status:"open" + dueBefore set to the end of this week, nothing else.
"find task named X" → titleContains:"X" + status:"any" (don't restrict to open unless asked).

Other heuristics: "how many ..." → getOpenTaskCount; topic phrasing ("about X") → findSimilarTasks;
task name/title phrasing ("named X", "called X", "the X task") → queryTasks with titleContains.
Empty result sets are valid answers — say "you have no matching tasks", don't error.

${GROUNDING_POLICY}
Read-only.`;
}

export function makeQueryTaskSearchAgent(deps: QueryTaskSearchDeps): SpecializedAgentSpec<In, Out> {
  return {
    id: 'planner.query.taskSearch',
    description:
      'Discovers/lists/counts tasks matching criteria (structured + semantic), in prose.',
    inputSchema: QuerySubAgentInputSchema,
    outputSchema: QuerySubAgentOutputSchema,
    run: async (input, ctx: SpecializedAgentRunCtx): Promise<AgentResult<Out>> => {
      const rc = buildAgentRequestContext(ctx);

      const out = deps.runAgent
        ? await deps.runAgent({ input, requestContext: rc })
        : await (async () => {
            const agentId = 'planner.query.taskSearch';
            const rawAgent = new Agent({
              id: agentId,
              name: 'Planner Task Search',
              instructions: buildInstructions(deps.now?.()),
              model: pickModel(ctx, deps.resolveModel),
              tools: {
                planner_queryTasks: plannerQueryTasksTool,
                planner_findSimilarTasks: deps.findSimilarTasksTool,
                planner_getBoardSnapshot: plannerGetBoardSnapshotTool,
                planner_getStats: plannerGetStatsTool,
                planner_getOpenTaskCountForUser: plannerGetOpenTaskCountTool,
                planner_resolveMember: plannerResolveMemberTool,
              } as never,
            });
            const hasStorage = typeof deps.mastraStorage?.getStore === 'function';
            const mastra = new Mastra({
              agents: { [agentId]: rawAgent },
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
                          serviceName: 'query-task-search',
                          exporters: [new MastraStorageExporter()],
                        },
                      },
                    }),
                  }
                : {}),
            });
            const agent = mastra.getAgent(agentId);
            const r = await agent.generate(input.query, {
              requestContext: rc,
              abortSignal: ctx.abortSignal,
            });
            deps.onToolActivity?.(mapToolActivity(r.toolCalls, r.toolResults));
            return { text: r.text };
          })();

      const answer = out.text?.trim() ?? '';
      return {
        result: { answer },
        trust: { reasoningTrace: [], evidenceCitations: [], confidenceScore: answer ? 0.6 : 0.2 },
      };
    },
  };
}
