import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { WorkerListRow, WorkersQuery } from '../../../src/api/people-client';
import { PeopleCardGrid } from '../../../src/components/people-card-grid';

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
    employee_no: null,
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
  it('renders page numbers and page size selector matching List view', () => {
    // total 80 / pageSize 25 => 4 pages (buttons 1, 2, 3, 4)
    renderGrid({ page: 2, pageSize: 25 } as WorkersQuery);

    const page2Btn = screen.getByRole('button', { name: 'Go to page 2' });
    expect(page2Btn).toHaveAttribute('aria-current', 'page');

    expect(screen.getByRole('button', { name: 'Go to page 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to page 3' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to page 4' })).toBeInTheDocument();

    expect(screen.getByRole('combobox', { name: 'Items per page' })).toBeInTheDocument();
  });

  it('advances a page when Next is used', async () => {
    const user = userEvent.setup({ delay: null });
    const setQuery = renderGrid({ page: 2, pageSize: 25 } as WorkersQuery);

    await user.click(screen.getByRole('button', { name: /next/i }));

    const updater = setQuery.mock.calls[0]?.[0] as (q: WorkersQuery) => WorkersQuery;
    expect(updater({ page: 2, pageSize: 25 } as WorkersQuery)).toMatchObject({ page: 3 });
  });

  it('changes page size when page size selector option is selected', async () => {
    const user = userEvent.setup({ delay: null });
    const setQuery = renderGrid({ page: 2, pageSize: 25 } as WorkersQuery);

    const selector = screen.getByRole('combobox', { name: 'Items per page' });
    await user.click(selector);

    const option50 = screen.getByRole('option', { name: '50' });
    await user.click(option50);

    const updater = setQuery.mock.calls[0]?.[0] as (q: WorkersQuery) => WorkersQuery;
    expect(updater({ page: 2, pageSize: 25 } as WorkersQuery)).toMatchObject({
      pageSize: 50,
      page: 1,
    });
  });

  it('cannot page past the last page', () => {
    renderGrid({ page: 4, pageSize: 25 } as WorkersQuery);
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
  });
});
