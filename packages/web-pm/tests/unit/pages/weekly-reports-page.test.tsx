import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WeeklyReportCard, WeeklyReportDetail } from '../../../src/api/pm-client.ts';
import { WeeklyReportsPage } from '../../../src/pages/weekly-reports-page.tsx';

const routerState = vi.hoisted(() => ({
  search: {} as Record<string, unknown>,
  navigate: vi.fn(),
}));
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => routerState.navigate,
  useSearch: () => routerState.search,
}));

const fetchWeeklyReportsMock = vi.fn();
const fetchDetailMock = vi.fn();
vi.mock('../../../src/api/pm-client.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/api/pm-client.ts')>();
  return {
    ...actual,
    fetchCurrentWeek: () => Promise.resolve({ iso_year: 2026, iso_week: 32 }),
    fetchAccounts: () => Promise.resolve([]),
    fetchProjects: () =>
      Promise.resolve([
        {
          project_id: 'p-1',
          account_id: 'acc-1',
          name: 'Acme API Gateway',
          phase: 'delivery',
          status: 'active' as const,
          pm_worker_id: null,
          can_manage: true,
        },
      ]),
    fetchWeeklyReports: () => fetchWeeklyReportsMock(),
    fetchWeeklyReportDetail: () => fetchDetailMock(),
  };
});

const card: WeeklyReportCard = {
  project_id: 'p-1',
  project_name: 'Acme API Gateway',
  account_id: 'acc-1',
  account_name: 'Acme Corporation',
  pm_name: 'Mai Tran',
  pmo_name: null,
  overall_colour: 'green',
  category_colours: {
    quality: 'green',
    cost_capacity: 'green',
    delivery: 'green',
    process: 'green',
  },
  stats: { applied_count: 6, measured_count: 6, yellow_count: 0, red_count: 0, worst: null },
  staffed: 4,
  team_size: 5,
  headline_metrics: [],
  latest_summary: null,
  reporters: [],
  report_count: 0,
  can_manage: true,
};

const detail: WeeklyReportDetail = {
  project_id: 'p-1',
  project_name: 'Acme API Gateway',
  account_name: 'Acme Corporation',
  phase: 'delivery',
  pricing_model: 'fixed_price',
  pm_person_id: 'per-1',
  pmo_person_id: null,
  staffed: 4,
  team_size: 5,
  headline_metrics: [],
  pm_name: 'Mai Tran',
  pmo_name: null,
  week_editable: true,
  iso_year: 2026,
  iso_week: 32,
  overall_colour: 'green',
  flags: [
    { category: 'quality', computed_colour: 'green', final_colour: 'green', overridden: false },
    { category: 'delivery', computed_colour: 'green', final_colour: 'green', overridden: false },
    {
      category: 'cost_capacity',
      computed_colour: 'green',
      final_colour: 'green',
      overridden: false,
    },
    { category: 'process', computed_colour: 'green', final_colour: 'green', overridden: false },
  ],
  stats: { applied_count: 6, measured_count: 6, yellow_count: 0, red_count: 0, worst: null },
  trend: [{ iso_year: 2026, iso_week: 32, colour: 'green' }],
  reports: [],
  can_manage: true,
  my_reporter_id: 'per-1',
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <WeeklyReportsPage />
    </QueryClientProvider>,
  );
}

describe('WeeklyReportsPage — detail deep link', () => {
  beforeEach(() => {
    routerState.search = { iso_year: 2026, iso_week: 32 };
    routerState.navigate.mockClear();
    fetchWeeklyReportsMock.mockReset();
    fetchDetailMock.mockReset();
    fetchWeeklyReportsMock.mockResolvedValue([card]);
    fetchDetailMock.mockResolvedValue(detail);
  });

  it('opens the detail for the project named in the URL', async () => {
    routerState.search = { iso_year: 2026, iso_week: 32, detail: 'p-1' };
    renderPage();

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('shows the board alone when no project is named', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Acme API Gateway' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('names the opened project in the URL when a card is clicked', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole('button', { name: 'Open weekly report for Acme API Gateway' }),
    );

    expect(routerState.navigate).toHaveBeenCalledWith(
      expect.objectContaining({ search: expect.objectContaining({ detail: 'p-1' }) }),
    );
  });

  it('drops the project from the URL when the detail closes', async () => {
    const user = userEvent.setup();
    routerState.search = { iso_year: 2026, iso_week: 32, detail: 'p-1' };
    renderPage();

    const dialog = await screen.findByRole('dialog');
    await user.click(await within(dialog).findByRole('button', { name: 'Close' }));

    expect(routerState.navigate).toHaveBeenCalledWith(
      expect.objectContaining({ search: expect.objectContaining({ detail: undefined }) }),
    );
  });
});

