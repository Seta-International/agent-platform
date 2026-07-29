import { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import type { MastraModelConfig } from '@mastra/core/llm';
import { ConsoleLogger, type LogLevel } from '@mastra/core/logger';
import { RequestContext } from '@mastra/core/request-context';
import type { MastraCompositeStore } from '@mastra/core/storage';
import { MastraStorageExporter, Observability } from '@mastra/observability';
import {
  type AgentResult,
  type SpecializedAgentRunCtx,
  type SpecializedAgentSpec,
  withTemporalContext,
} from '@seta/agent-sdk';
import {
  plannerGetItemActivityTool,
  plannerGetTaskTool,
  plannerGetTimelineTool,
  plannerListCommentsTool,
  plannerQueryTasksTool,
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

export const TASK_DETAIL_TOOL_IDS = [
  'planner_getTask',
  'planner_getItemActivity',
  'planner_getTimeline',
  'planner_listComments',
  'planner_queryTasks',
] as const;

export interface QueryTaskDetailDeps {
  /** Injectable clock for deterministic date anchors (evals pass a frozen instant). */
  now?: () => Date;
  resolveModel: () => MastraModelConfig;
  mastraStorage: MastraCompositeStore;
  runAgent?: (args: { input: In; requestContext: RequestContext }) => Promise<{ text: string }>;
  /** Eval seam — receives this agent's executed tool calls after generate(). */
  onToolActivity?: OnToolActivity;
}

const INSTRUCTIONS = `You answer questions about ONE known task in prose.
The task is identified by a UUID in the user's message (often inside a
"[Context: planner.task#<id>]" prefix), an ordinal ("#1", "the first one"),
or by its title/name.

Tools:
- planner_getTask: fetch full task details by taskRef (UUID or ordinal). This is
  your primary tool — call it whenever you have a task id or ordinal.
- planner_queryTasks: use ONLY when the user references a task by name/title
  instead of UUID. Call with titleContains + status:"any", take the matching
  task's taskId, then call planner_getTask with that taskId.
  Do NOT use for listing or filtering — you are a single-task detail agent.
- planner_getItemActivity: change history (activity feed) for a task, newest first.
- planner_getTimeline: tasks in a plan within a date window (start/due dates).
- planner_listComments: the task's discussion thread (only when comments are asked about).

Workflow:
1. UUID or ordinal available → planner_getTask directly.
2. Only a task name/title → planner_queryTasks(titleContains: "<name>", status: "any")
   → pick the best match → planner_getTask(taskRef: "<taskId>").
3. Multiple matches from queryTasks → ask the user which one they mean.
4. No matches → tell the user no task with that name was found.

Call planner_getTask to ground every answer in the live record. Call
planner_listComments only if the user asks about comments/discussion. If no task
can be identified and no name is given, ask the user which task they mean — do not
guess.

${GROUNDING_POLICY}
Read-only: never claim to have changed anything.`;

export function makeQueryTaskDetailAgent(deps: QueryTaskDetailDeps): SpecializedAgentSpec<In, Out> {
  return {
    id: 'planner.query.taskDetail',
    description: 'Deep-dives one known task (details, checklist, assignees, comments) in prose.',
    inputSchema: QuerySubAgentInputSchema,
    outputSchema: QuerySubAgentOutputSchema,
    run: async (input, ctx: SpecializedAgentRunCtx): Promise<AgentResult<Out>> => {
      const rc = new RequestContext();
      rc.set('actor', { type: 'user', user_id: ctx.actorUserId });
      rc.set('tenant_id', ctx.tenantId);
      rc.set('effective_permissions', ctx.effectivePermissions ?? new Set<string>());

      const out = deps.runAgent
        ? await deps.runAgent({ input, requestContext: rc })
        : await (async () => {
            const agentId = 'planner.query.taskDetail';
            const rawAgent = new Agent({
              id: agentId,
              name: 'Planner Task Detail',
              instructions: withTemporalContext(INSTRUCTIONS, { now: deps.now?.() }),
              model: pickModel(ctx, deps.resolveModel),
              tools: {
                planner_getTask: plannerGetTaskTool,
                planner_getItemActivity: plannerGetItemActivityTool,
                planner_getTimeline: plannerGetTimelineTool,
                planner_listComments: plannerListCommentsTool,
                planner_queryTasks: plannerQueryTasksTool,
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
                          serviceName: 'query-task-detail',
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
