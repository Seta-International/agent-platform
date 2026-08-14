import { describe, expect, it } from 'vitest';
import { renderOpenPreviewBlock } from '../../../../src/backend/orchestration/action/open-preview-block.ts';

const preview = {
  approvalId: '7f3a1c2e-1111-4222-8333-444455556666',
  toolId: 'planner_updateTask',
  intent: 'Update "Deploy API"',
  taskIds: ['66be2be2-394d-4184-b106-c412289fd1e1'],
  proposedRows: [
    { k: 'Due', v: '12 Aug 2026 23:59 → 21 Aug 2026 23:59' },
    { k: 'Priority', v: 'Medium → Urgent' },
  ],
};

describe('renderOpenPreviewBlock', () => {
  it('names the approval id the model must quote back as revisionOf', () => {
    expect(renderOpenPreviewBlock(preview)).toContain(
      'approvalId: 7f3a1c2e-1111-4222-8333-444455556666',
    );
  });

  it('names the tool that owns the card, so the model calls the SAME one', () => {
    expect(renderOpenPreviewBlock(preview)).toContain('tool: planner_updateTask');
  });

  it('names the task, which the model must echo back after revising (design D19)', () => {
    expect(renderOpenPreviewBlock(preview)).toContain('Update "Deploy API"');
  });

  it('renders the COMPLETE proposal, not a summary', () => {
    const block = renderOpenPreviewBlock(preview);
    // "thêm Tuấn nữa" has to be unioned against the PROPOSED set, not the task's
    // stored set, and the model can only do that if it can read the whole thing.
    expect(block).toContain('Due: 12 Aug 2026 23:59 → 21 Aug 2026 23:59');
    expect(block).toContain('Priority: Medium → Urgent');
  });

  it('says the preview is waiting, so the model knows it is not yet applied', () => {
    expect(renderOpenPreviewBlock(preview)).toMatch(/waiting for the user/i);
  });

  it('degrades to a readable block when the card carried no kvTable rows', () => {
    const block = renderOpenPreviewBlock({ ...preview, proposedRows: [] });
    expect(block).toContain('approvalId: 7f3a1c2e-1111-4222-8333-444455556666');
    expect(block).not.toContain('undefined');
  });
});
