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

const projectsState = vi.hoisted(() => ({
  canReport: true,
  rows: [{ project_id: 'p-1', name: 'Acme API Gateway' }],
}));
const weekState = vi.hoisted(() => ({ current: { iso_year: 2026, iso_week: 32 } }));
const fetchWeeklyReportsMock = vi.fn();
const fetchDetailMock = vi.fn();
vi.mock('../../../src/api/pm-client.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/api/pm-client.ts')>();
  return {
    ...actual,
    fetchCurrentWeek: () => Promise.resolve(weekState.current),
    fetchAccounts: () => Promise.resolve([]),
    fetchProjects: () =>
      Promise.resolve(
        projectsState.rows.map((p) => ({
          project_id: p.project_id,
          account_id: 'acc-1',
          name: p.name,
          phase: 'delivery',
          status: 'active' as const,
          pm_worker_id: null,
          can_manage: true,
          can_report: projectsState.canReport,
        })),
      ),
    fetchWeeklyReports: () => fetchWeeklyReportsMock(),
    fetchWeeklyReportDetail: (params: unknown) => fetchDetailMock(params),
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

const WEDNESDAY_OF_W32 = new Date('2026-08-05T03:00:00Z');
const FRIDAY_1800_VNT_OF_W32 = new Date('2026-08-07T11:00:00Z');
const MONDAY_0000_VNT_OF_W33 = new Date('2026-08-09T17:00:00Z');

describe('WeeklyReportsPage — who may open the composer', () => {
  beforeEach(() => {
    vi.setSystemTime(WEDNESDAY_OF_W32);
    routerState.search = {};
    routerState.navigate.mockClear();
    fetchWeeklyReportsMock.mockReset();
    fetchDetailMock.mockReset();
    fetchWeeklyReportsMock.mockResolvedValue([card]);
    fetchDetailMock.mockResolvedValue(detail);
  });

  afterEach(() => {
    vi.useRealTimers();
    projectsState.canReport = true;
    weekState.current = { iso_year: 2026, iso_week: 32 };
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

  it('disables it, with the reason, once the current week is past its Friday deadline', async () => {
    const user = userEvent.setup();
    vi.setSystemTime(FRIDAY_1800_VNT_OF_W32);
    renderPage();

    await waitFor(() => expect(composeButton()).toBeDisabled());

    const wrapper = composeButton().closest('span[tabindex="0"]');
    expect(wrapper).not.toBeNull();
    await user.hover(wrapper as HTMLElement);
    expect(await screen.findByText(/closed at Friday 5:00 PM/i)).toBeTruthy();
  });

  it('offers the composer again once Monday opens the new week', async () => {
    vi.setSystemTime(MONDAY_0000_VNT_OF_W33);
    weekState.current = { iso_year: 2026, iso_week: 33 };
    renderPage();

    await screen.findByRole('button', { name: /New weekly report/i });
    await waitFor(() => expect(composeButton()).toBeEnabled());
  });
});

describe('WeeklyReportsPage — the week you have already reported', () => {
  const mine: WeeklyReportCard = { ...card, reported_by_me: true, report_count: 1 };

  beforeEach(() => {
    vi.setSystemTime(WEDNESDAY_OF_W32);
    routerState.search = { iso_year: 2026, iso_week: 32 };
    routerState.navigate.mockClear();
    fetchWeeklyReportsMock.mockReset();
    fetchDetailMock.mockReset();
    fetchWeeklyReportsMock.mockResolvedValue([mine]);
    fetchDetailMock.mockResolvedValue(detail);
  });

  afterEach(() => {
    vi.useRealTimers();
    projectsState.rows = [{ project_id: 'p-1', name: 'Acme API Gateway' }];
  });

  it('disables the composer, with the reason, once every project is already reported', async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /New weekly report/i })).toBeDisabled(),
    );

    const wrapper = screen
      .getByRole('button', { name: /New weekly report/i })
      .closest('span[tabindex="0"]');
    expect(wrapper).not.toBeNull();
    await user.hover(wrapper as HTMLElement);
    expect(await screen.findByText(/already written this week’s report/i)).toBeTruthy();
  });

  it('composes the project you have not reported, not the first one you manage', async () => {
    const user = userEvent.setup();
    projectsState.rows = [
      { project_id: 'p-1', name: 'Acme API Gateway' },
      { project_id: 'p-2', name: 'Acme Billing Revamp' },
    ];
    fetchWeeklyReportsMock.mockResolvedValue([
      mine,
      { ...card, project_id: 'p-2', project_name: 'Acme Billing Revamp' },
    ]);
    renderPage();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /New weekly report/i })).toBeEnabled(),
    );
    await user.click(screen.getByRole('button', { name: /New weekly report/i }));

    await waitFor(() =>
      expect(fetchDetailMock).toHaveBeenCalledWith(expect.objectContaining({ project_id: 'p-2' })),
    );
  });

  it('composes what the filtered board shows, not a reported project the filter hides', async () => {
    const user = userEvent.setup();
    projectsState.rows = [
      { project_id: 'p-1', name: 'Acme API Gateway' },
      { project_id: 'p-2', name: 'Beta Data Platform' },
    ];
    // Filtered to another account, so p-1 — already reported — never reaches the board.
    routerState.search = { iso_year: 2026, iso_week: 32, account: 'acc-2' };
    fetchWeeklyReportsMock.mockResolvedValue([
      { ...card, project_id: 'p-2', project_name: 'Beta Data Platform', account_id: 'acc-2' },
    ]);
    renderPage();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /New weekly report/i })).toBeEnabled(),
    );
    await user.click(screen.getByRole('button', { name: /New weekly report/i }));

    await waitFor(() =>
      expect(fetchDetailMock).toHaveBeenCalledWith(expect.objectContaining({ project_id: 'p-2' })),
    );
  });

  it('disables the composer when nothing on the filtered board is yours to report', async () => {
    const user = userEvent.setup();
    routerState.search = { iso_year: 2026, iso_week: 32, account: 'acc-2' };
    fetchWeeklyReportsMock.mockResolvedValue([
      {
        ...card,
        project_id: 'p-9',
        project_name: 'Someone Else’s Project',
        account_id: 'acc-2',
        can_report: false,
      },
    ]);
    renderPage();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /New weekly report/i })).toBeDisabled(),
    );

    const wrapper = screen
      .getByRole('button', { name: /New weekly report/i })
      .closest('span[tabindex="0"]');
    await user.hover(wrapper as HTMLElement);
    expect(await screen.findByText(/none of the projects shown here/i)).toBeTruthy();
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

  it('names the worst metric with the norm it missed and counts nothing else', async () => {
    fetchWeeklyReportsMock.mockResolvedValue([offNormCard]);
    renderPage();

    expect(await screen.findByText('Release Predictability')).toBeInTheDocument();
    expect(screen.getByText('62%')).toBeInTheDocument();
    expect(screen.getByText(/norm ≥ 85%/)).toBeInTheDocument();
    expect(screen.getByText('4 reports')).toBeInTheDocument();
    expect(screen.queryByText(/\d+ red/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\d+\/\d+ metrics/)).not.toBeInTheDocument();
  });

  it('stays quiet when every measured metric is on norm', async () => {
    fetchWeeklyReportsMock.mockResolvedValue([
      { ...card, stats: { ...card.stats, applied_count: 6, measured_count: 6 }, report_count: 2 },
    ]);
    renderPage();

    expect(await screen.findByText('KPI Metrics: All on norm')).toBeInTheDocument();
    expect(screen.getByText('2 reports')).toBeInTheDocument();
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

    expect(await screen.findByText('KPI Metrics: No figures this week')).toBeInTheDocument();
    expect(screen.getByText('No reports')).toBeInTheDocument();
    expect(screen.queryByText(/Staffed/)).not.toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('Not assessed')).toBeInTheDocument();
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

    expect(await screen.findByText('No reports')).toBeInTheDocument();
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
  const pageSizeSelector = () => screen.getByRole('combobox', { name: 'Items per page' });

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
    expect(cardButtons()).toHaveLength(10);
    expect(screen.queryByRole('heading', { name: 'Project 11' })).not.toBeInTheDocument();
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

    expect(await screen.findByRole('heading', { name: 'Project 11' })).toBeInTheDocument();
    expect(cardButtons()).toHaveLength(4);
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

  it('offers the same page sizes as the rest of the app, starting at 10', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('heading', { name: 'Project 01' });
    await user.click(pageSizeSelector());

    expect(await screen.findByRole('option', { name: '10' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '25' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '50' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '100' })).toBeInTheDocument();
  });

  it('shows more cards per page when a bigger page size is chosen', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('heading', { name: 'Project 01' });
    await user.click(pageSizeSelector());
    await user.click(await screen.findByRole('option', { name: '25' }));

    expect(await screen.findByRole('heading', { name: 'Project 11' })).toBeInTheDocument();
    expect(cardButtons()).toHaveLength(14);
    expect(pager().getByText('Page 1 of 1')).toBeInTheDocument();
  });

  it('returns to the first page when the page size changes', async () => {
    fetchWeeklyReportsMock.mockResolvedValue(board(60));
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('heading', { name: 'Project 01' });
    await user.click(nextButton());
    await user.click(nextButton());
    expect(pager().getByText('Page 3 of 6')).toBeInTheDocument();

    await user.click(pageSizeSelector());
    await user.click(await screen.findByRole('option', { name: '25' }));

    expect(await screen.findByRole('heading', { name: 'Project 01' })).toBeInTheDocument();
    expect(pager().getByText('Page 1 of 3')).toBeInTheDocument();
  });

  it('offers no controls when the week has no project', async () => {
    fetchWeeklyReportsMock.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText('No projects for this week')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /next page/i })).not.toBeInTheDocument();
  });
});

