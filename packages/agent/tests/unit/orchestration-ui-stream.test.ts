import { describe, expect, it } from 'vitest';
import { pumpOrchestrationStream } from '../../src/backend/orchestration-ui-stream.ts';

interface Chunk {
  type: string;
  id?: string;
  delta?: string;
  text?: string;
  data?: unknown;
}

class FakeWriter {
  chunks: Chunk[] = [];
  write(c: Chunk) {
    this.chunks.push(c);
  }
}

async function* parts(...p: Chunk[]) {
  for (const x of p) yield x;
}

const TRUST = { reasoningTrace: [], evidenceCitations: [], confidenceScore: 0.8 };

describe('pumpOrchestrationStream', () => {
  it('writes every part through and accumulates text for persistence', async () => {
    const w = new FakeWriter();
    const { assistantParts } = await pumpOrchestrationStream(
      w,
      parts(
        { type: 'text-start', id: 't' },
        { type: 'text-delta', id: 't', delta: 'Hello ' },
        { type: 'text-delta', id: 't', delta: 'world' },
        { type: 'text-end', id: 't' },
      ),
      {
        finalize: async () => ({ result: { skills: ['aws'] }, trust: TRUST }),
        onApproval: async () => {},
      },
    );
    expect(w.chunks.some((c) => c.type === 'text-delta' && c.delta === 'Hello ')).toBe(true);
    expect(assistantParts).toContainEqual({ type: 'text', text: 'Hello world' });
    expect(assistantParts).toContainEqual({
      type: 'data-result',
      id: 'result',
      data: { skills: ['aws'] },
    });
    expect(assistantParts).toContainEqual({ type: 'data-trust', id: 'trust', data: TRUST });
    expect(w.chunks.some((c) => c.type === 'data-result')).toBe(true);
    expect(w.chunks.some((c) => c.type === 'data-trust')).toBe(true);
  });

  it('reports decode timing: first/last token timestamps over the text deltas', async () => {
    const w = new FakeWriter();
    const { timing } = await pumpOrchestrationStream(
      w,
      parts(
        { type: 'text-start', id: 't' },
        { type: 'text-delta', id: 't', delta: 'a' },
        { type: 'text-delta', id: 't', delta: 'b' },
        { type: 'text-end', id: 't' },
      ),
      { finalize: async () => ({ result: {}, trust: TRUST }), onApproval: async () => {} },
    );
    expect(typeof timing.firstTokenAtMs).toBe('number');
    expect(typeof timing.lastTokenAtMs).toBe('number');
    expect(timing.lastTokenAtMs).toBeGreaterThanOrEqual(timing.firstTokenAtMs as number);
  });

  it('leaves decode timing undefined when no text delta is streamed', async () => {
    const w = new FakeWriter();
    const { timing } = await pumpOrchestrationStream(
      w,
      parts({ type: 'text-start', id: 't' }, { type: 'text-end', id: 't' }),
      { finalize: async () => ({ result: {}, trust: TRUST }), onApproval: async () => {} },
    );
    expect(timing.firstTokenAtMs).toBeUndefined();
    expect(timing.lastTokenAtMs).toBeUndefined();
  });

  it('strips <think> blocks and emits reasoning events; text-delta carries id', async () => {
    const w = new FakeWriter();
    const { assistantParts } = await pumpOrchestrationStream(
      w,
      parts(
        { type: 'text-start', id: 'txt' },
        { type: 'text-delta', id: 'txt', delta: '<think>internal reasoning</think>Answer here' },
        { type: 'text-end', id: 'txt' },
      ),
      { finalize: async () => ({ result: {}, trust: TRUST }), onApproval: async () => {} },
    );
    // text-delta must carry the id from the source stream
    const textDeltas = w.chunks.filter((c) => c.type === 'text-delta');
    expect(textDeltas.every((c) => c.id === 'txt')).toBe(true);
    // reasoning events must be present
    expect(w.chunks.some((c) => c.type === 'reasoning-start')).toBe(true);
    expect(
      w.chunks.some((c) => c.type === 'reasoning-delta' && c.delta === 'internal reasoning'),
    ).toBe(true);
    expect(w.chunks.some((c) => c.type === 'reasoning-end')).toBe(true);
    // text-end comes after all text-deltas
    const endIdx = w.chunks.findIndex((c) => c.type === 'text-end');
    const lastDeltaIdx =
      w.chunks
        .map((c, i) => (c.type === 'text-delta' ? i : -1))
        .filter((i) => i >= 0)
        .at(-1) ?? -1;
    expect(endIdx).toBeGreaterThan(lastDeltaIdx);
    // persisted parts
    expect(assistantParts).toContainEqual({ type: 'reasoning', text: 'internal reasoning' });
    expect(assistantParts).toContainEqual({ type: 'text', text: 'Answer here' });
  });

  it('fires onApproval and skips finalize when the run suspends', async () => {
    const w = new FakeWriter();
    const card = {
      toolCallId: 'tc-1',
      intent: 'Assign',
      riskBadge: 'write' as const,
      summary: 's',
      details: [],
      primary: { label: 'Assign', argsPatch: { taskId: 't-1' } },
      alternates: [],
      decline: { label: 'No' },
      meta: {
        tenantId: 'ten',
        userId: 'usr',
        agentPath: ['assignment', 'orchestrator'],
        toolId: 'assign_proposeAssignment',
        ts: new Date().toISOString(),
      },
    };
    const seen: unknown[] = [];
    let finalizeCalled = false;
    const { assistantParts } = await pumpOrchestrationStream(
      w,
      parts(
        { type: 'text-start', id: 't' },
        { type: 'text-delta', id: 't', delta: 'Let me assign that.' },
        { type: 'text-end', id: 't' },
        {
          type: 'data-tool-call-suspended',
          data: { runId: 'run-abc', toolCallId: 'tc-1', suspendPayload: { card } },
        },
      ),
      {
        finalize: async () => {
          finalizeCalled = true;
          return { result: {}, trust: TRUST };
        },
        onApproval: async (e) => {
          seen.push(e);
        },
      },
    );
    expect(seen).toEqual([{ card, mastraRunId: 'run-abc', toolCallId: 'tc-1' }]);
    expect(finalizeCalled).toBe(false);
    expect(w.chunks.some((c) => c.type === 'data-tool-call-suspended')).toBe(false);
    expect(assistantParts.some((p) => p.type === 'data-result')).toBe(false);
    expect(assistantParts).toContainEqual({ type: 'text', text: 'Let me assign that.' });
  });
});
