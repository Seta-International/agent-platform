import { InMemoryStore } from '@mastra/core/storage';
import { EMPTY_TRUST, type SpecializedAgentSpec } from '@seta/agent-sdk';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  makeChatOrchestrationResumer,
  makeChatOrchestrationStreamer,
  type OrchestratorDeps,
  type ResumeDecision,
} from '../../../src/backend/orchestration/orchestrator.ts';

const ctx = { tenantId: 't1', actorUserId: 'a1' };

const stub = <I, O>(id: string): SpecializedAgentSpec<I, O> => ({
  id,
  description: '',
  inputSchema: z.any() as z.ZodType<I>,
  outputSchema: z.any() as z.ZodType<O>,
  run: async () => ({ result: {} as O, trust: EMPTY_TRUST }),
});

const baseDeps: Omit<OrchestratorDeps, 'streamAgent' | 'resumeAgent' | 'runAgent'> = {
  taskAnalyzer: stub('staffing.taskAnalyzer'),
  skillMatcher: stub('staffing.skillMatcher'),
  avaiChecker: stub('staffing.avaiChecker'),
  recommender: stub('staffing.recommender'),
  generalAnswer: stub('staffing.generalAnswer'),
  assign: { assign: async () => {} },
  userProfileLookup: { findByName: async () => [] },
  resolveModel: () => ({}) as never,
  mastraStorage: new InMemoryStore(),
};

function fakeOutput(
  toolResults: { payload: { toolName: string; result: unknown } }[],
  text: string | undefined = undefined,
) {
  return {
    fullStream: (async function* () {
      yield { type: 'finish' };
    })(),
    toolCalls: Promise.resolve([] as never),
    toolResults: Promise.resolve(toolResults as never),
    text: Promise.resolve(text),
  };
}

describe('makeChatOrchestrationStreamer', () => {
  it('returns the live Mastra output and a finalize() that assembles result + trust', async () => {
    const startChat = makeChatOrchestrationStreamer({
      ...baseDeps,
      streamAgent: () =>
        fakeOutput([
          { payload: { toolName: 'staffing_analyzeTasks', result: { skills: ['aws'] } } },
        ]),
    });
    const run = await startChat({ userText: 'what skills', taskId: 't-1' }, ctx);
    expect(run.output).toBeDefined();
    const fin = await run.finalize();
    expect((fin.result as { skills?: string[] }).skills).toEqual(['aws']);
    expect(fin.trust.confidenceScore).toBeGreaterThan(0);
  });

  it('finalize() rejects when the run errors', async () => {
    const startChat = makeChatOrchestrationStreamer({
      ...baseDeps,
      streamAgent: () => ({
        fullStream: (async function* () {
          yield { type: 'start' };
        })(),
        toolCalls: Promise.reject(new Error('LLM error')) as never,
        toolResults: Promise.resolve([] as never),
        text: Promise.resolve(undefined),
      }),
    });
    const run = await startChat({ userText: 'x', taskId: null }, ctx);
    await expect(run.finalize()).rejects.toThrow('LLM error');
  });
});

describe('makeChatOrchestrationResumer', () => {
  it('resumes by runId with the decision and returns a ChatStreamRun', async () => {
    const captured: { resume?: ResumeDecision; runId?: string; toolCallId?: string } = {};
    const resumeChat = makeChatOrchestrationResumer({
      ...baseDeps,
      resumeAgent: ({ resume, runId, toolCallId }) => {
        captured.resume = resume;
        captured.runId = runId;
        captured.toolCallId = toolCallId;
        return fakeOutput([], 'Assigned u1 to t-1.');
      },
    });
    const resume: ResumeDecision = { decision: 'approve', overrideUserIds: ['u1'] };
    const run = await resumeChat(resume, {
      tenantId: 't1',
      actorUserId: 'a1',
      mastraRunId: 'run-uuid-9',
      toolCallId: 'tc-9',
    });
    expect(run.output).toBeDefined();
    expect(captured.runId).toBe('run-uuid-9');
    expect(captured.toolCallId).toBe('tc-9');
    expect(captured.resume).toEqual(resume);
    const fin = await run.finalize();
    expect(fin.trust).toBeDefined();
  });
});
