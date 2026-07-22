import {
  defineAgentTool,
  type SpecializedAgentRunCtx,
  type SpecializedAgentSpec,
} from '@seta/agent-sdk';
import { z } from 'zod';
import type { QuerySubAgentInput, QuerySubAgentOutput } from './schemas.ts';
import type { OnToolActivity } from './tool-activity.ts';

type SubAgent = SpecializedAgentSpec<QuerySubAgentInput, QuerySubAgentOutput>;

export interface QueryOrchestratorToolDeps {
  taskQuery: SubAgent;
  taskDetail: SubAgent;
  teamInfo: SubAgent;
  generalAnswer: SubAgent;
  /** The orchestrator's run ctx — sub-agents inherit tenant/actor/permissions/model. */
  ctx: SpecializedAgentRunCtx;
  /** The page-context prefix ("[Context: planner.<kind>#<id>]") recovered
   *  deterministically from the turn. Re-attached to every delegate query so the
   *  target id never depends on the LLM copying it correctly (fix B for PQ-008). */
  contextPrefix?: string;
  /** Eval seam — receives the delegation (routing) call after each sub-agent run. */
  onToolActivity?: OnToolActivity;
}

export function makeQueryOrchestratorTools(deps: QueryOrchestratorToolDeps) {
  const { ctx } = deps;
  const subCtx: SpecializedAgentRunCtx = {
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    effectivePermissions: ctx.effectivePermissions,
    abortSignal: ctx.abortSignal,
    model: ctx.model,
  };

  // Re-attach the recovered page-context id to the delegate's query. The model
  // may drop or mangle the id when it rewrites the sub-question (PQ-008: it
  // replaced the task UUID with an example title), so we prepend it ourselves.
  // Skip if the model already carried the same prefix through, to avoid dupes.
  const withContext = (query: string): string => {
    const prefix = deps.contextPrefix;
    if (!prefix || query.includes(prefix)) return query;
    return `${prefix} ${query}`;
  };

  const delegate = (id: string, name: string, description: string, sub: SubAgent) =>
    defineAgentTool({
      id,
      name,
      description,
      input: z.object({ query: z.string().describe('The focused sub-question to answer.') }),
      output: z.object({ answer: z.string() }),
      executionTimeoutMs: 120_000,
      execute: async ({ query }) => {
        const grounded = withContext(query);
        const res = await sub.run({ query: grounded }, subCtx);
        deps.onToolActivity?.([
          { toolName: id, args: { query: grounded }, result: res.result, ok: true },
        ]);
        return { answer: res.result.answer };
      },
    });

  return {
    planner_queryTasksAgent: delegate(
      'planner_queryTasksAgent',
      'Query Tasks',
      'Delegate to the task-discovery agent: lists/counts/searches a SET of tasks ' +
        '("my open tasks", "how many due this week", "tasks about billing").',
      deps.taskQuery,
    ),
    planner_taskDetailAgent: delegate(
      'planner_taskDetailAgent',
      'Task Detail',
      'Delegate to the task-detail agent: deep-dive ONE known task ' +
        '("what does this task include", "who is on it", "its comments").',
      deps.taskDetail,
    ),
    planner_teamInfoAgent: delegate(
      'planner_teamInfoAgent',
      'Team Info',
      'Delegate to the team-info agent: group members, plans, buckets, skills ' +
        '("how many members", "what plans exist", "who knows React").',
      deps.teamInfo,
    ),
    planner_answerQuestion: delegate(
      'planner_answerQuestion',
      'General Answer',
      'Delegate to the general-answer agent for compound/summary/off-topic questions, ' +
        'or to synthesize across other sub-answers.',
      deps.generalAnswer,
    ),
  };
}
