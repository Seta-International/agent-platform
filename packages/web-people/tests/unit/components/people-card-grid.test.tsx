import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { WorkerListRow, WorkersQuery } from '../../../src/api/people-client.ts';
import { PeopleCardGrid } from '../../../src/components/people-card-grid.tsx';

const rows: WorkerListRow[] = [
  {
    worker_id: 'w-1',
    full_name: 'Ada Lovelace',
    job_title: 'Engineer',
    work_email: 'ada@example.com',
    phone: null,
    gender: null,
    lifecycle_stage: 'active',
    onboarding_date: null,
    offboarding_date: null,
    manager_id: null,
    manager_name: null,
    accounts: [],
    skills: [],
  },
];

function renderGrid(query: WorkersQuery, setQuery = vi.fn()) {
  render(
    <PeopleCardGrid
      rows={rows}
      total={80}
      isLoading={false}
      query={query}
      setQuery={setQuery}
      onRowClick={vi.fn()}
    />,
  );
  return setQuery;
}

describe('PeopleCardGrid pager', () => {
  it('reports the current page against the total', () => {
    // total 80 / pageSize 25 => 4 pages
    renderGrid({ page: 2, pageSize: 25 } as WorkersQuery);
    expect(screen.getByText(/page 2 of 4/i)).toBeInTheDocument();
  });

  it('advances a page when Next is used', async () => {
    const user = userEvent.setup({ delay: null });
    const setQuery = renderGrid({ page: 2, pageSize: 25 } as WorkersQuery);

    await user.click(screen.getByRole('button', { name: /next/i }));

    const updater = setQuery.mock.calls[0]?.[0] as (q: WorkersQuery) => WorkersQuery;
    expect(updater({ page: 2, pageSize: 25 } as WorkersQuery)).toMatchObject({ page: 3 });
  });

  it('cannot page past the last page', () => {
    renderGrid({ page: 4, pageSize: 25 } as WorkersQuery);
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
  });
});
