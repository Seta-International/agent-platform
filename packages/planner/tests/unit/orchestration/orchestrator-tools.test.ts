import { RequestContext } from '@mastra/core/request-context';
import type { SpecializedAgentSpec } from '@seta/agent-sdk';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { makeQnaOrchestratorTools } from '../../../src/backend/orchestration/orchestrator.tools.ts';
import type {
  QnaSubAgentInput,
  QnaSubAgentOutput,
} from '../../../src/backend/orchestration/schemas.ts';

const stub = (
  id: string,
  answer: string,
): SpecializedAgentSpec<QnaSubAgentInput, QnaSubAgentOutput> => ({
  id,
  description: id,
  inputSchema: z.object({ query: z.string() }),
  outputSchema: z.object({ answer: z.string() }),
  run: async () => ({
    result: { answer },
    trust: { reasoningTrace: [], evidenceCitations: [], confidenceScore: 1 },
  }),
});

describe('qna orchestrator delegation tools', () => {
  it('exposes the four delegation tool ids', () => {
    const tools = makeQnaOrchestratorTools({
      taskQuery: stub('planner.qna.taskQuery', 'q'),
      taskDetail: stub('planner.qna.taskDetail', 'd'),
      teamInfo: stub('planner.qna.teamInfo', 't'),
      generalAnswer: stub('planner.qna.generalAnswer', 'g'),
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
    const tools = makeQnaOrchestratorTools({
      taskQuery: stub('planner.qna.taskQuery', 'you have 4 open tasks'),
      taskDetail: stub('planner.qna.taskDetail', 'd'),
      teamInfo: stub('planner.qna.teamInfo', 't'),
      generalAnswer: stub('planner.qna.generalAnswer', 'g'),
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
