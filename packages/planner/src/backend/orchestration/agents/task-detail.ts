import { Agent } from '@mastra/core/agent';
import type { MastraModelConfig } from '@mastra/core/llm';
import { RequestContext } from '@mastra/core/request-context';
import type { AgentResult, SpecializedAgentRunCtx, SpecializedAgentSpec } from '@seta/agent-sdk';
import { plannerGetTaskTool, plannerListCommentsTool } from '@seta/planner/agent-tools';
import { pickModel } from '../model.ts';
import {
  type QnaSubAgentInput as In,
  type QnaSubAgentOutput as Out,
  QnaSubAgentInputSchema,
  QnaSubAgentOutputSchema,
} from '../schemas.ts';

export const TASK_DETAIL_TOOL_IDS = ['planner_getTask', 'planner_listComments'] as const;

export interface QnaTaskDetailDeps {
  resolveModel: () => MastraModelConfig;
  runAgent?: (args: { input: In; requestContext: RequestContext }) => Promise<{ text: string }>;
}

const INSTRUCTIONS = `You answer questions about ONE known task in prose.
The task is identified by a UUID in the user's message (often inside a
"[Context: planner.task#<id>]" prefix) or named explicitly.

Tools:
- planner_getTask: the task with assignees, labels, checklist, references, due date.
- planner_listComments: the task's discussion thread (only when comments are asked about).

Call planner_getTask first to ground every answer in the live record. Call
planner_listComments only if the user asks about comments/discussion. If no task
id is present and none can be derived, ask the user which task they mean — do not
guess. Read-only: never claim to have changed anything.`;

export function makeQnaTaskDetailAgent(deps: QnaTaskDetailDeps): SpecializedAgentSpec<In, Out> {
  return {
    id: 'planner.qna.taskDetail',
    description: 'Deep-dives one known task (details, checklist, assignees, comments) in prose.',
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
              id: 'planner.qna.taskDetail',
              name: 'Planner Task Detail',
              instructions: INSTRUCTIONS,
              model: pickModel(ctx, deps.resolveModel),
              tools: {
                planner_getTask: plannerGetTaskTool,
                planner_listComments: plannerListCommentsTool,
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