const offNormCard: WeeklyReportCard = {
  ...card,
  overall_colour: 'red',
  category_colours: { quality: 'red', cost_capacity: 'green', delivery: 'red', process: 'yellow' },
  stats: {
    applied_count: 14,
    measured_count: 12,
    yellow_count: 2,
    red_count: 3,
    worst: {
      metric_id: 'm-pred',
      name: 'Release Predictability',
      computed_value: 0.62,
      component_count: 2,
      green_band: { op: 'gte', value: 0.85 },
      status: 'red',
    },
  },
  report_count: 4,
};

describe('WeeklyReportsPage — norm-check line', () => {
  beforeEach(() => {
    routerState.search = { iso_year: 2026, iso_week: 32 };
    routerState.navigate.mockClear();
    fetchWeeklyReportsMock.mockReset();
    fetchDetailMock.mockReset();
    fetchDetailMock.mockResolvedValue(detail);
  });

  it('names the worst metric with the norm it missed and how many metrics are off', async () => {
    fetchWeeklyReportsMock.mockResolvedValue([offNormCard]);
    renderPage();

    expect(await screen.findByText('Release Predictability')).toBeInTheDocument();
    expect(screen.getByText('62%')).toBeInTheDocument();
    expect(screen.getByText(/norm ≥ 85%/)).toBeInTheDocument();
    expect(screen.getByText(/3 red · 2 amber/)).toBeInTheDocument();
    expect(screen.getByText('12/14 metrics · 4 reports')).toBeInTheDocument();
  });

  it('stays quiet when every measured metric is on norm', async () => {
    fetchWeeklyReportsMock.mockResolvedValue([
      { ...card, stats: { ...card.stats, applied_count: 6, measured_count: 6 }, report_count: 2 },
    ]);
    renderPage();

    expect(await screen.findByText('All on norm')).toBeInTheDocument();
    expect(screen.getByText('6/6 metrics · 2 reports')).toBeInTheDocument();
  });

  it('says nothing was measured instead of showing a zero', async () => {
    fetchWeeklyReportsMock.mockResolvedValue([
      {
        ...card,
        overall_colour: null,
        category_colours: {
          quality: null,
          cost_capacity: null,
          delivery: null,
          process: null,
        },
        stats: { applied_count: 11, measured_count: 0, yellow_count: 0, red_count: 0, worst: null },
        staffed: 3,
        team_size: 4,
        report_count: 0,
      },
    ]);
    renderPage();

    expect(await screen.findByText('No figures this week')).toBeInTheDocument();
    expect(screen.getByText('Staffed 3/4 · click to write one')).toBeInTheDocument();
  });

  it('drops the staffing hint when the charter has no team size', async () => {
    fetchWeeklyReportsMock.mockResolvedValue([
      {
        ...card,
        stats: { applied_count: 11, measured_count: 0, yellow_count: 0, red_count: 0, worst: null },
        team_size: null,
        report_count: 0,
      },
    ]);
    renderPage();

    expect(await screen.findByText('click to write one')).toBeInTheDocument();
  });

  it('does not invite a reader who cannot write the report', async () => {
    fetchWeeklyReportsMock.mockResolvedValue([
      {
        ...card,
        stats: { applied_count: 11, measured_count: 0, yellow_count: 0, red_count: 0, worst: null },
        staffed: 3,
        team_size: 4,
        report_count: 0,
        can_manage: false,
      },
    ]);
    renderPage();

    expect(await screen.findByText('Staffed 3/4 · no report yet')).toBeInTheDocument();
  });
});
