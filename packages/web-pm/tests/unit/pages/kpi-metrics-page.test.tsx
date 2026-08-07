import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KpiMetricsPage } from '../../../src/pages/kpi-metrics-page.tsx';

const routerState = vi.hoisted(() => ({
  search: { iso_year: 2026, iso_week: 32 } as Record<string, unknown>,
  navigate: vi.fn(),
}));
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => routerState.navigate,
  useSearch: () => routerState.search,
  Link: ({
    children,
    to,
    search,
    ...rest
  }: {
    children?: ReactNode;
    to?: string;
    search?: unknown;
  }) => (
    <a href={to} data-search={JSON.stringify(search)} {...rest}>
      {children}
    </a>
  ),
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

const weeklyReportDetail = {
  project_id: 'p-manage',
  project_name: 'Acme Billing Revamp',
  account_name: 'Acme Corporation',
  phase: 'delivery',
  pricing_model: 'fixed_price' as const,
  pm_person_id: 'per-1',
  pmo_person_id: null,
  staffed: 4,
  team_size: 4,
  headline_metrics: [],
  pm_name: 'Mai Tran',
  pmo_name: null,
  week_editable: true,
  iso_year: 2026,
  iso_week: 32,
  overall_colour: 'green' as const,
  flags: [],
  stats: { applied_count: 0, measured_count: 0, yellow_count: 0, red_count: 0, worst: null },
  trend: [],
  reports: [],
  can_manage: true,
  my_reporter_id: 'per-1',
};

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
    fetchWeeklyReportDetail: () => Promise.resolve(weeklyReportDetail),
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

async function healthCellFor(projectName: string): Promise<HTMLElement> {
  const table = await screen.findByRole('table');
  const row = (await within(table).findByText(projectName)).closest('tr');
  if (!row) throw new Error(`no row for ${projectName}`);
  return within(row).getAllByRole('cell')[2] as HTMLElement;
}

const WEDNESDAY_OF_W32 = new Date('2026-08-05T03:00:00Z');
const FRIDAY_1800_VNT_OF_W32 = new Date('2026-08-07T11:00:00Z');

