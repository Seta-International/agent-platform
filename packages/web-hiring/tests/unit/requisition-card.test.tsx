import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RequisitionListRow } from '../../src/api/hiring-client.ts';

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}));

import { RequisitionCard } from '../../src/pages/requisition-card.tsx';

function row(over: Partial<RequisitionListRow> = {}): RequisitionListRow {
  return {
    id: 'r1',
    title: 'Backend Engineer',
    role_title: null,
    account_id: null,
    account_name: null,
    project_id: null,
    project_name: null,
    grade: null,
    kind: 'new',
    approval_status: 'approved',
    stage: 'sourcing',
    status: 'open',
    note: null,
    start_date: null,
    due_date: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    skills: [],
    openings_total: 1,
    openings_open: 1,
    openings_filled: 0,
    applicants_count: 0,
    applicants_internal: 0,
    applicants_external: 0,
    hired_count: 0,
    applicants: [],
    version: 1,
    ...over,
  };
}

describe('RequisitionCard', () => {
  it('renders the pipeline stage track and no action menu', () => {
    render(<RequisitionCard r={row()} />);

    expect(screen.getByText('Screening')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Requisition actions' })).not.toBeInTheDocument();
  });

  it('shows a per-stage bucket count under each stage, summing to applicants_count (FUT-558)', () => {
    render(
      <RequisitionCard
        r={row({
          applicants_count: 3,
          applicants: [
            {
              name: 'A',
              role: null,
              applied_date: '2026-07-01',
              stage: 'new',
              kind: 'external',
              status: 'active',
            },
            {
              name: 'B',
              role: null,
              applied_date: '2026-07-01',
              stage: 'screening',
              kind: 'external',
              status: 'active',
            },
            {
              name: 'C',
              role: null,
              applied_date: '2026-07-01',
              stage: 'interview',
              kind: 'external',
              status: 'active',
            },
          ],
        })}
      />,
    );
    // One candidate currently at each of Sourcing/Screening/Interview, none at Offer yet.
    expect(screen.getAllByTestId('stage-count').map((el) => el.textContent)).toEqual([
      '1',
      '1',
      '1',
      '0',
    ]);
  });

  it('moves the count from Sourcing to Screening as a candidate advances (FUT-558)', () => {
    const { rerender } = render(
      <RequisitionCard
        r={row({
          applicants_count: 1,
          applicants: [
            {
              name: 'A',
              role: null,
              applied_date: '2026-07-01',
              stage: 'new',
              kind: 'external',
              status: 'active',
            },
          ],
        })}
      />,
    );
    expect(screen.getAllByTestId('stage-count').map((el) => el.textContent)).toEqual([
      '1',
      '0',
      '0',
      '0',
    ]);

    rerender(
      <RequisitionCard
        r={row({
          applicants_count: 1,
          applicants: [
            {
              name: 'A',
              role: null,
              applied_date: '2026-07-01',
              stage: 'screening',
              kind: 'external',
              status: 'active',
            },
          ],
        })}
      />,
    );
    expect(screen.getAllByTestId('stage-count').map((el) => el.textContent)).toEqual([
      '0',
      '1',
      '0',
      '0',
    ]);
  });

  it('surfaces a terminal outcome in the hero', () => {
    const { rerender } = render(<RequisitionCard r={row({ status: 'filled' })} />);
    expect(screen.getByText('Completed')).toBeInTheDocument();

    rerender(<RequisitionCard r={row({ status: 'cancelled' })} />);
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
  });

  it('shows the On hold state in the hero', () => {
    render(<RequisitionCard r={row({ status: 'on_hold' })} />);
    expect(screen.getByText('On hold')).toBeInTheDocument();
  });

  it('shows a due-date countdown and date for an open requisition', () => {
    const due = new Date(Date.now() + 10 * 86_400_000).toISOString();
    render(<RequisitionCard r={row({ due_date: due, applicants_count: 2 })} />);
    expect(screen.getByText(/day(s)? left$/)).toBeInTheDocument();
    expect(screen.getByText(/^Due /)).toBeInTheDocument();
  });

  it('shows overdue when the due date has passed', () => {
    const due = new Date(Date.now() - 3 * 86_400_000).toISOString();
    render(<RequisitionCard r={row({ due_date: due, applicants_count: 2 })} />);
    expect(screen.getByText(/day(s)? overdue$/)).toBeInTheDocument();
  });
});
