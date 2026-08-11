import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WeeklyReportDetail, WeeklyReportEntry } from '../../../src/api/pm-client.ts';
import { WeeklyReportDetailDialog } from '../../../src/pages/weekly-report-detail-dialog.tsx';

const fetchDetailMock = vi.fn();
const upsertMock = vi.fn();
vi.mock('../../../src/api/pm-client.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/api/pm-client.ts')>();
  return {
    ...actual,
    fetchWeeklyReportDetail: () => fetchDetailMock(),
    upsertWeeklyReport: (body: unknown) => upsertMock(body),
  };
});

const navigateMock = vi.fn();
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigateMock }));

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

const detail: WeeklyReportDetail = {
  project_id: 'p-1',
  project_name: 'Acme API Gateway',
  account_name: 'Acme',
  phase: 'delivery',
  pricing_model: 'fixed_price',
  pm_person_id: 'per-1',
  pmo_person_id: null,
  staffed: 4,
  team_size: 5,
  headline_metrics: [
    {
      label: 'util',
      name: 'Utilization Rate',
      computed_value: 0.67,
      component_count: 2,
      status: null,
    },
  ],
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
  metrics: [
    {
      metric_id: 'm-1',
      name: 'Utilization Rate',
      category: 'cost_capacity',
      computed_value: 0.67,
      component_count: 2,
      green_band: { op: 'gte', value: 0.85 },
      status: 'green',
    },
    {
      metric_id: 'm-2',
      name: 'Defect Leakage',
      category: 'quality',
      computed_value: 0.3,
      component_count: 2,
      green_band: { op: 'lte', value: 0.05 },
      status: 'red',
    },
    {
      metric_id: 'm-3',
      name: 'Customer Satisfaction',
      category: 'process',
      computed_value: null,
      component_count: 1,
      green_band: { op: 'gte', value: 4 },
      status: null,
    },
  ],
  trend: [{ iso_year: 2026, iso_week: 32, colour: 'green' }],
  reports: [],
  can_manage: true,
  can_report: true,
  my_reporter_id: 'per-1',
};

const myEntry: WeeklyReportEntry = {
  report_id: 'r-1',
  reporter_id: 'per-1',
  reporter_name: 'Mai Tran',
  status: 'submitted',
  published: true,
  executive_summary: 'Steady week.',
  risk_issue: null,
  road_to_green: null,
  road_to_green_owner_id: null,
  road_to_green_owner_name: null,
  road_to_green_due: null,
  overall_colour: 'green',
  version: 1,
  updated_at: '2026-08-06T02:00:00.000Z',
  comments: [],
};

function renderDialog(props: { startInCompose?: boolean } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <WeeklyReportDetailDialog
        project_id="p-1"
        iso_year={2026}
        iso_week={32}
        onOpenChange={vi.fn()}
        {...props}
      />
    </QueryClientProvider>,
  );
}

const renderComposer = () => renderDialog({ startInCompose: true });

const riskSwitch = () => screen.getByRole('switch', { name: /active Risk \/ Issue this week/i });
const submitButton = () => screen.getByRole('button', { name: /Submit report/i });
const field = (name: RegExp) => screen.getByRole('textbox', { name });

