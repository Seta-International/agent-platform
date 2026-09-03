import { describe, expect, it } from 'vitest';
import type { WorkflowApprovalRow } from '../../../src/workflows/api/schemas.ts';
import {
  anchoredToolCallIds,
  tailApprovals,
} from '../../../src/workflows/components/approval-anchor.ts';

function approval(toolCallId: string | null, approvalId = toolCallId ?? 'a'): WorkflowApprovalRow {
  return { approvalId, toolCallId } as WorkflowApprovalRow;
}

function anchorPart(toolCallId: unknown) {
  return { type: 'data', name: 'approval', data: { toolCallId } };
}

describe('anchoredToolCallIds', () => {
  it('collects the anchor of every turn that raised an approval', () => {
    const ids = anchoredToolCallIds([
      { content: [{ type: 'text', text: 'hi' }] },
      { content: [{ type: 'text', text: 'assigning' }, anchorPart('tc-1')] },
      { content: [anchorPart('tc-2')] },
    ]);
    expect(ids).toEqual(new Set(['tc-1', 'tc-2']));
  });

  it('ignores other data parts and malformed anchors', () => {
    const ids = anchoredToolCallIds([
      { content: [{ type: 'data', name: 'result', data: { toolCallId: 'tc-x' } }] },
      { content: [anchorPart(42)] },
      { content: [anchorPart('')] },
      { content: undefined },
    ]);
    expect(ids.size).toBe(0);
  });
});

describe('tailApprovals', () => {
  it('keeps approvals that no turn anchors', () => {
    const rows = [approval(null, 'legacy'), approval('tc-1')];
    expect(tailApprovals(rows, new Set(['tc-1'])).map((r) => r.approvalId)).toEqual(['legacy']);
  });

  it('keeps an anchored approval whose turn is not on screen', () => {
    const rows = [approval('tc-old')];
    expect(tailApprovals(rows, new Set(['tc-1'])).map((r) => r.approvalId)).toEqual(['tc-old']);
  });

  it('never renders an anchored approval twice', () => {
    expect(tailApprovals([approval('tc-1')], new Set(['tc-1']))).toEqual([]);
  });
});
