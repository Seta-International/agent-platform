import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// `RequisitionDetailDialog` is a thin shell around `RequisitionDetailView` (which owns its own
// data-fetching, header, and edit/cancel/mark-filled flows). Mock it so this file tests only the
// shell's own responsibilities: the Astryx `Dialog` wiring and the `aria-label` special case (no
// visible `DialogHeader`/footer — see the component's own doc comment).
const requisitionDetailViewMock = vi.fn();
vi.mock('../../src/pages/requisition-detail-view.tsx', () => ({
  RequisitionDetailView: (props: {
    requisitionId: string;
    variant?: string;
    onClose?: () => void;
  }) => {
    requisitionDetailViewMock(props);
    return <div data-testid="requisition-detail-view-stub" />;
  },
}));

import { RequisitionDetailDialog } from '../../src/pages/requisition-detail-dialog.tsx';

beforeEach(() => {
  requisitionDetailViewMock.mockClear();
});

describe('RequisitionDetailDialog', () => {
  // No `DialogHeader` is rendered here (special case — `RequisitionDetailView` renders its own
  // visible header), so the dialog's accessible name comes directly from
  // `aria-label="Job description"` rather than a heading.
  it('renders as an accessible dialog labeled "Job description" when mounted', () => {
    render(<RequisitionDetailDialog requisitionId="req-1" onClose={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: 'Job description' })).toBeInTheDocument();
  });

  it('passes requisitionId, variant="modal", and onClose to RequisitionDetailView', () => {
    const onClose = vi.fn();
    render(<RequisitionDetailDialog requisitionId="req-42" onClose={onClose} />);
    expect(requisitionDetailViewMock).toHaveBeenCalledTimes(1);
    expect(requisitionDetailViewMock).toHaveBeenCalledWith(
      expect.objectContaining({
        requisitionId: 'req-42',
        variant: 'modal',
        onClose,
      }),
    );
  });
});
