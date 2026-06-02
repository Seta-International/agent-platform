import { EMPTY_TRUST, type SpecializedAgentSpec } from '@seta/agent-sdk';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { runOrchestrationInline } from '../../src/inline-runner.ts';
import type { OrchestrationEvent, OrchestrationSpec } from '../../src/types.ts';
import { InMemoryRunStateRepository } from './fakes.ts';

const incAgent: SpecializedAgentSpec<{ x: number }, { y: number }> = {
  id: 'inc',
  description: 'inc',
  inputSchema: z.object({ x: z.number() }),
  outputSchema: z.object({ y: z.number() }),
  run: async (input) => ({ result: { y: input.x + 1 }, trust: EMPTY_TRUST }),
};
const getAgent = (id: string) => (id === 'inc' ? (incAgent as SpecializedAgentSpec) : undefined);
const CTX = { tenantId: 't1', actorUserId: 'u1' };

async function collect(it: AsyncIterable<OrchestrationEvent>): Promise<OrchestrationEvent[]> {
  const out: OrchestrationEvent[] = [];
  for await (const e of it) out.push(e);
  return out;
}

describe('runOrchestrationInline', () => {
  it('yields step-start/step-done per step then a final event, and persists', async () => {
    const repo = new InMemoryRunStateRepository();
    const onComplete = vi.fn(async () => {});
    const spec: OrchestrationSpec = {
      id: 'o1',
      steps: [
        { id: 'first', agentId: 'inc', input: (_s, runIn) => runIn },
        {
          id: 'second',
          agentId: 'inc',
          input: (s) => ({ x: (s.outputs.first as { y: number }).y }),
        },
      ],
      serializationKey: () => 'k',
      onComplete,
    };

    const events = await collect(
      runOrchestrationInline('o1', { x: 1 }, CTX, {
        repo,
        getOrchestration: () => spec,
        getAgent,
        newRunId: () => 'run-1',
      }),
    );

    expect(events.map((e) => e.kind)).toEqual([
      'step-start',
      'step-done',
      'step-start',
      'step-done',
      'final',
    ]);
    const final = events.at(-1) as { kind: 'final'; result: unknown };
    expect(final.result).toEqual({ y: 3 });
    expect((await repo.loadRun('run-1')).status).toBe('completed');
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('stops early when a step is terminal', async () => {
    const gate: SpecializedAgentSpec<{ x: number }, { y: number }> = {
      id: 'gate',
      description: 'gate',
      inputSchema: z.object({ x: z.number() }),
      outputSchema: z.object({ y: z.number() }),
      run: async () => ({ result: { y: 0 }, trust: EMPTY_TRUST, terminal: true }),
    };
    const repo = new InMemoryRunStateRepository();
    const spec: OrchestrationSpec = {
      id: 'o1',
      steps: [
        { id: 'g', agentId: 'gate', input: (_s, runIn) => runIn },
        { id: 'never', agentId: 'inc', input: (_s, runIn) => runIn },
      ],
      serializationKey: () => 'k',
      onComplete: async () => {},
    };

    const events = await collect(
      runOrchestrationInline('o1', { x: 1 }, CTX, {
        repo,
        getOrchestration: () => spec,
        getAgent: (id) => (id === 'gate' ? (gate as SpecializedAgentSpec) : getAgent(id)),
        newRunId: () => 'run-1',
      }),
    );

    // Only the gate step ran, then final.
    expect(events.map((e) => e.kind)).toEqual(['step-start', 'step-done', 'final']);
  });

  it('interleaves sub-step events emitted by an agent during its step', async () => {
    const subEmitter: SpecializedAgentSpec<{ x: number }, { y: number }> = {
      id: 'emitter',
      description: 'emits two sub-steps then returns',
      inputSchema: z.object({ x: z.number() }),
      outputSchema: z.object({ y: z.number() }),
      run: async (_input, ctx) => {
        ctx.onEvent?.({ kind: 'step-start', stepId: 'sub', agentId: 'child' });
        ctx.onEvent?.({ kind: 'step-done', stepId: 'sub', trust: EMPTY_TRUST });
        return { result: { y: 42 }, trust: EMPTY_TRUST };
      },
    };
    const repo = new InMemoryRunStateRepository();
    const spec: OrchestrationSpec = {
      id: 'o2',
      steps: [{ id: 'orchestrate', agentId: 'emitter', input: (_s, runIn) => runIn }],
      serializationKey: () => 'k',
      onComplete: async () => {},
    };

    const events = await collect(
      runOrchestrationInline('o2', { x: 1 }, CTX, {
        repo,
        getOrchestration: () => spec,
        getAgent: (id) => (id === 'emitter' ? (subEmitter as SpecializedAgentSpec) : undefined),
        newRunId: () => 'run-2',
      }),
    );

    expect(events.map((e) => `${e.kind}:${'stepId' in e ? e.stepId : 'final'}`)).toEqual([
      'step-start:orchestrate',
      'step-start:sub',
      'step-done:sub',
      'step-done:orchestrate',
      'final:final',
    ]);
    const final = events.at(-1) as { kind: 'final'; result: unknown };
    expect(final.result).toEqual({ y: 42 });
  });
});
