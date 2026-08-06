import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KpiMetricsPage } from '../../../src/pages/kpi-metrics-page.tsx';

const routerState = vi.hoisted(() => ({
  search: { iso_year: 2026, iso_week: 32 } as Record<string, unknown>,
}));
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useSearch: () => routerState.search,
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

const projectRow = (
  project_id: string,
  name: string,
  can_manage: boolean,
  account_id = 'acc-1',
) => ({
  project_id,
  account_id,
  name,
  phase: 'delivery',
  status: 'active' as const,
  pm_worker_id: null,
  can_manage,
});

const fetchKpiExplorerMock = vi.fn();
const fetchProjectsMock = vi.fn();
const fetchCurrentWeekMock = vi.fn();
vi.mock('../../../src/api/pm-client.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/api/pm-client.ts')>();
  return {
    ...actual,
    fetchCurrentWeek: () => fetchCurrentWeekMock(),
    fetchAccounts: () => Promise.resolve([]),
    fetchProjects: () => fetchProjectsMock(),
    fetchKpiNorm: () => Promise.resolve({ metrics: [] }),
    fetchKpiExplorer: () => fetchKpiExplorerMock(),
    fetchAppliedMetrics: () => Promise.resolve([]),
    fetchKpiRecord: () =>
      Promise.resolve({
        record_id: null,
        version: 0,
        project_id: 'p-manage',
        iso_year: 2026,
        iso_week: 32,
        metrics: [],
      }),
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
  const table = await screen.findByRole('table');
  const row = (await within(table).findByText(projectName)).closest('tr');
  if (!row) throw new Error(`no row for ${projectName}`);
  const cells = within(row).getAllByRole('cell');
  return cells[cells.length - 1] as HTMLElement;
}

async function configureButton(): Promise<HTMLElement> {
  return screen.findByRole('button', { name: 'Configure metrics' });
}

const WEDNESDAY_OF_W32 = new Date('2026-08-05T03:00:00Z');
const FRIDAY_1800_VNT_OF_W32 = new Date('2026-08-07T11:00:00Z');

