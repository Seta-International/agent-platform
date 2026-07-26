import { RequestContext } from '@mastra/core/request-context';
import type { SpecializedAgentSpec } from '@seta/agent-sdk';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { makeQueryOrchestratorTools } from '../../../src/backend/orchestration/orchestrator.tools.ts';
import { QueryOrchestratorInputSchema } from '../../../src/backend/orchestration/orchestrator.ts';
import type {
  QuerySubAgentInput,
  QuerySubAgentOutput,
} from '../../../src/backend/orchestration/schemas.ts';

const stub = (
  id: string,
  answer: string,
): SpecializedAgentSpec<QuerySubAgentInput, QuerySubAgentOutput> => ({
  id,
  description: id,
  inputSchema: z.object({ query: z.string() }),
  outputSchema: z.object({ answer: z.string() }),
  run: async () => ({
    result: { answer },
    trust: { reasoningTrace: [], evidenceCitations: [], confidenceScore: 1 },
  }),
});

describe('query orchestrator delegation tools', () => {
  it('exposes the four delegation tool ids', () => {
    const tools = makeQueryOrchestratorTools({
      taskQuery: stub('planner.query.taskQuery', 'q'),
      taskDetail: stub('planner.query.taskDetail', 'd'),
      teamInfo: stub('planner.query.teamInfo', 't'),
      generalAnswer: stub('planner.query.generalAnswer', 'g'),
      ctx: { tenantId: 't1', actorUserId: 'u1' },
    });
    expect(Object.keys(tools).sort()).toEqual([
      'planner_answerQuestion',
      'planner_queryTasksAgent',
      'planner_taskDetailAgent',
      'planner_teamInfoAgent',
    ]);
  });

  it('delegates to the wrapped sub-agent and returns its answer', async () => {
    const tools = makeQueryOrchestratorTools({
      taskQuery: stub('planner.query.taskQuery', 'you have 4 open tasks'),
      taskDetail: stub('planner.query.taskDetail', 'd'),
      teamInfo: stub('planner.query.teamInfo', 't'),
      generalAnswer: stub('planner.query.generalAnswer', 'g'),
      ctx: { tenantId: 't1', actorUserId: 'u1' },
    });
    const rc = new RequestContext();
    rc.set('actor', { type: 'user', user_id: 'u1' });
    rc.set('tenant_id', 't1');
    const res = (await tools.planner_queryTasksAgent.execute!({ query: 'my open tasks' }, {
      requestContext: rc,
    } as never)) as { answer: string };
    expect(res.answer).toBe('you have 4 open tasks');
  });
});

describe('query orchestrator instructions', () => {
  it('input schema accepts userText + nullable taskId', () => {
    const parsed = QueryOrchestratorInputSchema.parse({ userText: 'my tasks', taskId: null });
    expect(parsed.userText).toBe('my tasks');
  });
});
