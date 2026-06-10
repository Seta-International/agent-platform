import type { RequestContext } from '@mastra/core/request-context';
import { EMPTY_TRUST, type SpecializedAgentSpec } from '@seta/agent-sdk';
import type { OrchestrationEvent } from '@seta/shared-orchestration';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { makeChatOrchestrationStreamer } from '../../../src/backend/orchestration/orchestrator.ts';

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

describe('makeChatOrchestrationStreamer', () => {
  it('forwards sub-step events live then yields a final result', async () => {
    let sink!: (e: OrchestrationEvent) => void;
    const streamChat = makeChatOrchestrationStreamer({
      taskAnalyzer: stub('staffing.taskAnalyzer'),
      skillMatcher: stub('staffing.skillMatcher'),
      avaiChecker: stub('staffing.avaiChecker'),
      recommender: stub('staffing.recommender'),
      generalAnswer: stub('staffing.generalAnswer'),
      resolveModel: () => ({}) as never,
      // The seam captures the onEvent the entrypoint wired into the tools' ctx.
      streamAgent: ({ requestContext }) => {
        // onEvent is read off the request context bridge set by the entrypoint.
        sink = (requestContext as unknown as { __onEvent: typeof sink }).__onEvent;
        return fakeStream(sink, [
          { payload: { toolName: 'callTaskAnalyzer', result: { skills: ['aws'] } } },
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
});