describe('KpiMetricsPage — entry actions', () => {
  beforeEach(() => {
    vi.setSystemTime(WEDNESDAY_OF_W32);
    routerState.search = { iso_year: 2026, iso_week: 32 };
    fetchCurrentWeekMock.mockResolvedValue({ iso_year: 2026, iso_week: 32 });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    fetchKpiExplorerMock.mockReset();
    fetchProjectsMock.mockReset();
    fetchCurrentWeekMock.mockReset();
  });

  it('shows Edit disabled while manual KPI entry is blocked', async () => {
    fetchProjectsMock.mockResolvedValue([projectRow('p-manage', 'Acme Billing Revamp', true)]);
    fetchKpiExplorerMock.mockResolvedValue({
      rows: [explorerRow('p-manage', 'Acme Billing Revamp', true)],
      applied_metric_ids: [],
      metrics: [],
    });
    renderPage();

    const cell = await actionCellFor('Acme Billing Revamp');
    expect(within(cell).getByRole('button', { name: 'Edit' })).toBeDisabled();
  });

  it('leaves no action on a project the viewer only reads', async () => {
    fetchProjectsMock.mockResolvedValue([projectRow('p-read', 'Acme Analytics Hub', false)]);
    fetchKpiExplorerMock.mockResolvedValue({
      rows: [explorerRow('p-read', 'Acme Analytics Hub', false)],
      applied_metric_ids: [],
      metrics: [],
    });
    renderPage();

    const cell = await actionCellFor('Acme Analytics Hub');
    expect(within(cell).queryByRole('button')).not.toBeInTheDocument();
  });

  it('opens no entry dialog when Edit is clicked', async () => {
    const user = userEvent.setup();
    fetchProjectsMock.mockResolvedValue([projectRow('p-manage', 'Acme Billing Revamp', true)]);
    fetchKpiExplorerMock.mockResolvedValue({
      rows: [explorerRow('p-manage', 'Acme Billing Revamp', true)],
      applied_metric_ids: [],
      metrics: [],
    });
    renderPage();

    const cell = await actionCellFor('Acme Billing Revamp');
    await user.click(within(cell).getByRole('button', { name: 'Edit' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the banner entry button disabled when nothing is entered yet', async () => {
    fetchProjectsMock.mockResolvedValue([projectRow('p-manage', 'Acme Billing Revamp', true)]);
    fetchKpiExplorerMock.mockResolvedValue({
      rows: [explorerRow('p-manage', 'Acme Billing Revamp', true)],
      applied_metric_ids: [],
      metrics: [],
    });
    renderPage();

    expect(await screen.findByRole('button', { name: 'Enter weekly KPIs' })).toBeDisabled();
  });

  it('enables Configure metrics when the viewer manages a project', async () => {
    fetchProjectsMock.mockResolvedValue([projectRow('p-manage', 'Acme Billing Revamp', true)]);
    fetchKpiExplorerMock.mockResolvedValue({
      rows: [explorerRow('p-manage', 'Acme Billing Revamp', true)],
      applied_metric_ids: [],
      metrics: [],
    });
    renderPage();

    await waitFor(async () => expect(await configureButton()).toBeEnabled());
  });

  it('disables Configure metrics for a viewer who manages nothing', async () => {
    fetchProjectsMock.mockResolvedValue([projectRow('p-read', 'Acme Analytics Hub', false)]);
    fetchKpiExplorerMock.mockResolvedValue({
      rows: [explorerRow('p-read', 'Acme Analytics Hub', false)],
      applied_metric_ids: [],
      metrics: [],
    });
    renderPage();

    await waitFor(async () => expect(await configureButton()).toBeDisabled());
  });

  it('keeps Configure metrics disabled until the server says which week it is', async () => {
    fetchProjectsMock.mockResolvedValue([projectRow('p-manage', 'Acme Billing Revamp', true)]);
    fetchKpiExplorerMock.mockResolvedValue({
      rows: [explorerRow('p-manage', 'Acme Billing Revamp', true)],
      applied_metric_ids: [],
      metrics: [],
    });
    fetchCurrentWeekMock.mockReturnValue(new Promise(() => {}));
    renderPage();

    await actionCellFor('Acme Billing Revamp');
    expect(await configureButton()).toBeDisabled();
  });

  it('disables Configure metrics while a past week is on screen', async () => {
    routerState.search = { iso_year: 2026, iso_week: 29 };
    fetchProjectsMock.mockResolvedValue([projectRow('p-manage', 'Acme Billing Revamp', true)]);
    fetchKpiExplorerMock.mockResolvedValue({
      rows: [explorerRow('p-manage', 'Acme Billing Revamp', true)],
      applied_metric_ids: [],
      metrics: [],
    });
    renderPage();

    await actionCellFor('Acme Billing Revamp');
    expect(await configureButton()).toBeDisabled();
  });

  it('disables Configure metrics once the current week is past its Friday deadline', async () => {
    vi.setSystemTime(FRIDAY_1800_VNT_OF_W32);
    fetchProjectsMock.mockResolvedValue([projectRow('p-manage', 'Acme Billing Revamp', true)]);
    fetchKpiExplorerMock.mockResolvedValue({
      rows: [explorerRow('p-manage', 'Acme Billing Revamp', true)],
      applied_metric_ids: [],
      metrics: [],
    });
    renderPage();

    await actionCellFor('Acme Billing Revamp');
    expect(await configureButton()).toBeDisabled();
  });

  it('opens the configure dialog from Configure metrics', async () => {
    const user = userEvent.setup();
    fetchProjectsMock.mockResolvedValue([projectRow('p-manage', 'Acme Billing Revamp', true)]);
    fetchKpiExplorerMock.mockResolvedValue({
      rows: [explorerRow('p-manage', 'Acme Billing Revamp', true)],
      applied_metric_ids: [],
      metrics: [],
    });
    renderPage();

    await waitFor(async () => expect(await configureButton()).toBeEnabled());
    await user.click(await configureButton());

    expect(await screen.findByText('Configure KPI metrics')).toBeInTheDocument();
  });

  it('lists only the filtered account’s projects in the configure dialog', async () => {
    const user = userEvent.setup();
    routerState.search = { iso_year: 2026, iso_week: 32, account: 'acc-1' };
    fetchProjectsMock.mockResolvedValue([
      projectRow('p-acme', 'Acme Billing Revamp', true, 'acc-1'),
      projectRow('p-globex', 'Globex Subscriber Insights', true, 'acc-2'),
    ]);
    fetchKpiExplorerMock.mockResolvedValue({
      rows: [explorerRow('p-acme', 'Acme Billing Revamp', true)],
      applied_metric_ids: [],
      metrics: [],
    });
    renderPage();

    await waitFor(async () => expect(await configureButton()).toBeEnabled());
    await user.click(await configureButton());

    expect(
      await screen.findByRole('checkbox', { name: 'Acme Billing Revamp' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('checkbox', { name: 'Globex Subscriber Insights' }),
    ).not.toBeInTheDocument();
  });

  it('derives the account from a project filter when no account is picked', async () => {
    const user = userEvent.setup();
    routerState.search = { iso_year: 2026, iso_week: 32, project: 'p-globex' };
    fetchProjectsMock.mockResolvedValue([
      projectRow('p-acme', 'Acme Billing Revamp', true, 'acc-1'),
      projectRow('p-globex', 'Globex Subscriber Insights', true, 'acc-2'),
    ]);
    fetchKpiExplorerMock.mockResolvedValue({
      rows: [explorerRow('p-globex', 'Globex Subscriber Insights', true)],
      applied_metric_ids: [],
      metrics: [],
    });
    renderPage();

    await waitFor(async () => expect(await configureButton()).toBeEnabled());
    await user.click(await configureButton());

    expect(
      await screen.findByRole('checkbox', { name: 'Globex Subscriber Insights' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Acme Billing Revamp' })).not.toBeInTheDocument();
  });
});
