import { InMemoryStore } from '@mastra/core/storage';
import { EMPTY_TRUST, type SpecializedAgentSpec } from '@seta/agent-sdk';
import type { OrchestrationEvent } from '@seta/shared-orchestration';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  makeChatOrchestrationResumer,
  makeChatOrchestrationStreamer,
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

/** A fake Agent.stream() result: emits two step events through the injected
 *  onEvent (simulating the orchestrator's tools running), then resolves the
 *  awaitables the finalize step reads. */
function fakeStream(
  onEvent: (e: OrchestrationEvent) => void,
  toolResults: { payload: { toolName: string; result: unknown } }[],
) {
  return {
    fullStream: (async function* () {
      onEvent({ kind: 'step-start', stepId: 'taskAnalyzer', agentId: 'staffing.taskAnalyzer' });
      onEvent({ kind: 'step-done', stepId: 'taskAnalyzer', trust: EMPTY_TRUST });
      yield { type: 'finish' };
    })(),
    toolCalls: Promise.resolve([] as never),
    toolResults: Promise.resolve(toolResults as never),
    text: Promise.resolve(undefined),
  };
}

/** A fake Agent.stream() result that natively suspends: emits the composite's
 *  step events, then surfaces a `tool-call-suspended` chunk (spike-confirmed
 *  shape) and resolves the awaitables to the suspended sentinels. */
function fakeSuspendingStream(onEvent: (e: OrchestrationEvent) => void, card: unknown) {
  return {
    fullStream: (async function* () {
      onEvent({ kind: 'step-start', stepId: 'proposeAssignment', agentId: 'staffing.recommender' });
      onEvent({ kind: 'step-done', stepId: 'proposeAssignment', trust: EMPTY_TRUST });
      yield {
        type: 'tool-call-suspended',
        runId: 'run-uuid-1',
        from: 'AGENT',
        payload: {
          toolCallId: 'tc-1',
          toolName: 'staffing_proposeAssignment',
          suspendPayload: { card },
          args: {},
          resumeSchema: {},
        },
      };
    })(),
    toolCalls: Promise.resolve([] as never),
    toolResults: Promise.resolve([] as never),
    text: Promise.resolve(''),
  };
}

/** A fake stream whose fullStream throws after one yield. */
function fakeStreamThrowing() {
  return {
    fullStream: (async function* () {
      yield { type: 'step-start' };
      throw new Error('LLM error');
    })(),
    toolCalls: Promise.resolve([] as never),
    toolResults: Promise.resolve([] as never),
    text: Promise.resolve(undefined),
  };
}

