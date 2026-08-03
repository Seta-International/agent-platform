import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KpiMetricsPage } from '../../../src/pages/kpi-metrics-page.tsx';

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useSearch: () => ({ iso_year: 2026, iso_week: 32 }),
}));

const explorerRow = (project_id: string, project_name: string, can_manage: boolean) => ({
  project_id,
  project_name,
  account_id: 'acc-1',
  account_name: 'Acme Corporation',
  record_id: null,
  iso_year: 2026,
  iso_week: 32,
  overall_health: 'green' as const,
  category_health: {
    quality: 'green' as const,
    cost_capacity: 'green' as const,
    delivery: 'green' as const,
    process: 'green' as const,
  },
  metrics: {},
  can_manage,
});

const fetchKpiExplorerMock = vi.fn();
vi.mock('../../../src/api/pm-client.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/api/pm-client.ts')>();
  return {
    ...actual,
    fetchCurrentWeek: () => Promise.resolve({ iso_year: 2026, iso_week: 32 }),
    fetchAccounts: () => Promise.resolve([]),
    fetchProjects: () => Promise.resolve([]),
    fetchKpiNorm: () => Promise.resolve({ metrics: [] }),
    fetchKpiExplorer: () => fetchKpiExplorerMock(),
  };
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <KpiMetricsPage />
    </QueryClientProvider>,
  );
}

async function actionCellFor(projectName: string): Promise<HTMLElement> {
  const row = (await screen.findByText(projectName)).closest('tr');
  if (!row) throw new Error(`no row for ${projectName}`);
  const cells = within(row).getAllByRole('cell');
  return cells[cells.length - 1] as HTMLElement;
}

describe('KpiMetricsPage — entry actions are not wired up yet', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    fetchKpiExplorerMock.mockReset();
  });

  it('disables Edit even on a project the viewer manages', async () => {
    fetchKpiExplorerMock.mockResolvedValue({
      rows: [explorerRow('p-manage', 'Acme Billing Revamp', true)],
      applied_metric_ids: [],
      metrics: [],
    });
    renderPage();

    const cell = await actionCellFor('Acme Billing Revamp');
    expect(within(cell).getByRole('button', { name: 'Edit' })).toBeDisabled();
  });

  it('says why rather than leaving a dead button', async () => {
    fetchKpiExplorerMock.mockResolvedValue({
      rows: [explorerRow('p-read', 'Acme Analytics Hub', false)],
      applied_metric_ids: [],
      metrics: [],
    });
    renderPage();

    const cell = await actionCellFor('Acme Analytics Hub');
    expect(within(cell).getByText(/coming soon/i)).toBeInTheDocument();
  });

  it('disables Configure metrics', async () => {
    fetchKpiExplorerMock.mockResolvedValue({
      rows: [explorerRow('p-manage', 'Acme Billing Revamp', true)],
      applied_metric_ids: [],
      metrics: [],
    });
    renderPage();

    expect(await screen.findByRole('button', { name: 'Configure metrics' })).toBeDisabled();
  });

  it('opens no weekly-report dialog when a project row is clicked', async () => {
    const user = userEvent.setup();
    fetchKpiExplorerMock.mockResolvedValue({
      rows: [explorerRow('p-manage', 'Acme Billing Revamp', true)],
      applied_metric_ids: [],
      metrics: [],
    });
    renderPage();

    await user.click(await screen.findByText('Acme Billing Revamp'));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
