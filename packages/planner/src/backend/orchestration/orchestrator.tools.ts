import {
  defineAgentTool,
  type SpecializedAgentRunCtx,
  type SpecializedAgentSpec,
} from '@seta/agent-sdk';
import { z } from 'zod';
import type { QuerySubAgentInput, QuerySubAgentOutput } from './schemas.ts';

type SubAgent = SpecializedAgentSpec<QuerySubAgentInput, QuerySubAgentOutput>;

export interface QueryOrchestratorToolDeps {
  taskQuery: SubAgent;
  taskDetail: SubAgent;
  teamInfo: SubAgent;
  generalAnswer: SubAgent;
  /** The orchestrator's run ctx — sub-agents inherit tenant/actor/permissions/model. */
  ctx: SpecializedAgentRunCtx;
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

  const delegate = (id: string, name: string, description: string, sub: SubAgent) =>
    defineAgentTool({
      id,
      name,
      description,
      input: z.object({ query: z.string().describe('The focused sub-question to answer.') }),
      output: z.object({ answer: z.string() }),
      executionTimeoutMs: 120_000,
      execute: async ({ query }) => {
        const res = await sub.run({ query }, subCtx);
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