describe('WeeklyReportDetailDialog — active risk declaration', () => {
  beforeEach(() => {
    comingSoon.on = false;
    fetchDetailMock.mockResolvedValue(detail);
    upsertMock.mockResolvedValue({ report_id: 'r-1', version: 1, overall_colour: 'green' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fetchDetailMock.mockReset();
    upsertMock.mockReset();
  });

  it('keeps the risk fields out of the form until the switch is on', async () => {
    const user = userEvent.setup();
    renderComposer();
    await screen.findByRole('radiogroup', { name: /Q — Quality/ });

    expect(screen.queryByRole('textbox', { name: /Risk \/ Issue/ })).toBeNull();
    expect(screen.queryByRole('textbox', { name: /Road-to-Green action/ })).toBeNull();

    await user.click(riskSwitch());

    expect(screen.getByRole('textbox', { name: /Risk \/ Issue/ })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: /Road-to-Green action/ })).toBeTruthy();
  });

  it('submits summary only, clearing any risk fields, when the switch is off', async () => {
    const user = userEvent.setup();
    renderComposer();
    await screen.findByRole('radiogroup', { name: /Q — Quality/ });

    await user.type(field(/Executive summary/), 'Steady week, no deviations.');
    await user.click(submitButton());

    await waitFor(() => expect(upsertMock).toHaveBeenCalled());
    expect(upsertMock.mock.calls[0]?.[0]).toMatchObject({
      executive_summary: 'Steady week, no deviations.',
      risk_issue: null,
      road_to_green: null,
      road_to_green_due: null,
    });
  });

  it('blocks an all-Green week once a risk is declared', async () => {
    const user = userEvent.setup();
    renderComposer();
    await screen.findByRole('radiogroup', { name: /Q — Quality/ });

    await user.click(riskSwitch());
    await user.type(field(/Executive summary/), 'Vendor slipped the integration date.');
    await user.type(field(/Risk \/ Issue/), 'Third-party sandbox is down.');
    await user.type(field(/Road-to-Green action/), 'Escalate to the vendor account team.');
    await user.click(submitButton());

    expect(upsertMock).not.toHaveBeenCalled();
    expect(screen.getByText(/Set Q, D, C, or P to Amber or Red/)).toBeTruthy();
  });
});

