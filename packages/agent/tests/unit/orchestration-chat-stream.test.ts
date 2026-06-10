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

function approvalCard() {
  return {
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
      agentPath: ['staffing', 'orchestrator'],
      toolId: 'planner_proposeAssignment',
      ts: new Date().toISOString(),
    },
  };
}

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

  it('renders people-search candidates as top matching users', async () => {
    const w = new FakeWriter();
    await streamOrchestrationToUI(
      w,
      evs({
        kind: 'final',
        result: {
          candidates: [
            {
              userId: 'u1',
              name: 'A',
              skills: ['aws', 'docker'],
              role: 'Backend Dev',
              skillMatchCount: 2,
              rank: 1,
            },
            {
              userId: 'u2',
              name: null,
              skills: ['aws'],
              role: null,
              skillMatchCount: 1,
              rank: 2,
            },
          ],
        },
      }),
    );
    expect(w.text()).toContain('Top matching users');
    expect(w.text()).toContain('A — skills:2 (aws, docker) · Backend Dev');
    expect(w.text()).toContain('u2 — skills:1 (aws)');
  });

  it('renders an empty people search as no matching users', async () => {
    const w = new FakeWriter();
    await streamOrchestrationToUI(w, evs({ kind: 'final', result: { candidates: [] } }));
    expect(w.text()).toContain('No matching users found.');
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

  it('renders a short pointer instead of the list when a pending approval card exists', async () => {
    const w = new FakeWriter();
    await streamOrchestrationToUI(
      w,
      evs({
        kind: 'final',
        result: {
          pendingApproval: { approvalId: 'ap1', taskId: 't-1' },
          recommendations: [
            {
              userId: 'u1',
              name: 'Alice',
              skillMatch: ['aws'],
              skillMatchCount: 1,
              status: 'available',
            },
            {
              userId: 'u2',
              name: 'Bob',
              skillMatch: ['aws'],
              skillMatchCount: 1,
              status: 'busy',
            },
          ],
        },
      }),
    );
    expect(w.text()).toContain('review the approval card above');
    expect(w.text()).toContain('Alice');
    expect(w.text()).not.toContain('Recommended assignees');
  });

  it('does not claim a card exists in this thread when the reused approval lives elsewhere', async () => {
    const w = new FakeWriter();
    await streamOrchestrationToUI(
      w,
      evs({
        kind: 'final',
        result: {
          pendingApproval: { approvalId: 'ap1', taskId: 't-1', inThread: false },
          recommendations: [
            {
              userId: 'u1',
              name: 'Alice',
              skillMatch: ['aws'],
              skillMatchCount: 1,
              status: 'available',
            },
          ],
        },
      }),
    );
    expect(w.text()).not.toContain('review the approval card above');
    expect(w.text()).toContain('already awaiting approval');
    expect(w.text()).toContain('Alice');
  });

  it('awaits onApproval on an approval event before the turn closes', async () => {
    const w = new FakeWriter();
    const seen: Array<{ card: unknown; mastraRunId: string; toolCallId: string }> = [];
    const card = approvalCard();
    await streamOrchestrationToUI(
      w,
      evs(
        { kind: 'step-start', stepId: 'recommender', agentId: 'staffing.recommender' },
        { kind: 'step-done', stepId: 'recommender', trust: TRUST },
        { kind: 'approval', card, mastraRunId: 'run-abc', toolCallId: 'tc-1' },
      ),
      {
        onApproval: async (ev) => {
          seen.push({ card: ev.card, mastraRunId: ev.mastraRunId, toolCallId: ev.toolCallId });
        },
      },
    );
    expect(seen).toEqual([{ card, mastraRunId: 'run-abc', toolCallId: 'tc-1' }]);
    // A suspended (final-less) turn still writes the final text part as today,
    // and emits no approval-specific UI part yet.
    expect(w.chunks.some((c) => c.type === 'text-end')).toBe(true);
    expect(w.chunks.some((c) => c.type === 'data-approval')).toBe(false);
  });
});
