import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

const comingSoon = vi.hoisted(() => ({ on: false }));
vi.mock('../../../src/pages/pm-coming-soon.tsx', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/pages/pm-coming-soon.tsx')>();
  return {
    ...actual,
    get WEEKLY_REPORT_COMPOSER_COMING_SOON() {
      return comingSoon.on;
    },
  };
});

const projectsState = vi.hoisted(() => ({ canReport: true }));
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
          can_report: projectsState.canReport,
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
  can_report: true,
  reported_by_me: false,
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
  metrics: [],
  trend: [{ iso_year: 2026, iso_week: 32, colour: 'green' }],
  reports: [],
  can_manage: true,
  can_report: true,
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

describe('WeeklyReportsPage — who may open the composer', () => {
  beforeEach(() => {
    comingSoon.on = false;
    routerState.search = {};
    routerState.navigate.mockClear();
    fetchWeeklyReportsMock.mockReset();
    fetchDetailMock.mockReset();
    fetchWeeklyReportsMock.mockResolvedValue([card]);
    fetchDetailMock.mockResolvedValue(detail);
  });

  afterEach(() => {
    projectsState.canReport = true;
  });

  const composeButton = () => screen.getByRole('button', { name: /New weekly report/i });

  it('offers the composer to a project’s EM or PMO', async () => {
    projectsState.canReport = true;
    renderPage();

    await screen.findByRole('button', { name: /New weekly report/i });
    await waitFor(() => expect(composeButton()).toBeEnabled());
  });

  it('disables it, with the reason, for a reader who is neither', async () => {
    const user = userEvent.setup();
    projectsState.canReport = false;
    renderPage();

    await waitFor(() => expect(composeButton()).toBeDisabled());

    const wrapper = composeButton().closest('span[tabindex="0"]');
    expect(wrapper).not.toBeNull();
    await user.hover(wrapper as HTMLElement);
    expect(await screen.findByText(/EM or PMO can write its weekly report/i)).toBeTruthy();
  });
});

describe('WeeklyReportsPage — composing is held behind coming soon', () => {
  beforeEach(() => {
    comingSoon.on = true;
    routerState.search = {};
    routerState.navigate.mockClear();
    fetchWeeklyReportsMock.mockReset();
    fetchDetailMock.mockReset();
    fetchWeeklyReportsMock.mockResolvedValue([card]);
    fetchDetailMock.mockResolvedValue(detail);
  });

  afterEach(() => {
    comingSoon.on = false;
    projectsState.canReport = true;
  });

  it('disables New weekly report for an EM who could otherwise write it', async () => {
    const user = userEvent.setup();
    projectsState.canReport = true;
    renderPage();

    const button = () => screen.getByRole('button', { name: /New weekly report/i });
    await waitFor(() => expect(button()).toBeDisabled());

    const wrapper = button().closest('span[tabindex="0"]');
    expect(wrapper).not.toBeNull();
    await user.hover(wrapper as HTMLElement);
    expect(await screen.findByText('Coming soon')).toBeTruthy();
  });

  it('still opens the read view of a report you have already written', async () => {
    const user = userEvent.setup();
    routerState.search = { iso_year: 2026, iso_week: 32, project: 'p-1' };
    fetchWeeklyReportsMock.mockResolvedValue([{ ...card, reported_by_me: true, report_count: 1 }]);
    renderPage();

    await user.click(await screen.findByRole('button', { name: /View weekly report/i }));

    expect(routerState.navigate).toHaveBeenCalledWith(
      expect.objectContaining({ search: expect.objectContaining({ detail: 'p-1' }) }),
    );
  });
});

