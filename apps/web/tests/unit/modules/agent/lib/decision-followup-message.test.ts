import { describe, expect, it } from 'vitest';
import { buildDecisionFollowupMessage } from '@/modules/agent/lib/decision-followup-message';
import type { WorkflowApprovalRow } from '@/modules/agent/workflows/api/schemas';

function approvalWithCard(card: unknown): WorkflowApprovalRow {
  return {
    approvalId: 'a1',
    runId: 'r1',
    stepId: 's1',
    proposedPayload: card,
    approverUserId: 'u1',
    surfaceCanvas: false,
    surfaceChatThreadId: 't1',
    expiresAt: '2026-05-29T00:00:00Z',
    createdAt: '2026-05-29T00:00:00Z',
  };
}

const assignCard = approvalWithCard({
  intent: 'Assign task 123 based on agent reasoning',
  summary: 'Best fit for the infra task',
  primary: { label: 'Assign to Trần Ngọc Thảo' },
});

describe('buildDecisionFollowupMessage', () => {
  it('approve: tells the agent the action is already complete and must NOT be repeated', () => {
    const msg = buildDecisionFollowupMessage('approve', assignCard);

    // The whole point of the fix: the follow-up turn must know the action was
    // already carried out server-side, so it acknowledges instead of re-proposing.
    expect(msg.toLowerCase()).toMatch(/already|complete|carried out|done/);
    expect(msg.toLowerCase()).toMatch(/do not|don't/);
    expect(msg.toLowerCase()).toMatch(/again|repeat|re-?propose|re-?run/);
    // It should carry the intent so the acknowledgement is contextual.
    expect(msg).toContain('Assign task 123 based on agent reasoning');
    // It must NOT be the old bare label that caused re-execution.
    expect(msg.trim()).not.toBe('Approved');
  });

  it('modify: signals the action ran with the user modifications and must not repeat', () => {
    const msg = buildDecisionFollowupMessage('modify', assignCard);
    expect(msg.toLowerCase()).toMatch(/modif/);
    expect(msg.toLowerCase()).toMatch(/already|complete|carried out|done/);
    expect(msg.toLowerCase()).toMatch(/do not|don't/);
  });

  it('reject: signals the action was NOT performed and must not be re-proposed', () => {
    const msg = buildDecisionFollowupMessage('reject', assignCard);
    expect(msg.toLowerCase()).toMatch(/declin|not.*perform|not.*carried out|did not/);
    expect(msg.toLowerCase()).toMatch(/do not|don't/);
  });

  it('falls back gracefully when the card has no intent', () => {
    const msg = buildDecisionFollowupMessage('approve', approvalWithCard(null));
    expect(msg.length).toBeGreaterThan(0);
    expect(msg.toLowerCase()).toMatch(/already|complete|carried out|done/);
    expect(msg.toLowerCase()).toMatch(/do not|don't/);
  });
});
