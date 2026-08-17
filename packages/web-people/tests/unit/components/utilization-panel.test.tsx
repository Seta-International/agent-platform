import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { UtilizationByPerson } from '../../../src/api/allocation-client.ts';
import { UtilizationPanel } from '../../../src/components/utilization-panel.tsx';

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}));

const mockFetchUtilization = vi.fn();
vi.mock('../../../src/api/allocation-client.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/api/allocation-client.ts')>()),
  fetchUtilizationByPerson: (...args: unknown[]) => mockFetchUtilization(...args),
}));

const sample: UtilizationByPerson = {
  as_of: '2026-07-16',
  rows: [
    {
      worker_id: 'w-pat',
      employee_no: '6885',
      full_name: 'Pat Lin',
      segments: [{ project_id: 'p1', project_name: 'Alpha', pct: 80 }],
      total_pct: 80,
      over_allocated: false,
      split: { billable: 80, internal: 0, bench: 0 },
    },
    {
      worker_id: 'w-other',
      employee_no: '9001',
      full_name: 'Other Person',
      segments: [{ project_id: 'p1', project_name: 'Alpha', pct: 50 }],
      total_pct: 50,
      over_allocated: false,
      split: { billable: 50, internal: 0, bench: 0 },
    },
  ],
};

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <UtilizationPanel />
    </QueryClientProvider>,
  );
}

describe('UtilizationPanel employee ID search', () => {
  it('filters client-side by employee_no', async () => {
    const user = userEvent.setup({ delay: null });
    mockFetchUtilization.mockResolvedValue(sample);
    renderPanel();
    await screen.findByText('Pat Lin');

    await user.type(screen.getByPlaceholderText(/employee ID/i), '6885');
    expect(screen.getByText('Pat Lin')).toBeInTheDocument();
    expect(screen.queryByText('Other Person')).not.toBeInTheDocument();
  });
});

describe('UtilizationPanel paging', () => {
  const manyRows = (count: number): UtilizationByPerson => ({
    as_of: '2026-07-16',
    rows: Array.from({ length: count }, (_, i) => ({
      worker_id: `w-${i}`,
      employee_no: String(1000 + i),
      full_name: `Person ${String(i).padStart(2, '0')}`,
      segments: [{ project_id: 'p1', project_name: 'Alpha', pct: 50 }],
      total_pct: 50,
      over_allocated: false,
      split: { billable: 50, internal: 0, bench: 0 },
    })),
  });

  it('shows ten people per page with the same page sizes as the rest of the app', async () => {
    const user = userEvent.setup({ delay: null });
    mockFetchUtilization.mockResolvedValue(manyRows(30));
    renderPanel();
    await screen.findByText('Person 00');

    const pager = screen.getByRole('navigation', { name: 'Utilization pages' });
    expect(pager).toHaveTextContent('Page 1 of 3');
    expect(screen.queryByText('Person 10')).not.toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: 'Items per page' }));

    expect(await screen.findByRole('option', { name: '10' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '25' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '50' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '100' })).toBeInTheDocument();
  });

  it('returns to the first page when the page size changes', async () => {
    const user = userEvent.setup({ delay: null });
    mockFetchUtilization.mockResolvedValue(manyRows(30));
    renderPanel();
    await screen.findByText('Person 00');

    const pager = screen.getByRole('navigation', { name: 'Utilization pages' });
    await user.click(within(pager).getByRole('button', { name: /next page/i }));
    expect(pager).toHaveTextContent('Page 2 of 3');

    await user.click(screen.getByRole('combobox', { name: 'Items per page' }));
    await user.click(await screen.findByRole('option', { name: '25' }));

    expect(pager).toHaveTextContent('Page 1 of 2');
    expect(screen.getByText('Person 00')).toBeInTheDocument();
  });
});
