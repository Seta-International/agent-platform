import { describe, expect, it } from 'vitest';
import { WorkflowApprovalRow } from '../../../../../src/modules/agent/workflows/api/schemas';
import {
  assignedNames,
  cardIntent,
  outcomeText,
  STATUS_LABELS,
} from '../../../../../src/modules/agent/workflows/components/decided-approval';

function row(overrides: Record<string, unknown> = {}) {
  return WorkflowApprovalRow.parse({
    approvalId: 'a1',
    runId: 'r1',
    stepId: 'chat-hitl',
    proposedPayload: {
      intent: 'Assign "AWS migration"',
      details: [
        {
          kind: 'candidateList',
          items: [
            { id: 'u1', label: 'Alice' },
            { id: 'u2', label: 'Bob' },
          ],
        },
      ],
      primary: {
        label: 'Assign to Alice',
        argsPatch: { action: 'assign', assigneeUserIds: ['u1'], taskId: 't1' },
      },
    },
    approverUserId: 'me',
    surfaceCanvas: false,
    surfaceChatThreadId: 'thread-1',
    expiresAt: '2026-06-05T00:00:00.000Z',
    createdAt: '2026-06-04T00:00:00.000Z',
    ...overrides,
  });
}

describe('decided approval helpers', () => {
  it('approve: outcome names the primary candidate', () => {
    const r = row({ status: 'approved', decisionPayload: { decision: 'approve' } });
    expect(outcomeText(r)).toBe('Task assigned to Alice.');
  });

  it('modify: outcome names the overridden candidates', () => {
    const r = row({
      status: 'modified',
      decisionPayload: { decision: 'modify', override_user_ids: ['u2'] },
    });
    expect(outcomeText(r)).toBe('Task assigned to Bob.');
  });

  it('falls back to the raw ID when the label is unknown', () => {
    const r = row({
      status: 'modified',
      decisionPayload: { decision: 'modify', override_user_ids: ['u9'] },
    });
    expect(assignedNames(r)).toBe('u9');
  });

  it('reject: explicit no-changes outcome', () => {
    const r = row({ status: 'rejected', decisionPayload: { decision: 'reject' } });
    expect(outcomeText(r)).toBe('No changes made.');
    expect(STATUS_LABELS.rejected).toBe('Declined');
  });

  it('superseded and expired: neutral no-action outcome', () => {
    expect(outcomeText(row({ status: 'superseded' }))).toBe('No action taken.');
    expect(outcomeText(row({ status: 'expired' }))).toBe('No action taken.');
    expect(STATUS_LABELS.expired).toBe('Expired');
  });

  it('malformed payload never throws', () => {
    const r = row({ status: 'approved', proposedPayload: 'garbage' });
    expect(outcomeText(r)).toBe('Assignment confirmed.');
    expect(cardIntent('garbage')).toBeNull();
  });
});
