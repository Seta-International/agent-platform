import type { OrchestrationEvent } from '@seta/shared-orchestration';
import { describe, expect, it } from 'vitest';
import {
  ORCHESTRATION_STEP_PART,
  streamOrchestrationToUI,
} from '../../src/backend/orchestration-chat-stream.ts';

interface Chunk {
  type: string;
  id?: string;
  delta?: string;
  data?: unknown;
}

class FakeWriter {
  chunks: Chunk[] = [];
  write(c: Chunk) {
    this.chunks.push(c);
  }
  text() {
    return this.chunks
      .filter((c) => c.type === 'text-delta')
      .map((c) => c.delta)
      .join('');
  }
  /** Distinct step-card ids in first-seen order. Each step writes twice
   *  (running → done, reconciled by id in the UI); we assert on which cards
   *  exist, not on the write count. */
  cardIds() {
    const ids = this.chunks
      .filter((c) => c.type === `data-${ORCHESTRATION_STEP_PART}`)
      .map((c) => c.id as string);
    return [...new Set(ids)];
  }
}

async function* evs(...e: OrchestrationEvent[]) {
  for (const x of e) yield x;
}

const TRUST = { reasoningTrace: [], evidenceCitations: [], confidenceScore: 0 };

describe('orchestration chat stream', () => {
  it('renders skills-only and suppresses the outer orchestrate card', async () => {
    const w = new FakeWriter();
    await streamOrchestrationToUI(
      w,
      evs(
        { kind: 'step-start', stepId: 'orchestrate', agentId: 'staffing.orchestrator' },
        { kind: 'step-start', stepId: 'taskAnalyzer', agentId: 'staffing.taskAnalyzer' },
        { kind: 'step-done', stepId: 'taskAnalyzer', trust: TRUST },
        { kind: 'step-done', stepId: 'orchestrate', trust: TRUST },
        { kind: 'final', result: { skills: ['aws', 'terraform'] } },
      ),
    );
    expect(w.cardIds()).toEqual(['taskAnalyzer']); // 'orchestrate' suppressed
    expect(w.text()).toContain('aws, terraform');
  });

  it('renders tasks with per-task recommendations and states the cap', async () => {
    const w = new FakeWriter();
    await streamOrchestrationToUI(
      w,
      evs({
        kind: 'final',
        result: {
          tasks: [
            {
              task: {
                taskId: 't1',
                title: 'Infra A',
                status: 'not_started',
                skillTags: ['infrastructure'],
              },
              recommendations: [
                {
                  userId: 'u1',
                  name: 'A',
                  skillMatch: ['infrastructure'],
                  skillMatchCount: 1,
                  status: 'busy',
                },
              ],
            },
            {
              task: {
                taskId: 't2',
                title: 'Infra B',
                status: 'not_started',
                skillTags: ['infrastructure'],
              },
            },
          ],
        },
      }),
    );
    expect(w.text()).toContain('Infra A');
    expect(w.text()).toContain('A (skills:1)');
    expect(w.text()).toContain('first 1 of 2'); // cap stated
  });
});
