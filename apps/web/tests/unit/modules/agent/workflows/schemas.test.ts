import { describe, expect, it } from 'vitest';
import { WorkflowApprovalRow } from '../../../../../src/modules/agent/workflows/api/schemas';

const base = {
  approvalId: 'a1',
  runId: 'r1',
  stepId: 'chat-hitl',
  proposedPayload: {},
  approverUserId: 'u1',
  surfaceCanvas: false,
  surfaceChatThreadId: 'thread-1',
  expiresAt: '2026-06-05T00:00:00.000Z',
  createdAt: '2026-06-04T00:00:00.000Z',
};

describe('WorkflowApprovalRow', () => {
  it('defaults decision fields for legacy pending-list payloads', () => {
    const row = WorkflowApprovalRow.parse(base);
    expect(row.status).toBe('pending');
    expect(row.decisionPayload).toBeNull();
    expect(row.decidedAt).toBeNull();
    expect(row.agentic).toBe(false);
  });

  it('parses an explicit agentic flag', () => {
    expect(WorkflowApprovalRow.parse({ ...base, agentic: true }).agentic).toBe(true);
  });

  it('parses decided rows including the modified status', () => {
    const row = WorkflowApprovalRow.parse({
      ...base,
      status: 'modified',
      decisionPayload: { decision: 'modify', override_user_ids: ['u2'] },
      decidedAt: '2026-06-04T10:00:00.000Z',
    });
    expect(row.status).toBe('modified');
    expect(row.decisionPayload).toEqual({ decision: 'modify', override_user_ids: ['u2'] });
    expect(row.decidedAt).toBe('2026-06-04T10:00:00.000Z');
  });

  it('parses rows the sweeper expired', () => {
    const row = WorkflowApprovalRow.parse({
      ...base,
      status: 'expired',
      decisionPayload: { decision: 'timeout' },
      decidedAt: '2026-06-05T00:00:00.000Z',
    });
    expect(row.status).toBe('expired');
  });
});