describe('KpiMetricsPage — entry actions', () => {
  beforeEach(() => {
    vi.setSystemTime(WEDNESDAY_OF_W32);
    routerState.search = { iso_year: 2026, iso_week: 32 };
    routerState.navigate.mockClear();
    fetchCurrentWeekMock.mockResolvedValue({ iso_year: 2026, iso_week: 32 });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    fetchKpiExplorerMock.mockReset();
    fetchProjectsMock.mockReset();
    fetchCurrentWeekMock.mockReset();
  });

  it('offers Enter on a managed project with no figures yet', async () => {
    fetchProjectsMock.mockResolvedValue([projectRow('p-manage', 'Acme Billing Revamp', true)]);
    fetchKpiExplorerMock.mockResolvedValue({
      rows: [explorerRow('p-manage', 'Acme Billing Revamp', true)],
      applied_metric_ids: [],
      metrics: [],
    });
    renderPage();

    const cell = await actionCellFor('Acme Billing Revamp');
    expect(within(cell).getByRole('button', { name: 'Enter' })).toBeEnabled();
  });

  it('offers Edit once the project has a saved record', async () => {
    fetchProjectsMock.mockResolvedValue([projectRow('p-manage', 'Acme Billing Revamp', true)]);
    fetchKpiExplorerMock.mockResolvedValue({
      rows: [{ ...explorerRow('p-manage', 'Acme Billing Revamp', true), record_id: 'rec-1' }],
      applied_metric_ids: [],
      metrics: [],
    });
    renderPage();

    const cell = await actionCellFor('Acme Billing Revamp');
    expect(within(cell).getByRole('button', { name: 'Edit' })).toBeEnabled();
  });

  it('offers View instead of Enter once the week has closed', async () => {
    vi.setSystemTime(FRIDAY_1800_VNT_OF_W32);
    fetchProjectsMock.mockResolvedValue([projectRow('p-manage', 'Acme Billing Revamp', true)]);
    fetchKpiExplorerMock.mockResolvedValue({
      rows: [explorerRow('p-manage', 'Acme Billing Revamp', true)],
      applied_metric_ids: [],
      metrics: [],
    });
    renderPage();

    const cell = await actionCellFor('Acme Billing Revamp');
    expect(within(cell).getByRole('button', { name: 'View' })).toBeEnabled();
  });

  it('opens the weekly report of the clicked row without leaving KPI Metrics', async () => {
    const user = userEvent.setup();
    fetchProjectsMock.mockResolvedValue([projectRow('p-manage', 'Acme Billing Revamp', true)]);
    fetchKpiExplorerMock.mockResolvedValue({
      rows: [explorerRow('p-manage', 'Acme Billing Revamp', true)],
      applied_metric_ids: [],
      metrics: [],
    });
    renderPage();

    await user.click(await screen.findByText('Acme Corporation'));

    expect(routerState.navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        to: '/pm/metrics',
        search: expect.objectContaining({
          detail: 'p-manage',
          iso_year: 2026,
          iso_week: 32,
        }),
      }),
    );
  });

  it('leaves the row filters untouched when a row opens its weekly report', async () => {
    const user = userEvent.setup();
    routerState.search = { iso_year: 2026, iso_week: 32, project: 'p-other' };
    fetchProjectsMock.mockResolvedValue([projectRow('p-manage', 'Acme Billing Revamp', true)]);
    fetchKpiExplorerMock.mockResolvedValue({
      rows: [explorerRow('p-manage', 'Acme Billing Revamp', true)],
      applied_metric_ids: [],
      metrics: [],
    });
    renderPage();

    await user.click(await screen.findByText('Acme Corporation'));

    expect(routerState.navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        search: expect.objectContaining({ project: 'p-other', detail: 'p-manage' }),
      }),
    );
  });

  it('sends the project link to the same weekly report overlay', async () => {
    fetchProjectsMock.mockResolvedValue([projectRow('p-manage', 'Acme Billing Revamp', true)]);
    fetchKpiExplorerMock.mockResolvedValue({
      rows: [explorerRow('p-manage', 'Acme Billing Revamp', true)],
      applied_metric_ids: [],
      metrics: [],
    });
    renderPage();

    const link = await screen.findByRole('link', { name: 'Acme Billing Revamp' });
    expect(link).toHaveAttribute('href', '/pm/metrics');
    expect(JSON.parse(link.getAttribute('data-search') ?? '{}')).toMatchObject({
      detail: 'p-manage',
    });
  });

  it('renders the weekly report dialog while detail is on the metrics URL', async () => {
    routerState.search = { iso_year: 2026, iso_week: 32, detail: 'p-manage' };
    fetchProjectsMock.mockResolvedValue([projectRow('p-manage', 'Acme Billing Revamp', true)]);
    fetchKpiExplorerMock.mockResolvedValue({
      rows: [explorerRow('p-manage', 'Acme Billing Revamp', true)],
      applied_metric_ids: [],
      metrics: [],
    });
    renderPage();

    expect(await screen.findByText('Acme Billing Revamp · 2026-W32')).toBeInTheDocument();
  });

  it('points at the row action instead of a banner button when nothing is entered', async () => {
    fetchProjectsMock.mockResolvedValue([projectRow('p-manage', 'Acme Billing Revamp', true)]);
    fetchKpiExplorerMock.mockResolvedValue({
      rows: [explorerRow('p-manage', 'Acme Billing Revamp', true)],
      applied_metric_ids: [],
      metrics: [],
    });
    renderPage();

    expect(await screen.findByText(/Open a project to enter its numbers\./)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enter weekly KPIs' })).not.toBeInTheDocument();
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

  it('opens the KPI entry dialog from the row action', async () => {
    const user = userEvent.setup();
    fetchProjectsMock.mockResolvedValue([projectRow('p-manage', 'Acme Billing Revamp', true)]);
    fetchKpiExplorerMock.mockResolvedValue({
      rows: [explorerRow('p-manage', 'Acme Billing Revamp', true)],
      applied_metric_ids: [],
      metrics: [],
    });
    renderPage();

    const cell = await actionCellFor('Acme Billing Revamp');
    await user.click(within(cell).getByRole('button', { name: 'Enter' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('offers only manageable projects in the entry dialog project picker', async () => {
    const user = userEvent.setup();
    fetchProjectsMock.mockResolvedValue([
      projectRow('p-manage', 'Acme Billing Revamp', true),
      projectRow('p-read', 'Acme Analytics Hub', false),
    ]);
    fetchKpiExplorerMock.mockResolvedValue({
      rows: [
        explorerRow('p-manage', 'Acme Billing Revamp', true),
        explorerRow('p-read', 'Acme Analytics Hub', false),
      ],
      applied_metric_ids: [],
      metrics: [],
    });
    renderPage();

    const cell = await actionCellFor('Acme Billing Revamp');
    await user.click(within(cell).getByRole('button', { name: 'Enter' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('combobox', { name: /^Project/ }));

    expect(await screen.findByRole('option', { name: 'Acme Billing Revamp' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Acme Analytics Hub' })).not.toBeInTheDocument();
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

describe('KpiMetricsPage — Health column', () => {
  beforeEach(() => {
    vi.setSystemTime(WEDNESDAY_OF_W32);
    routerState.search = { iso_year: 2026, iso_week: 32 };
    fetchCurrentWeekMock.mockResolvedValue({ iso_year: 2026, iso_week: 32 });
    fetchProjectsMock.mockResolvedValue([projectRow('p-1', 'Acme Billing Revamp', true)]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    fetchKpiExplorerMock.mockReset();
    fetchProjectsMock.mockReset();
    fetchCurrentWeekMock.mockReset();
  });

  it('stays neutral for a week with no saved record', async () => {
    fetchKpiExplorerMock.mockResolvedValue({
      rows: [
        {
          ...explorerRow('p-1', 'Acme Billing Revamp', true),
          record_id: null,
          overall_health: null,
          category_health: {
            quality: null,
            cost_capacity: null,
            delivery: null,
            process: null,
          },
        },
      ],
      applied_metric_ids: [],
      metrics: [],
    });
    renderPage();

    const cell = await healthCellFor('Acme Billing Revamp');
    expect(within(cell).getByText('—')).toBeInTheDocument();
    expect(within(cell).queryByText('Red')).not.toBeInTheDocument();
  });

  it('shows the worst assessed pillar, ignoring the pillars left blank', async () => {
    fetchKpiExplorerMock.mockResolvedValue({
      rows: [
        {
          ...explorerRow('p-1', 'Acme Billing Revamp', true),
          record_id: 'rec-1',
          overall_health: 'green' as const,
          category_health: {
            quality: 'green' as const,
            cost_capacity: null,
            delivery: null,
            process: null,
          },
        },
      ],
      applied_metric_ids: [],
      metrics: [],
    });
    renderPage();

    const cell = await healthCellFor('Acme Billing Revamp');
    expect(within(cell).getByText('Green')).toBeInTheDocument();
  });

  it('shows the settled colour once a record exists', async () => {
    fetchKpiExplorerMock.mockResolvedValue({
      rows: [
        {
          ...explorerRow('p-1', 'Acme Billing Revamp', true),
          record_id: 'rec-1',
          overall_health: 'yellow' as const,
        },
      ],
      applied_metric_ids: [],
      metrics: [],
    });
    renderPage();

    expect(
      within(await healthCellFor('Acme Billing Revamp')).getByText('Amber'),
    ).toBeInTheDocument();
  });
});
