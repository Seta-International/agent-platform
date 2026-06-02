import type { OrchestrationEvent } from '@seta/shared-orchestration';
import { describe, expect, it } from 'vitest';
import { streamOrchestrationToUI } from '../../src/backend/orchestration-chat-stream.ts';

async function* events(...evs: OrchestrationEvent[]): AsyncIterable<OrchestrationEvent> {
  for (const e of evs) yield e;
}

interface Chunk {
  type: string;
  id?: string;
  delta?: string;
  data?: unknown;
}
function fakeWriter() {
  const chunks: Chunk[] = [];
  return { chunks, write: (c: Chunk) => chunks.push(c) };
}

describe('streamOrchestrationToUI', () => {
  it('emits a reconciled data part per step (running→done with trust) then the final answer text', async () => {
    const w = fakeWriter();
    await streamOrchestrationToUI(
      w as never,
      events(
        { kind: 'step-start', stepId: 'analyze', agentId: 'staffing.analyzer' },
        {
          kind: 'step-done',
          stepId: 'analyze',
          trust: {
            reasoningTrace: [
              { step: 'gate', detail: 'assignee request', at: '2026-01-01T00:00:00Z' },
            ],
            evidenceCitations: [{ kind: 'task', id: 't-1', label: 'Stripe webhook' }],
            confidenceScore: 0.8,
          },
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

    const steps = w.chunks.filter((c) => c.type === 'data-orchestration-step');
    // Same `id` for start + done so the UI reconciles them into one live card.
    expect(steps).toHaveLength(2);
    expect(steps.every((c) => c.id === 'analyze')).toBe(true);
    const start = steps[0]!.data as { stepId: string; agentId: string; status: string };
    expect(start).toMatchObject({
      stepId: 'analyze',
      agentId: 'staffing.analyzer',
      status: 'running',
    });
    const done = steps[1]!.data as {
      status: string;
      agentId: string;
      trust: { confidenceScore: number; reasoningTrace: unknown[]; evidenceCitations: unknown[] };
    };
    expect(done.status).toBe('done');
    expect(done.agentId).toBe('staffing.analyzer'); // carried over from step-start
    expect(done.trust.confidenceScore).toBe(0.8);
    expect(done.trust.reasoningTrace).toHaveLength(1);
    expect(done.trust.evidenceCitations).toHaveLength(1);

    // The answer is a single text part emitted after the timeline.
    const firstText = w.chunks.findIndex((c) => c.type === 'text-start');
    const lastStep = w.chunks.map((c) => c.type).lastIndexOf('data-orchestration-step');
    expect(firstText).toBeGreaterThan(lastStep);
    expect(w.chunks.at(-1)!.type).toBe('text-end');
    const text = w.chunks
      .filter((c) => c.type === 'text-delta')
      .map((c) => c.delta)
      .join('');
    expect(text).toContain('Alice');
  });

  it('renders the terminal (not-actionable) message as the answer text', async () => {
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
