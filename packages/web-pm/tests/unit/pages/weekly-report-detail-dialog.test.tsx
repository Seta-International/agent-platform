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

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }));

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
  trend: [{ iso_year: 2026, iso_week: 32, colour: 'green' }],
  reports: [],
  can_manage: true,
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

    expect(screen.getByPlaceholderText('Write a comment')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Edit$/i })).toBeNull();
  });

  it('lands on the read view when opened to compose a week already reported', async () => {
    renderComposer();
    await screen.findByText('Steady week.');

    expect(screen.queryByRole('radiogroup', { name: /Q — Quality/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Submit report/i })).toBeNull();
    expect(screen.getByPlaceholderText('Write a comment')).toBeTruthy();
  });
});
