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
      segments: [
        { project_id: 'p1', project_name: 'Alpha', pct: 60 },
        { project_id: 'p2', project_name: 'Beta', pct: 20 },
      ],
      total_pct: 80,
      over_allocated: false,
      split: { billable: 60, internal: 20, bench: 0 },
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

function renderPanel(props: { filters?: Parameters<typeof UtilizationPanel>[0]['filters'] } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <UtilizationPanel {...props} />
    </QueryClientProvider>,
  );
}

describe('UtilizationPanel rendering and ACs (FUT-911)', () => {
  it('renders each segment with project name and %, and does not render a separate color block above the bar (AC 3)', async () => {
    mockFetchUtilization.mockResolvedValue(sample);
    renderPanel();
    await screen.findByText('Pat Lin');

    // ChartLegend container should not be present
    expect(screen.queryByRole('region', { name: /chart legend/i })).not.toBeInTheDocument();

    // Each segment displays its project name and percentage
    expect(screen.getAllByText('Alpha').length).toBe(2);
    expect(screen.getByText('60%')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getAllByText('20%').length).toBeGreaterThanOrEqual(1);
  });

  it('passes applied filters to fetchUtilizationByPerson (AC 1)', async () => {
    mockFetchUtilization.mockResolvedValue(sample);
    renderPanel({
      filters: {
        search: 'Pat',
        status: 'over',
        accountId: 'acc-1',
        projectId: 'p1',
        bucket: 'billable',
      },
    });

    await screen.findByText('Pat Lin');
    expect(mockFetchUtilization).toHaveBeenCalledWith(
      expect.objectContaining({
        search: 'Pat',
        status: 'over',
        accountId: 'acc-1',
        projectId: 'p1',
        bucket: 'billable',
      }),
    );
  });

  it('normalizes segment percentages and bar shares when worker is over-allocated (> 100%)', async () => {
    const overAllocSample: UtilizationByPerson = {
      as_of: '2026-08-20',
      rows: [
        {
          worker_id: 'w-over',
          employee_no: '1234',
          full_name: 'Alex Over',
          segments: [
            { project_id: 'p1', project_name: 'Project A', pct: 70 },
            { project_id: 'p2', project_name: 'Project B', pct: 50 },
          ],
          total_pct: 120,
          over_allocated: true,
          split: { billable: 70, internal: 50, bench: 0 },
        },
      ],
    };
    mockFetchUtilization.mockResolvedValue(overAllocSample);
    renderPanel();
    await screen.findByText('Alex Over');

    // Total percentage represents total bar length (100%) purely as bar share
    expect(screen.getByText('100%')).toBeInTheDocument();

    // Segments are normalized: Project A = 70/120 * 100 = 58.33%, Project B = 50/120 * 100 = 41.67%
    expect(screen.getByText('58.33%')).toBeInTheDocument();
    expect(screen.getByText('41.67%')).toBeInTheDocument();
  });

  it('renders idle indicator, 0% total, and billable split when a person has no allocation (AC 2)', async () => {
    const idleSample: UtilizationByPerson = {
      as_of: '2026-08-20',
      rows: [
        {
          worker_id: 'w-idle',
          employee_no: '9999',
          full_name: 'Idle Person',
          segments: [],
          total_pct: 0,
          over_allocated: false,
          split: { billable: 0, internal: 0, bench: 0 },
        },
      ],
    };
    mockFetchUtilization.mockResolvedValue(idleSample);
    renderPanel();
    await screen.findByText('Idle Person');

    expect(screen.getByText('Idle')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.getByText('billable 0% · internal 0% · bench 0%')).toBeInTheDocument();
  });

  it('renders idle capacity with gray annotation when worker is partially allocated (e.g. 50%)', async () => {
    const partialSample: UtilizationByPerson = {
      as_of: '2026-08-20',
      rows: [
        {
          worker_id: 'w-part',
          employee_no: '8888',
          full_name: 'Partial Person',
          segments: [{ project_id: 'p1', project_name: 'Alpha', pct: 50 }],
          total_pct: 50,
          over_allocated: false,
          split: { billable: 50, internal: 0, bench: 0 },
        },
      ],
    };
    mockFetchUtilization.mockResolvedValue(partialSample);
    renderPanel();
    await screen.findByText('Partial Person');

    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getAllByText('50%').length).toBeGreaterThanOrEqual(2); // Alpha 50%, Idle 50%, Bar 50%
    expect(screen.getByText('Idle')).toBeInTheDocument();
    expect(screen.getByText('billable 50% · internal 0% · bench 0%')).toBeInTheDocument();
  });
});

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
