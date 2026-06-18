import { Agent } from '@mastra/core/agent';
import type { MastraModelConfig } from '@mastra/core/llm';
import { RequestContext } from '@mastra/core/request-context';
import type {
  AgentResult,
  AgentTool,
  SpecializedAgentRunCtx,
  SpecializedAgentSpec,
} from '@seta/agent-sdk';
import {
  plannerGetOpenTaskCountTool,
  plannerQueryTasksTool,
  plannerResolveMemberTool,
} from '@seta/planner/agent-tools';
import { pickModel } from '../model.ts';
import {
  type QnaSubAgentInput as In,
  type QnaSubAgentOutput as Out,
  QnaSubAgentInputSchema,
  QnaSubAgentOutputSchema,
} from '../schemas.ts';

export const TASK_QUERY_TOOL_IDS = [
  'planner_queryTasks',
  'planner_findSimilarTasks',
  'planner_getOpenTaskCountForUser',
  'planner_resolveMember',
] as const;

export interface QnaTaskQueryDeps {
  resolveModel: () => MastraModelConfig;
  /** Built find-similar tool (factory needs provider + databaseUrl), injected by the runtime. */
  findSimilarTasksTool: AgentTool;
  runAgent?: (args: { input: In; requestContext: RequestContext }) => Promise<{ text: string }>;
}

const INSTRUCTIONS = `You answer "which tasks?" questions — the user is discovering a
SET of tasks, not asking about one known task. Answer in prose.

Tools:
- planner_queryTasks: structured filter (assignee, plan, status, due window) → list.
- planner_findSimilarTasks: semantic/topic search ("tasks about the billing migration").
- planner_getOpenTaskCountForUser: a COUNT when the user only wants a number.
- planner_resolveMember: turn a person's NAME/email into their userId.

Identity (never ask the user for an id, never invent one):
- "my/I/me" tasks → planner_queryTasks with assigneeScope: "me" (count → getOpenTaskCount scope: "me").
- A named OTHER person ("Tuan's tasks") → call planner_resolveMember first; pass the
  returned userId as assigneeUserId. If it returns MORE THAN ONE candidate, ask the user
  which person they mean. If it returns none, say you couldn't find that person.

Other heuristics: "how many ..." → getOpenTaskCount; topic phrasing ("about X") → findSimilarTasks.
Empty result sets are valid answers — say "you have no matching tasks", don't error.
Read-only.`;

export function makeQnaTaskQueryAgent(deps: QnaTaskQueryDeps): SpecializedAgentSpec<In, Out> {
  return {
    id: 'planner.qna.taskQuery',
    description:
      'Discovers/lists/counts tasks matching criteria (structured + semantic), in prose.',
    inputSchema: QnaSubAgentInputSchema,
    outputSchema: QnaSubAgentOutputSchema,
    run: async (input, ctx: SpecializedAgentRunCtx): Promise<AgentResult<Out>> => {
      const rc = new RequestContext();
      rc.set('actor', { type: 'user', user_id: ctx.actorUserId });
      rc.set('tenant_id', ctx.tenantId);
      rc.set('effective_permissions', ctx.effectivePermissions ?? new Set<string>());

      const out = deps.runAgent
        ? await deps.runAgent({ input, requestContext: rc })
        : await (async () => {
            const agent = new Agent({
              id: 'planner.qna.taskQuery',
              name: 'Planner Task Query',
              instructions: INSTRUCTIONS,
              model: pickModel(ctx, deps.resolveModel),
              tools: {
                planner_queryTasks: plannerQueryTasksTool,
                planner_findSimilarTasks: deps.findSimilarTasksTool,
                planner_getOpenTaskCountForUser: plannerGetOpenTaskCountTool,
                planner_resolveMember: plannerResolveMemberTool,
              } as never,
            });
            const r = await agent.generate(input.query, {
              requestContext: rc,
              abortSignal: ctx.abortSignal,
            });
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
