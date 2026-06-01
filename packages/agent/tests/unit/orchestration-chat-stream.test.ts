import type { OrchestrationEvent } from '@seta/shared-orchestration';
import { describe, expect, it } from 'vitest';
import { streamOrchestrationToUI } from '../../src/backend/orchestration-chat-stream.ts';

async function* events(...evs: OrchestrationEvent[]): AsyncIterable<OrchestrationEvent> {
  for (const e of evs) yield e;
}

function fakeWriter() {
  const chunks: { type: string; delta?: string }[] = [];
  return { chunks, write: (c: { type: string; delta?: string }) => chunks.push(c) };
}

describe('streamOrchestrationToUI', () => {
  it('emits text-start, per-step deltas, a final block, and text-end', async () => {
    const w = fakeWriter();
    await streamOrchestrationToUI(
      w as never,
      events(
        { kind: 'step-start', stepId: 'analyze', agentId: 'staffing.analyzer' },
        {
          kind: 'step-done',
          stepId: 'analyze',
          trust: { reasoningTrace: [], evidenceCitations: [], confidenceScore: 0.8 },
        },
        {
          kind: 'final',
          result: {
            recommendations: [
              {
                userId: 'u1',
                name: 'Alice',
                skillMatch: ['stripe'],
                skillMatchCount: 1,
                status: 'available',
              },
            ],
          },
        },
      ),
    );

    expect(w.chunks[0]!.type).toBe('text-start');
    expect(w.chunks.at(-1)!.type).toBe('text-end');
    const text = w.chunks
      .filter((c) => c.type === 'text-delta')
      .map((c) => c.delta)
      .join('');
    expect(text).toContain('analyze');
    expect(text).toContain('conf=0.80');
    expect(text).toContain('Alice');
  });

  it('renders the terminal (not-actionable) message', async () => {
    const w = fakeWriter();
    await streamOrchestrationToUI(
      w as never,
      events(
        { kind: 'step-start', stepId: 'analyze', agentId: 'staffing.analyzer' },
        {
          kind: 'step-done',
          stepId: 'analyze',
          trust: { reasoningTrace: [], evidenceCitations: [], confidenceScore: 0.2 },
        },
        {
          kind: 'final',
          result: { actionable: false, message: 'I can only suggest assignees for a task.' },
        },
      ),
    );
    const text = w.chunks
      .filter((c) => c.type === 'text-delta')
      .map((c) => c.delta)
      .join('');
    expect(text).toContain('I can only suggest assignees for a task.');
  });
});