describe('WeeklyReportDetailDialog — a viewer who is not the EM or PMO', () => {
  const notReporter: WeeklyReportDetail = { ...detail, can_report: false };

  beforeEach(() => {
    comingSoon.on = false;
    fetchDetailMock.mockResolvedValue(notReporter);
    upsertMock.mockResolvedValue({ report_id: 'r-1', version: 1, overall_colour: 'green' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fetchDetailMock.mockReset();
    upsertMock.mockReset();
  });

  it('keeps the composer button visible but disabled, with the reason on hover', async () => {
    const user = userEvent.setup();
    renderDialog();

    const button = await screen.findByRole('button', { name: /New weekly report/i });
    expect(button).toBeDisabled();

    const wrapper = button.closest('span[tabindex="0"]');
    expect(wrapper).not.toBeNull();
    await user.hover(wrapper as HTMLElement);
    expect(await screen.findByText(/only this project.s EM and PMO/i)).toBeTruthy();
  });

  it('refuses to open the composer that the server would reject', async () => {
    renderComposer();
    await screen.findByText('No reports yet');

    expect(screen.queryByRole('radiogroup', { name: /Q — Quality/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Submit report/i })).toBeNull();
    expect(upsertMock).not.toHaveBeenCalled();
  });
});

describe('WeeklyReportDetailDialog — a week with no KPI figures', () => {
  const unassessed: WeeklyReportDetail = {
    ...detail,
    flags: detail.flags.map((f) => ({ ...f, computed_colour: null, final_colour: null })),
    overall_colour: null,
    stats: { applied_count: 6, measured_count: 0, yellow_count: 0, red_count: 0, worst: null },
  };

  beforeEach(() => {
    comingSoon.on = false;
    fetchDetailMock.mockResolvedValue(unassessed);
    upsertMock.mockResolvedValue({ report_id: 'r-1', version: 1, overall_colour: 'green' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fetchDetailMock.mockReset();
    upsertMock.mockReset();
  });

  it('submits the Green the pillars display instead of an undeclared colour', async () => {
    const user = userEvent.setup();
    renderComposer();
    await screen.findByRole('radiogroup', { name: /Q — Quality/ });

    await user.type(field(/Executive summary/), 'First week, no figures yet.');
    await user.click(submitButton());

    await waitFor(() => expect(upsertMock).toHaveBeenCalled());
    expect(upsertMock.mock.calls[0]?.[0]).toMatchObject({
      category_colours: {
        quality: 'green',
        cost_capacity: 'green',
        delivery: 'green',
        process: 'green',
      },
    });
  });

  it('reads Green overall once the pillars default to Green', async () => {
    renderComposer();
    await screen.findByRole('radiogroup', { name: /Q — Quality/ });

    expect(screen.getByText('Green', { selector: 'span' })).toBeTruthy();
  });
});

describe('WeeklyReportDetailDialog — composing is held behind coming soon', () => {
  beforeEach(() => {
    comingSoon.on = true;
    fetchDetailMock.mockResolvedValue(detail);
    upsertMock.mockResolvedValue({ report_id: 'r-1', version: 1, overall_colour: 'green' });
  });

  afterEach(() => {
    comingSoon.on = false;
    vi.restoreAllMocks();
    fetchDetailMock.mockReset();
    upsertMock.mockReset();
  });

  it('disables the empty-state button and says why on hover', async () => {
    const user = userEvent.setup();
    renderDialog();

    const button = await screen.findByRole('button', { name: /New weekly report/i });
    expect(button).toBeDisabled();

    const wrapper = button.closest('span[tabindex="0"]');
    expect(wrapper).not.toBeNull();
    await user.hover(wrapper as HTMLElement);
    expect(await screen.findByText('Coming soon')).toBeTruthy();
  });

  it('opens the read view even when asked to start in the composer', async () => {
    renderComposer();
    await screen.findByText('No reports yet');

    expect(screen.queryByRole('radiogroup', { name: /Q — Quality/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Submit report/i })).toBeNull();
    expect(upsertMock).not.toHaveBeenCalled();
  });
});

describe('WeeklyReportDetailDialog — the week’s metrics', () => {
  beforeEach(() => {
    fetchDetailMock.mockResolvedValue(detail);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fetchDetailMock.mockReset();
    navigateMock.mockReset();
  });

  const explorerLink = () =>
    screen.getByRole('button', { name: /See all 6 metrics in KPI Explorer/i });

  it('hands the week’s figures off to KPI Explorer on the same project and week', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(await screen.findByRole('button', { name: /in KPI Explorer/i }));

    expect(navigateMock).toHaveBeenCalledWith({
      to: '/pm/metrics',
      search: { tab: 'explorer', project: 'p-1', iso_year: 2026, iso_week: 32 },
    });
  });

  it('counts the metrics applied this week in the hand-off', async () => {
    renderDialog();

    expect(await screen.findByText(/See all 6 metrics in KPI Explorer/)).toBeTruthy();
    expect(explorerLink()).toBeTruthy();
  });

  it('offers no hand-off for a week with no applied metric', async () => {
    fetchDetailMock.mockResolvedValue({
      ...detail,
      stats: { ...detail.stats, applied_count: 0, measured_count: 0 },
      metrics: [],
    });
    renderDialog();
    await screen.findByText('No reports yet');

    expect(screen.queryByRole('button', { name: /in KPI Explorer/i })).toBeNull();
  });
});

describe('WeeklyReportDetailDialog — header subtitle', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    fetchDetailMock.mockReset();
  });

  it('names the EM and the PMO beside the client and the phase', async () => {
    fetchDetailMock.mockResolvedValue({ ...detail, pmo_name: 'Thuy Pham' });
    renderDialog();

    expect(
      await screen.findByText('Acme · EM Mai Tran · PMO Thuy Pham · Delivery · Fixed-price'),
    ).toBeTruthy();
  });

  it('drops the roles the project has not filled', async () => {
    fetchDetailMock.mockResolvedValue({ ...detail, pm_name: null, pmo_name: null });
    renderDialog();

    expect(await screen.findByText('Acme · Delivery · Fixed-price')).toBeTruthy();
  });
});

describe('WeeklyReportDetailDialog — a submitted report is final', () => {
  beforeEach(() => {
    fetchDetailMock.mockResolvedValue({ ...detail, reports: [myEntry] });
    upsertMock.mockResolvedValue({ report_id: 'r-1', version: 1, overall_colour: 'green' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fetchDetailMock.mockReset();
    upsertMock.mockReset();
  });

  it('offers no way to edit a report the viewer already submitted', async () => {
    renderDialog();
    await screen.findByText('Steady week.');

    expect(screen.getByPlaceholderText('Write a comment — Enter to submit')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Edit$/i })).toBeNull();
  });

  it('lands on the read view when opened to compose a week already reported', async () => {
    renderComposer();
    await screen.findByText('Steady week.');

    expect(screen.queryByRole('radiogroup', { name: /Q — Quality/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Submit report/i })).toBeNull();
    expect(screen.getByPlaceholderText('Write a comment — Enter to submit')).toBeTruthy();
  });
});
