import { describe, expect, it } from 'vitest';
import { WorkflowApprovalRow } from '../../../src/workflows/api/schemas';
import {
  assignedNames,
  cardIntent,
  outcomeText,
  resolutionStatusLine,
  STATUS_LABELS,
} from '../../../src/workflows/components/decided-approval';

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

describe('assignedUserIds — a decision that selected a branch', () => {
  const card = {
    intent: 'Assign "Infra"',
    details: [
      {
        kind: 'entityList',
        items: [
          { id: 'u1', label: 'Alice' },
          { id: 'u2', label: 'Bob' },
          { id: 'u3', label: 'Carol' },
        ],
      },
    ],
    primary: { argsPatch: { action: 'assign', assigneeUserIds: ['u1'] } },
    alternates: [
      { argsPatch: { action: 'assign', assigneeUserIds: ['u2'] } },
      { argsPatch: { action: 'assign', assigneeUserIds: ['u3'] } },
    ],
    meta: { toolId: 'planner_proposeAssignment' },
  };

  const branchRow = (decisionPayload: unknown) =>
    ({
      approvalId: 'a1',
      status: 'approved',
      proposedPayload: card,
      decisionPayload,
    }) as never;

  // The bug this task exists to prevent: alternate #2 must not report the top
  // match, in the transcript, permanently.
  it('names the alternate the user actually picked', () => {
    expect(
      outcomeText(branchRow({ decision: 'approve', chosen: 'alternate', alternate_index: 1 })),
    ).toBe('Task assigned to Carol.');
  });

  it('names the top match for a primary confirm', () => {
    expect(outcomeText(branchRow({ decision: 'approve', chosen: 'primary' }))).toBe(
      'Task assigned to Alice.',
    );
  });

  // Rows decided before this shipped carry neither field; they must keep
  // reading the way they always did.
  it('falls back to primary for a decision recorded before chosen was persisted', () => {
    expect(outcomeText(branchRow({ decision: 'approve' }))).toBe('Task assigned to Alice.');
  });

  // The canvas still sends override_user_ids through /decide, and that surface
  // is untouched by this story.
  it('still prefers an explicit override_user_ids', () => {
    expect(outcomeText(branchRow({ decision: 'modify', override_user_ids: ['u2'] }))).toBe(
      'Task assigned to Bob.',
    );
  });

  it('falls back to primary when alternate_index is out of range', () => {
    expect(
      outcomeText(branchRow({ decision: 'approve', chosen: 'alternate', alternate_index: 9 })),
    ).toBe('Task assigned to Alice.');
  });
});

describe('resolutionStatusLine', () => {
  it('returns null for a still-pending approval', () => {
    expect(resolutionStatusLine('pending')).toBeNull();
  });
  it('reads "Approval granted" for approve/modify', () => {
    expect(resolutionStatusLine('approved')).toBe('Approval granted');
    expect(resolutionStatusLine('modified')).toBe('Approval granted');
  });
  it('reads "Declined" for a rejection', () => {
    expect(resolutionStatusLine('rejected')).toBe('Declined');
  });
  it('falls back to the status label for terminal system states', () => {
    expect(resolutionStatusLine('expired')).toBe('Expired');
  });
});