describe('WeeklyReportsPage — the week you have already reported', () => {
  const mine: WeeklyReportCard = { ...card, reported_by_me: true, report_count: 1 };

  beforeEach(() => {
    routerState.search = { iso_year: 2026, iso_week: 32 };
    routerState.navigate.mockClear();
    fetchWeeklyReportsMock.mockReset();
    fetchDetailMock.mockReset();
    fetchWeeklyReportsMock.mockResolvedValue([mine]);
    fetchDetailMock.mockResolvedValue(detail);
  });

  it('names the action "View weekly report" once that project is the filter', async () => {
    routerState.search = { iso_year: 2026, iso_week: 32, project: 'p-1' };
    renderPage();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /View weekly report/i })).toBeEnabled(),
    );
    expect(screen.queryByRole('button', { name: /New weekly report/i })).toBeNull();
  });

  it('opens that report as a read view rather than a composer', async () => {
    const user = userEvent.setup();
    routerState.search = { iso_year: 2026, iso_week: 32, project: 'p-1' };
    renderPage();

    await user.click(await screen.findByRole('button', { name: /View weekly report/i }));

    expect(routerState.navigate).toHaveBeenCalledWith(
      expect.objectContaining({ search: expect.objectContaining({ detail: 'p-1' }) }),
    );
  });

  it('keeps "New weekly report" when no single project is filtered', async () => {
    renderPage();

    expect(await screen.findByRole('button', { name: /New weekly report/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /View weekly report/i })).toBeNull();
  });

  it('still offers the composer on a filtered project you have not reported', async () => {
    routerState.search = { iso_year: 2026, iso_week: 32, project: 'p-1' };
    fetchWeeklyReportsMock.mockResolvedValue([card]);
    renderPage();

    expect(await screen.findByRole('button', { name: /New weekly report/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /View weekly report/i })).toBeNull();
  });
});

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
    expect(screen.getByText('Staffed 3/4 · No reports')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('Not assessed')).toBeInTheDocument();
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

    expect(await screen.findByText('No reports')).toBeInTheDocument();
  });

  it('reports the same empty state to a reader who cannot write', async () => {
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

    expect(await screen.findByText('Staffed 3/4 · No reports')).toBeInTheDocument();
  });
});

const board = (count: number): WeeklyReportCard[] =>
  Array.from({ length: count }, (_, i) => ({
    ...card,
    project_id: `p-${i + 1}`,
    project_name: `Project ${String(i + 1).padStart(2, '0')}`,
  }));

describe('WeeklyReportsPage — pagination', () => {
  const cardButtons = () => screen.getAllByRole('button', { name: /^Open weekly report for/ });
  const pager = () => within(screen.getByRole('navigation', { name: 'Weekly report pages' }));
  const prevButton = () => pager().getByRole('button', { name: /previous page/i });
  const nextButton = () => pager().getByRole('button', { name: /next page/i });

  beforeEach(() => {
    routerState.search = { iso_year: 2026, iso_week: 32 };
    routerState.navigate.mockClear();
    fetchWeeklyReportsMock.mockReset();
    fetchDetailMock.mockReset();
    fetchWeeklyReportsMock.mockResolvedValue(board(14));
    fetchDetailMock.mockResolvedValue(detail);
  });

  it('shows one page of cards with the prev/next controls and the page indicator', async () => {
    renderPage();

    await screen.findByRole('heading', { name: 'Project 01' });
    expect(cardButtons()).toHaveLength(12);
    expect(screen.queryByRole('heading', { name: 'Project 13' })).not.toBeInTheDocument();
    expect(pager().getByText('Page 1 of 2')).toBeInTheDocument();
    expect(prevButton()).toBeDisabled();
    expect(nextButton()).toBeEnabled();
  });

  it('counts every project of the week above the grid, not just the page', async () => {
    renderPage();

    const totalTile = (await screen.findByText(/projects · 2026-W32/)).closest('div');
    expect(totalTile).not.toBeNull();
    expect(within(totalTile as HTMLElement).getByText('14')).toBeInTheDocument();
  });

  it('walks to the rest of the board and back', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('heading', { name: 'Project 01' });
    await user.click(nextButton());

    expect(await screen.findByRole('heading', { name: 'Project 13' })).toBeInTheDocument();
    expect(cardButtons()).toHaveLength(2);
    expect(pager().getByText('Page 2 of 2')).toBeInTheDocument();
    expect(nextButton()).toBeDisabled();

    await user.click(prevButton());

    expect(await screen.findByRole('heading', { name: 'Project 01' })).toBeInTheDocument();
    expect(pager().getByText('Page 1 of 2')).toBeInTheDocument();
  });

  it('returns to the first page when the filters change', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('heading', { name: 'Project 01' });
    await user.click(nextButton());
    expect(pager().getByText('Page 2 of 2')).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: 'Week' }));
    await user.click(await screen.findByRole('option', { name: '2026-W31' }));

    expect(pager().getByText('Page 1 of 2')).toBeInTheDocument();
  });

  it('keeps the controls in reach when a single page holds the whole board', async () => {
    fetchWeeklyReportsMock.mockResolvedValue(board(3));
    renderPage();

    await screen.findByRole('heading', { name: 'Project 01' });
    expect(pager().getByText('Page 1 of 1')).toBeInTheDocument();
    expect(prevButton()).toBeDisabled();
    expect(nextButton()).toBeDisabled();
  });

  it('offers no controls when the week has no project', async () => {
    fetchWeeklyReportsMock.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText('No projects for this week')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /next page/i })).not.toBeInTheDocument();
  });
});