describe('WeeklyReportsPage — a board that failed to load', () => {
  beforeEach(() => {
    vi.setSystemTime(WEDNESDAY_OF_W32);
    routerState.search = { iso_year: 2026, iso_week: 32 };
    routerState.navigate.mockClear();
    fetchWeeklyReportsMock.mockReset();
    fetchDetailMock.mockReset();
    fetchDetailMock.mockResolvedValue(detail);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('says the board failed rather than claiming the week is empty', async () => {
    fetchWeeklyReportsMock.mockRejectedValue(new Error('iso_week must be between 1 and 53'));
    renderPage();

    expect(await screen.findByText(/couldn’t load this week’s board/i)).toBeInTheDocument();
    expect(screen.queryByText('No projects for this week')).not.toBeInTheDocument();
  });

  it('carries the reason the request was rejected', async () => {
    fetchWeeklyReportsMock.mockRejectedValue(new Error('iso_week must be between 1 and 53'));
    renderPage();

    expect(await screen.findByText('iso_week must be between 1 and 53')).toBeInTheDocument();
  });

  it('offers a retry that asks for the board again', async () => {
    const user = userEvent.setup();
    fetchWeeklyReportsMock.mockRejectedValue(new Error('Service unavailable'));
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(fetchWeeklyReportsMock.mock.calls.length).toBeGreaterThan(1));
  });

  it('recovers to the board when the retry succeeds', async () => {
    const user = userEvent.setup();
    fetchWeeklyReportsMock.mockRejectedValueOnce(new Error('Service unavailable'));
    fetchWeeklyReportsMock.mockResolvedValue([card]);
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('heading', { name: 'Acme API Gateway' })).toBeInTheDocument();
    expect(screen.queryByText(/couldn’t load this week’s board/i)).not.toBeInTheDocument();
  });

  it('withholds the composer while the board is unknown', async () => {
    const user = userEvent.setup();
    fetchWeeklyReportsMock.mockRejectedValue(new Error('Service unavailable'));
    renderPage();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /New weekly report/i })).toBeDisabled(),
    );

    const wrapper = screen
      .getByRole('button', { name: /New weekly report/i })
      .closest('span[tabindex="0"]');
    await user.hover(wrapper as HTMLElement);
    expect(await screen.findByText(/board could not be loaded/i)).toBeTruthy();
  });
});