describe('makeChatOrchestrationStreamer', () => {
  it('propagates fullStream errors instead of hanging', async () => {
    const streamChat = makeChatOrchestrationStreamer({
      taskAnalyzer: stub('staffing.taskAnalyzer'),
      skillMatcher: stub('staffing.skillMatcher'),
      avaiChecker: stub('staffing.avaiChecker'),
      recommender: stub('staffing.recommender'),
      generalAnswer: stub('staffing.generalAnswer'),
      assign: { assign: async () => {} },
      userProfileLookup: { findByName: async () => [] },
      resolveModel: () => ({}) as never,
      mastraStorage: new InMemoryStore(),
      streamAgent: () => fakeStreamThrowing(),
    });

    await expect(async () => {
      for await (const _ of streamChat({ userText: 'test', taskId: null }, ctx)) {
        void _;
      }
    }).rejects.toThrow('LLM error');
  });

  it('forwards sub-step events live then yields a final result', async () => {
    let sink!: (e: OrchestrationEvent) => void;
    const streamChat = makeChatOrchestrationStreamer({
      taskAnalyzer: stub('staffing.taskAnalyzer'),
      skillMatcher: stub('staffing.skillMatcher'),
      avaiChecker: stub('staffing.avaiChecker'),
      recommender: stub('staffing.recommender'),
      generalAnswer: stub('staffing.generalAnswer'),
      assign: { assign: async () => {} },
      userProfileLookup: { findByName: async () => [] },
      resolveModel: () => ({}) as never,
      mastraStorage: new InMemoryStore(),
      // The seam captures the onEvent the entrypoint wired into the tools' ctx.
      streamAgent: ({ requestContext }) => {
        // onEvent is read off the request context bridge set by the entrypoint.
        sink = (requestContext as unknown as { __onEvent: typeof sink }).__onEvent;
        return fakeStream(sink, [
          { payload: { toolName: 'staffing_analyzeTasks', result: { skills: ['aws'] } } },
        ]);
      },
    });

    const events: OrchestrationEvent[] = [];
    for await (const e of streamChat({ userText: 'what skills', taskId: 't-1' }, ctx)) {
      events.push(e);
    }

    expect(events.map((e) => e.kind)).toEqual(['step-start', 'step-done', 'final']);
    const final = events.at(-1) as Extract<OrchestrationEvent, { kind: 'final' }>;
    expect((final.result as { skills?: string[] }).skills).toEqual(['aws']);
  });

  it('emits an approval event and no final on native suspend', async () => {
    const card = { kind: 'staffing.assignment', taskId: 't-1', candidate: { userId: 'u-1' } };
    const streamChat = makeChatOrchestrationStreamer({
      taskAnalyzer: stub('staffing.taskAnalyzer'),
      skillMatcher: stub('staffing.skillMatcher'),
      avaiChecker: stub('staffing.avaiChecker'),
      recommender: stub('staffing.recommender'),
      generalAnswer: stub('staffing.generalAnswer'),
      assign: { assign: async () => {} },
      userProfileLookup: { findByName: async () => [] },
      resolveModel: () => ({}) as never,
      mastraStorage: new InMemoryStore(),
      streamAgent: ({ requestContext }) => {
        const sink = (requestContext as unknown as { __onEvent: (e: OrchestrationEvent) => void })
          .__onEvent;
        return fakeSuspendingStream(sink, card);
      },
    });

    const events: OrchestrationEvent[] = [];
    for await (const e of streamChat({ userText: 'who should do t-1', taskId: 't-1' }, ctx)) {
      events.push(e);
    }

    expect(events.map((e) => e.kind)).toEqual(['step-start', 'step-done', 'approval']);
    const approval = events.at(-1) as Extract<OrchestrationEvent, { kind: 'approval' }>;
    expect(approval.card).toEqual(card);
    expect(approval.mastraRunId).toBe('run-uuid-1');
    expect(approval.toolCallId).toBe('tc-1');
    expect(events.some((e) => e.kind === 'final')).toBe(false);
  });
});

describe('makeChatOrchestrationResumer', () => {
  it('resumes by runId with the decision and yields the continuation', async () => {
    const captured: { resume?: ResumeDecision; runId?: string; toolCallId?: string } = {};
    const resumeChat = makeChatOrchestrationResumer({
      taskAnalyzer: stub('staffing.taskAnalyzer'),
      skillMatcher: stub('staffing.skillMatcher'),
      avaiChecker: stub('staffing.avaiChecker'),
      recommender: stub('staffing.recommender'),
      generalAnswer: stub('staffing.generalAnswer'),
      assign: { assign: async () => {} },
      userProfileLookup: { findByName: async () => [] },
      resolveModel: () => ({}) as never,
      mastraStorage: new InMemoryStore(),
      // Resume seam: stands in for built.agent.resumeStream — captures the resume
      // coordinates and drives the drain via the supplied onEvent.
      resumeAgent: ({ resume, runId, toolCallId, onEvent }) => {
        captured.resume = resume;
        captured.runId = runId;
        captured.toolCallId = toolCallId;
        return {
          fullStream: (async function* () {
            onEvent({
              kind: 'step-start',
              stepId: 'proposeAssignment',
              agentId: 'staffing.recommender',
            });
            onEvent({ kind: 'step-done', stepId: 'proposeAssignment', trust: EMPTY_TRUST });
            yield { type: 'finish' };
          })(),
          toolCalls: Promise.resolve([] as never),
          toolResults: Promise.resolve([] as never),
          text: Promise.resolve('Assigned u1 to t-1.'),
        };
      },
    });

    const resume: ResumeDecision = { decision: 'approve', overrideUserIds: ['u1'] };
    const events: OrchestrationEvent[] = [];
    for await (const e of resumeChat(resume, {
      tenantId: 't1',
      actorUserId: 'a1',
      mastraRunId: 'run-uuid-9',
      toolCallId: 'tc-9',
    })) {
      events.push(e);
    }

    expect(captured.runId).toBe('run-uuid-9');
    expect(captured.toolCallId).toBe('tc-9');
    expect(captured.resume).toEqual(resume);
    expect(events.map((e) => e.kind)).toEqual(['step-start', 'step-done', 'final']);
  });
});
