import type { SpecializedAgentSpec } from '@seta/agent-sdk';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  makeQnaChatStreamer,
  type QnaOrchestratorDeps,
} from '../../../src/backend/orchestration/orchestrator.ts';
import type {
  QnaSubAgentInput,
  QnaSubAgentOutput,
} from '../../../src/backend/orchestration/schemas.ts';

const stub = (id: string): SpecializedAgentSpec<QnaSubAgentInput, QnaSubAgentOutput> => ({
  id,
  description: id,
  inputSchema: z.object({ query: z.string() }),
  outputSchema: z.object({ answer: z.string() }),
  run: async () => ({
    result: { answer: 'stub' },
    trust: { reasoningTrace: [], evidenceCitations: [], confidenceScore: 1 },
  }),
});

function makeDeps(streamAgent: QnaOrchestratorDeps['streamAgent']): QnaOrchestratorDeps {
  return {
    taskQuery: stub('planner.qna.taskQuery'),
    taskDetail: stub('planner.qna.taskDetail'),
    teamInfo: stub('planner.qna.teamInfo'),
    generalAnswer: stub('planner.qna.generalAnswer'),
    resolveModel: () => ({}) as never,
    streamAgent,
  };
}

describe('QnA orchestrator session history', () => {
  it('passes sessionHistory to streamAgent seam', async () => {
    const streamAgent = vi.fn((_args: Record<string, unknown>) => ({
      text: Promise.resolve('answer'),
    })) as unknown as NonNullable<QnaOrchestratorDeps['streamAgent']>;
    const spy = vi.fn(streamAgent);
    const deps = makeDeps(spy);
    const streamer = makeQnaChatStreamer(deps);

    const history = [
      { id: 'm1', role: 'user', content: 'find tasks about design', createdAt: new Date() },
      { id: 'm2', role: 'assistant', content: 'Found 3 tasks.', createdAt: new Date() },
    ] as never;

    await streamer(
      { userText: 'give me details of the first one', taskId: null },
      { tenantId: 't1', actorUserId: 'u1', sessionHistory: history },
    );

    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0]?.[0]).toHaveProperty('sessionHistory', history);
  });

  it('passes undefined sessionHistory when not provided', async () => {
    const streamAgent = vi.fn((_args: Record<string, unknown>) => ({
      text: Promise.resolve('answer'),
    })) as unknown as NonNullable<QnaOrchestratorDeps['streamAgent']>;
    const spy = vi.fn(streamAgent);
    const deps = makeDeps(spy);
    const streamer = makeQnaChatStreamer(deps);

    await streamer(
      { userText: 'what tasks do I have?', taskId: null },
      { tenantId: 't1', actorUserId: 'u1' },
    );

    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0]?.[0]).toHaveProperty('sessionHistory', undefined);
  });
});
