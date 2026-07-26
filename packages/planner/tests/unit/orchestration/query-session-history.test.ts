import type { SpecializedAgentSpec } from '@seta/agent-sdk';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  makeQueryChatStreamer,
  type QueryOrchestratorDeps,
} from '../../../src/backend/orchestration/orchestrator.ts';
import type {
  QuerySubAgentInput,
  QuerySubAgentOutput,
} from '../../../src/backend/orchestration/schemas.ts';

const stub = (id: string): SpecializedAgentSpec<QuerySubAgentInput, QuerySubAgentOutput> => ({
  id,
  description: id,
  inputSchema: z.object({ query: z.string() }),
  outputSchema: z.object({ answer: z.string() }),
  run: async () => ({
    result: { answer: 'stub' },
    trust: { reasoningTrace: [], evidenceCitations: [], confidenceScore: 1 },
  }),
});

function makeDeps(streamAgent: QueryOrchestratorDeps['streamAgent']): QueryOrchestratorDeps {
  return {
    taskQuery: stub('planner.query.taskQuery'),
    taskDetail: stub('planner.query.taskDetail'),
    teamInfo: stub('planner.query.teamInfo'),
    generalAnswer: stub('planner.query.generalAnswer'),
    resolveModel: () => ({}) as never,
    mastraStorage: {} as never,
    streamAgent,
  };
}

describe('Query orchestrator session history', () => {
  it('passes sessionHistory to streamAgent seam', async () => {
    const streamAgent = vi.fn((_args: Record<string, unknown>) => ({
      text: Promise.resolve('answer'),
    })) as unknown as NonNullable<QueryOrchestratorDeps['streamAgent']>;
    const spy = vi.fn(streamAgent);
    const deps = makeDeps(spy);
    const streamer = makeQueryChatStreamer(deps);

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
    })) as unknown as NonNullable<QueryOrchestratorDeps['streamAgent']>;
    const spy = vi.fn(streamAgent);
    const deps = makeDeps(spy);
    const streamer = makeQueryChatStreamer(deps);

    await streamer(
      { userText: 'what tasks do I have?', taskId: null },
      { tenantId: 't1', actorUserId: 'u1' },
    );

    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0]?.[0]).toHaveProperty('sessionHistory', undefined);
  });
});
