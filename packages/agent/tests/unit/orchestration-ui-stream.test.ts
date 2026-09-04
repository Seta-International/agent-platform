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

  it('keeps one reasoning part open when a <think> block spans a text-part boundary', async () => {
    // Self-hosted r1-style models stream <think> in the text channel, and a
    // multi-step orchestration turn segments that text into several
    // text-start/text-end pairs. A think block that straddles a text-end must
    // NOT be closed there: closing it (reasoning-end) and then continuing on
    // the next segment re-emits reasoning-delta on a dead id, which ai@6
    // rejects with "Received reasoning-delta for missing reasoning part".
    // The boundary falls mid-`</think>`: the first segment ends with the held
    // `</` tag prefix, so the splitter buffer is non-empty in think mode when
    // text-end fires — the exact condition under which the old flush emitted a
    // premature reasoning-end.
    const w = new FakeWriter();
    const { assistantParts } = await pumpOrchestrationStream(
      w,
      parts(
        { type: 'text-start', id: 'a' },
        { type: 'text-delta', id: 'a', delta: '<think>reasoning so far</' },
        { type: 'text-end', id: 'a' },
        { type: 'text-start', id: 'b' },
        { type: 'text-delta', id: 'b', delta: 'think>Final answer' },
        { type: 'text-end', id: 'b' },
      ),
      { finalize: async () => ({ result: {}, trust: TRUST }), onApproval: async () => {} },
    );

    // Exactly one reasoning part opened and closed once.
    const starts = w.chunks.filter((c) => c.type === 'reasoning-start');
    const ends = w.chunks.filter((c) => c.type === 'reasoning-end');
    expect(starts).toHaveLength(1);
    expect(ends).toHaveLength(1);
    const reasoningId = starts[0]?.id;

    // No reasoning-delta may appear after the reasoning-end for that id — that
    // is exactly the client-fatal ordering the bug produced.
    const endIdx = w.chunks.findIndex((c) => c.type === 'reasoning-end' && c.id === reasoningId);
    const deltasAfterEnd = w.chunks
      .slice(endIdx + 1)
      .filter((c) => c.type === 'reasoning-delta' && c.id === reasoningId);
    expect(deltasAfterEnd).toEqual([]);

    // Every reasoning-delta shares the single reasoning-start id (start before delta).
    const startIdx = w.chunks.findIndex((c) => c.type === 'reasoning-start');
    for (const [i, c] of w.chunks.entries()) {
      if (c.type === 'reasoning-delta') {
        expect(c.id).toBe(reasoningId);
        expect(i).toBeGreaterThan(startIdx);
        expect(i).toBeLessThan(endIdx);
      }
    }

    // Reasoning + answer reconstructed correctly (</think> detected across the split).
    expect(assistantParts).toContainEqual({ type: 'reasoning', text: 'reasoning so far' });
    expect(assistantParts).toContainEqual({ type: 'text', text: 'Final answer' });
  });

  it('closes an unclosed <think> block at end of stream', async () => {
    // Model emits <think> but the stream ends before </think>. The end-of-stream
    // flush must still emit reasoning-end so the client reasoning part reaches a
    // done state instead of hanging open.
    const w = new FakeWriter();
    const { assistantParts } = await pumpOrchestrationStream(
      w,
      parts(
        { type: 'text-start', id: 'a' },
        { type: 'text-delta', id: 'a', delta: '<think>dangling reasoning' },
        { type: 'text-end', id: 'a' },
      ),
      { finalize: async () => ({ result: {}, trust: TRUST }), onApproval: async () => {} },
    );
    const starts = w.chunks.filter((c) => c.type === 'reasoning-start');
    const ends = w.chunks.filter((c) => c.type === 'reasoning-end');
    expect(starts).toHaveLength(1);
    expect(ends).toHaveLength(1);
    expect(ends[0]?.id).toBe(starts[0]?.id);
    expect(assistantParts).toContainEqual({ type: 'reasoning', text: 'dangling reasoning' });
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

  it('persists and streams a data-approval anchor part carrying the toolCallId', async () => {
    const w = new FakeWriter();
    const card = {
      toolCallId: 'tc-9',
      intent: 'Assign',
      riskBadge: 'write' as const,
      summary: 's',
      details: [],
      primary: { label: 'Assign', argsPatch: {} },
      alternates: [],
      decline: { label: 'No' },
      meta: {
        tenantId: 'ten',
        userId: 'usr',
        agentPath: ['assignment'],
        toolId: 'assign_proposeAssignment',
        ts: new Date().toISOString(),
      },
    };
    const { assistantParts } = await pumpOrchestrationStream(
      w,
      parts(
        { type: 'text-start', id: 't' },
        { type: 'text-delta', id: 't', delta: 'Assigning.' },
        { type: 'text-end', id: 't' },
        {
          type: 'data-tool-call-suspended',
          data: { runId: 'run-9', toolCallId: 'tc-9', suspendPayload: { card } },
        },
      ),
      { finalize: async () => ({ result: {}, trust: TRUST }), onApproval: async () => {} },
    );
    // The anchor is what pins the approval card to this turn on reload: without
    // a persisted part the card has nothing to attach to and falls to the bottom.
    const anchor = { type: 'data-approval', id: 'tc-9', data: { toolCallId: 'tc-9' } };
    expect(assistantParts).toContainEqual(anchor);
    expect(w.chunks).toContainEqual(anchor);
    // The anchor must trail the prose so the card renders below the turn's text.
    expect(assistantParts.at(-1)).toEqual(anchor);
  });

  it('emits no approval anchor on a turn that never suspends', async () => {
    const w = new FakeWriter();
    const { assistantParts } = await pumpOrchestrationStream(
      w,
      parts({ type: 'text-start', id: 't' }, { type: 'text-delta', id: 't', delta: 'hi' }),
      { finalize: async () => ({ result: {}, trust: TRUST }), onApproval: async () => {} },
    );
    expect(assistantParts.some((p) => p.type === 'data-approval')).toBe(false);
    expect(w.chunks.some((c) => c.type === 'data-approval')).toBe(false);
  });
});
