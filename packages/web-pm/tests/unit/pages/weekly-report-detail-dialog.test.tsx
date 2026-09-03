import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WeeklyReportDetail, WeeklyReportEntry } from '../../../src/api/pm-client.ts';
import { WeeklyReportDetailDialog } from '../../../src/pages/weekly-report-detail-dialog.tsx';

const fetchDetailMock = vi.fn();
const upsertMock = vi.fn();
const addCommentMock = vi.fn();
vi.mock('../../../src/api/pm-client.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/api/pm-client.ts')>();
  return {
    ...actual,
    fetchWeeklyReportDetail: () => fetchDetailMock(),
    upsertWeeklyReport: (body: unknown) => upsertMock(body),
    addWeeklyReportComment: (body: unknown) => addCommentMock(body),
  };
});

const navigateMock = vi.fn();
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigateMock }));

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

function renderDialog(
  props: {
    startInCompose?: boolean;
    onOpenChange?: (open: boolean) => void;
    projectOptions?: { value: string; label: string }[];
    onProjectChange?: (project_id: string) => void;
    openedFromExplorer?: boolean;
  } = {},
) {
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
const dueField = () => screen.getByRole('combobox', { name: /Due/ }) as HTMLInputElement;
const redRadio = () =>
  within(screen.getByRole('radiogroup', { name: /Q — Quality/ })).getByRole('radio', {
    name: 'Red',
  });

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

  it('lays the pillars out in QCDP order, the order the rest of the product reads them in', async () => {
    renderComposer();
    await screen.findByRole('radiogroup', { name: /Q — Quality/ });

    expect(screen.getAllByRole('radiogroup').map((g) => g.getAttribute('aria-label'))).toEqual([
      'Q — Quality',
      'C — Cost & Capacity',
      'D — Delivery',
      'P — Process',
    ]);
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

  it('asks for the due as a date, and carries the picked day through to the report', async () => {
    const user = userEvent.setup();
    renderComposer();
    await screen.findByRole('radiogroup', { name: /Q — Quality/ });

    await user.click(riskSwitch());
    await user.click(redRadio());
    await user.type(field(/Executive summary/), 'Vendor slipped the integration date.');
    await user.type(field(/Risk \/ Issue/), 'Third-party sandbox is down.');
    await user.type(field(/Road-to-Green action/), 'Escalate to the vendor account team.');
    await user.type(dueField(), '2026-08-12');
    await user.tab();
    expect(dueField().value).toBe('12 Aug 2026');

    await user.click(submitButton());

    await waitFor(() => expect(upsertMock).toHaveBeenCalled());
    expect(upsertMock.mock.calls[0]?.[0]).toMatchObject({ road_to_green_due: '2026-08-12' });
  });

  it('takes no due inside 2026-W32, the week being reported on, which ends Sunday the 9th', async () => {
    const user = userEvent.setup();
    renderComposer();
    await screen.findByRole('radiogroup', { name: /Q — Quality/ });

    await user.click(riskSwitch());
    await user.click(redRadio());
    await user.type(field(/Executive summary/), 'Vendor slipped the integration date.');
    await user.type(field(/Risk \/ Issue/), 'Third-party sandbox is down.');
    await user.type(field(/Road-to-Green action/), 'Escalate to the vendor account team.');
    await user.type(dueField(), '2026-08-07');
    await user.tab();
    await user.click(submitButton());

    expect(upsertMock).not.toHaveBeenCalled();
    expect(dueField().value).toBe('');
    expect(await screen.findByText(/Pick the date the Road-to-Green action is due/)).toBeTruthy();
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
    expect(screen.getByText(/Set Q, C, D, or P to Amber or Red/)).toBeTruthy();
  });

  it('reveals the risk block clean after a submit refused for the summary alone', async () => {
    const user = userEvent.setup();
    renderComposer();
    await screen.findByRole('radiogroup', { name: /Q — Quality/ });

    await user.click(submitButton());
    expect(await screen.findByText(/Add an executive summary before submitting/)).toBeTruthy();

    await user.click(riskSwitch());

    expect(screen.queryByText(/Describe the risk or issue before submitting/)).toBeNull();
    expect(screen.queryByText(/A Road-to-Green action is required/)).toBeNull();
    expect(screen.queryByText(/Pick the date the Road-to-Green action is due/)).toBeNull();
    expect(screen.queryByText(/All four flags are Green/)).toBeNull();
    expect(screen.getByText(/Add an executive summary before submitting/)).toBeTruthy();
  });

  it('starts the risk block over when the switch is flipped off and on again', async () => {
    const user = userEvent.setup();
    renderComposer();
    await screen.findByRole('radiogroup', { name: /Q — Quality/ });

    await user.click(riskSwitch());
    await user.type(field(/Risk \/ Issue/), 'Third-party sandbox is down.');
    await user.type(field(/Road-to-Green action/), 'Escalate to the vendor account team.');
    await user.click(submitButton());
    expect(await screen.findByText(/Pick the date the Road-to-Green action is due/)).toBeTruthy();

    await user.click(riskSwitch());
    await user.click(riskSwitch());

    expect((field(/Risk \/ Issue/) as HTMLTextAreaElement).value).toBe('');
    expect((field(/Road-to-Green action/) as HTMLTextAreaElement).value).toBe('');
    expect(screen.queryByText(/Pick the date the Road-to-Green action is due/)).toBeNull();
    expect(screen.queryByText(/Describe the risk or issue before submitting/)).toBeNull();
  });
});

describe('WeeklyReportDetailDialog — a viewer who is not the EM or PMO', () => {
  const notReporter: WeeklyReportDetail = { ...detail, can_report: false };

  beforeEach(() => {
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

describe('WeeklyReportDetailDialog — a week whose KPIs are over norm', () => {
  const overNorm: WeeklyReportDetail = {
    ...detail,
    stats: {
      applied_count: 6,
      measured_count: 6,
      yellow_count: 0,
      red_count: 1,
      worst: {
        metric_id: 'm-2',
        name: 'Defect Leakage',
        computed_value: 1,
        component_count: 2,
        green_band: { op: 'lte', value: 0.05 },
        status: 'red',
      },
    },
  };

  const overNormBanner = () =>
    screen.getByText(/KPIs are over norm this week/).closest('[data-status]');

  beforeEach(() => {
    fetchDetailMock.mockResolvedValue(overNorm);
    upsertMock.mockResolvedValue({ report_id: 'r-1', version: 1, overall_colour: 'yellow' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fetchDetailMock.mockReset();
    upsertMock.mockReset();
  });

  it('warns before the reporter has tried to submit', async () => {
    renderComposer();
    await screen.findByRole('radiogroup', { name: /Q — Quality/ });

    expect(overNormBanner()?.getAttribute('data-status')).toBe('warning');
  });

  it('turns the warning into an error that names the refusal when submit is refused', async () => {
    const user = userEvent.setup();
    renderComposer();
    await screen.findByRole('radiogroup', { name: /Q — Quality/ });

    await user.type(field(/Executive summary/), 'Steady week, no deviations.');
    await user.click(submitButton());

    expect(upsertMock).not.toHaveBeenCalled();
    expect(overNormBanner()?.getAttribute('data-status')).toBe('error');
    expect(screen.getByText(/Report not submitted/)).toBeTruthy();
  });

  it('keeps the over-norm fact on screen once a pillar carries the flag, minus the done instruction', async () => {
    const user = userEvent.setup();
    renderComposer();
    const quality = await screen.findByRole('radiogroup', { name: /Q — Quality/ });

    await user.type(field(/Executive summary/), 'Defect leakage spiked on the payments module.');
    await user.click(submitButton());
    expect(upsertMock).not.toHaveBeenCalled();
    expect(overNormBanner()?.getAttribute('data-status')).toBe('error');

    await user.click(within(quality).getByRole('radio', { name: 'Amber' }));

    const settled = overNormBanner();
    expect(settled?.getAttribute('data-status')).toBe('warning');
    expect(settled?.textContent).not.toMatch(/Set at least one|Set Q, C, D, or P/);

    await user.click(submitButton());
    await waitFor(() => expect(upsertMock).toHaveBeenCalled());
    expect(upsertMock.mock.calls[0]?.[0]).toMatchObject({
      category_colours: { quality: 'yellow' },
    });
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

  const explorerLink = () => screen.getByRole('button', { name: /KPI Explorer/i });

  it('hands the week’s figures off to KPI Explorer on the same project and week', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(await screen.findByRole('button', { name: /KPI Explorer/i }));

    expect(navigateMock).toHaveBeenCalledWith({
      to: '/pm/metrics',
      search: { tab: 'explorer', project: 'p-1', iso_year: 2026, iso_week: 32 },
    });
  });

  it('offers the hand-off on a week that has applied metrics', async () => {
    renderDialog();
    await screen.findByText('No reports yet');

    expect(explorerLink()).toBeTruthy();
  });

  it('offers no hand-off when the dialog was opened from KPI Explorer itself', async () => {
    renderDialog({ openedFromExplorer: true });
    await screen.findByText('No reports yet');

    expect(screen.queryByRole('button', { name: /KPI Explorer/i })).toBeNull();
  });

  it('offers no hand-off for a week with no applied metric', async () => {
    fetchDetailMock.mockResolvedValue({
      ...detail,
      stats: { ...detail.stats, applied_count: 0, measured_count: 0 },
      metrics: [],
    });
    renderDialog();
    await screen.findByText('No reports yet');

    expect(screen.queryByRole('button', { name: /KPI Explorer/i })).toBeNull();
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

  it('carries the same context into the composer, minus the project its switcher names', async () => {
    fetchDetailMock.mockResolvedValue({ ...detail, pmo_name: 'Thuy Pham' });
    renderDialog({
      startInCompose: true,
      projectOptions: [{ value: 'p-1', label: 'Acme API Gateway' }],
      onProjectChange: vi.fn(),
    });

    expect(
      await screen.findByText('Acme · EM Mai Tran · PMO Thuy Pham · Delivery · Fixed-price'),
    ).toBeTruthy();
  });

  it('leads with the project in a composer that has no switcher to name it', async () => {
    fetchDetailMock.mockResolvedValue({ ...detail, pmo_name: 'Thuy Pham' });
    renderComposer();

    expect(
      await screen.findByText(
        'Acme API Gateway · Acme · EM Mai Tran · PMO Thuy Pham · Delivery · Fixed-price',
      ),
    ).toBeTruthy();
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

    expect(screen.getByLabelText('Write a comment')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Edit$/i })).toBeNull();
  });

  it('lands on the read view when opened to compose a week already reported', async () => {
    renderComposer();
    await screen.findByText('Steady week.');

    expect(screen.queryByRole('radiogroup', { name: /Q — Quality/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Submit report/i })).toBeNull();
    expect(screen.getByLabelText('Write a comment')).toBeTruthy();
  });
});

const comment = (
  id: string,
  body: string,
  created_at: string,
  parent_comment_id: string | null = null,
) => ({ id, parent_comment_id, author_user_id: 'u-1', author_name: 'Mai Tran', body, created_at });

const precedes = (a: Element, b: Element) =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe('WeeklyReportDetailDialog — comment thread', () => {
  const discussed: WeeklyReportEntry = {
    ...myEntry,
    comments: [
      comment('c-1', 'Oldest point', '2026-08-06T03:00:00.000Z'),
      comment('c-2', 'Answering the oldest', '2026-08-06T04:00:00.000Z', 'c-1'),
      comment('c-3', 'Newest point', '2026-08-06T05:00:00.000Z'),
    ],
  };

  beforeEach(() => {
    fetchDetailMock.mockResolvedValue({ ...detail, reports: [discussed] });
    addCommentMock.mockResolvedValue({ id: 'c-4' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fetchDetailMock.mockReset();
    addCommentMock.mockReset();
  });

  it('opens the thread with the composer and leads with the newest comment', async () => {
    renderDialog();
    await screen.findByText('Newest point');

    const composer = screen.getByLabelText('Write a comment');
    expect(precedes(composer, screen.getByText('Newest point'))).toBe(true);
    expect(precedes(screen.getByText('Newest point'), screen.getByText('Oldest point'))).toBe(true);
  });

  it('keeps a reply under the comment it answers rather than reversing it above', async () => {
    renderDialog();
    await screen.findByText('Answering the oldest');

    expect(
      precedes(screen.getByText('Oldest point'), screen.getByText('Answering the oldest')),
    ).toBe(true);
  });

  it('posts the comment the composer holds when Enter submits it', async () => {
    renderDialog();
    await screen.findByText('Newest point');

    const box = screen.getByLabelText('Write a comment');
    fireEvent.input(box, { target: { textContent: 'Watching the defect trend' } });
    fireEvent.keyDown(box, { key: 'Enter' });

    await waitFor(() =>
      expect(addCommentMock).toHaveBeenCalledWith({
        report_id: 'r-1',
        body: 'Watching the defect trend',
      }),
    );
  });
});

describe('WeeklyReportDetailDialog — leaving the composer', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    fetchDetailMock.mockResolvedValue(detail);
    upsertMock.mockResolvedValue({ report_id: 'r-1', version: 1, overall_colour: 'green' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fetchDetailMock.mockReset();
    upsertMock.mockReset();
  });

  const cancelButton = () => screen.getByRole('button', { name: /^Cancel$/ });
  // A closed Astryx dialog stays mounted — only [open] tells the two states apart.
  const discardPrompt = () =>
    document.querySelector<HTMLDialogElement>('dialog[role="alertdialog"][open]');
  const summaryErrorShown = () =>
    screen
      .queryAllByText(/Add an executive summary before submitting/i)
      .some((el) => el.getAttribute('data-type') === 'error');

  const openFromReadView = async (user: ReturnType<typeof userEvent.setup>) => {
    await screen.findByText('No reports yet');
    await user.click(screen.getByRole('button', { name: /New weekly report/i }));
    await screen.findByRole('radiogroup', { name: /Q — Quality/ });
  };

  it('reopens as a fresh form instead of inheriting the last attempt’s errors', async () => {
    const user = userEvent.setup();
    renderDialog();
    await openFromReadView(user);

    await user.click(submitButton());
    await waitFor(() => expect(summaryErrorShown()).toBe(true));

    await user.click(cancelButton());
    await screen.findByText('No reports yet');
    await user.click(screen.getByRole('button', { name: /New weekly report/i }));
    await screen.findByRole('radiogroup', { name: /Q — Quality/ });

    expect(summaryErrorShown()).toBe(false);
  });

  it('leaves an untouched composer without asking', async () => {
    const user = userEvent.setup();
    renderDialog();
    await openFromReadView(user);

    await user.click(cancelButton());

    await screen.findByText('No reports yet');
    expect(discardPrompt()).toBeNull();
  });

  it('asks before throwing away what the reporter typed', async () => {
    const user = userEvent.setup();
    renderDialog();
    await openFromReadView(user);
    await user.type(field(/Executive summary/), 'Halfway through the week');

    await user.click(cancelButton());

    await waitFor(() => expect(discardPrompt()).not.toBeNull());
    expect(within(discardPrompt() as HTMLElement).getByText('Discard this report?')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Submit report/i })).toBeTruthy();
  });

  it('keeps the typed report when the reporter backs out of discarding', async () => {
    const user = userEvent.setup();
    renderDialog();
    await openFromReadView(user);
    await user.type(field(/Executive summary/), 'Halfway through the week');
    await user.click(cancelButton());
    await waitFor(() => expect(discardPrompt()).not.toBeNull());

    await user.click(screen.getByRole('button', { name: /Keep editing/i }));

    await waitFor(() => expect(discardPrompt()).toBeNull());
    expect(field(/Executive summary/)).toHaveValue('Halfway through the week');
  });

  it('clears what was typed once the reporter confirms the discard', async () => {
    const user = userEvent.setup();
    renderDialog();
    await openFromReadView(user);
    await user.type(field(/Executive summary/), 'Halfway through the week');
    await user.click(cancelButton());
    await waitFor(() => expect(discardPrompt()).not.toBeNull());

    await user.click(screen.getByRole('button', { name: /^Discard$/ }));

    await screen.findByText('No reports yet');
    await user.click(screen.getByRole('button', { name: /New weekly report/i }));
    await screen.findByRole('radiogroup', { name: /Q — Quality/ });
    expect(field(/Executive summary/)).toHaveValue('');
  });

  const mainDialog = () => screen.getByRole('dialog');

  it('asks before Escape throws away what the reporter typed', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderDialog({ onOpenChange });
    await openFromReadView(user);
    await user.type(field(/Executive summary/), 'Halfway through the week');

    fireEvent.keyDown(mainDialog(), { key: 'Escape' });

    await waitFor(() => expect(discardPrompt()).not.toBeNull());
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(field(/Executive summary/)).toHaveValue('Halfway through the week');
  });

  it('asks before the header X throws away what the reporter typed', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderDialog({ onOpenChange });
    await openFromReadView(user);
    await user.type(field(/Executive summary/), 'Halfway through the week');

    await user.click(screen.getByRole('button', { name: /^Close$/ }));

    await waitFor(() => expect(discardPrompt()).not.toBeNull());
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('keeps the report when Escape dismisses the discard prompt itself', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderDialog({ onOpenChange });
    await openFromReadView(user);
    await user.type(field(/Executive summary/), 'Halfway through the week');
    fireEvent.keyDown(mainDialog(), { key: 'Escape' });
    await waitFor(() => expect(discardPrompt()).not.toBeNull());

    fireEvent.keyDown(discardPrompt() as HTMLElement, { key: 'Escape' });

    await waitFor(() => expect(discardPrompt()).toBeNull());
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(field(/Executive summary/)).toHaveValue('Halfway through the week');
  });

  it('closes the whole dialog, not just the form, once a close is confirmed', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderDialog({ onOpenChange });
    await openFromReadView(user);
    await user.type(field(/Executive summary/), 'Halfway through the week');
    await user.click(screen.getByRole('button', { name: /^Close$/ }));
    await waitFor(() => expect(discardPrompt()).not.toBeNull());

    await user.click(screen.getByRole('button', { name: /^Discard$/ }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('lets an untouched composer go on Escape without asking', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderDialog({ onOpenChange });
    await openFromReadView(user);

    fireEvent.keyDown(mainDialog(), { key: 'Escape' });

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(discardPrompt()).toBeNull();
  });

  const twoProjects = [
    { value: 'p-1', label: 'Acme API Gateway' },
    { value: 'p-2', label: 'Beta Data Platform' },
  ];

  const composerWithSwitcher = async (
    user: ReturnType<typeof userEvent.setup>,
    onProjectChange: (id: string) => void,
  ) => {
    renderDialog({ startInCompose: true, projectOptions: twoProjects, onProjectChange });
    await screen.findByRole('radiogroup', { name: /Q — Quality/ });
    await user.type(field(/Executive summary/), 'Halfway through the week');
    await user.click(screen.getByRole('combobox', { name: /Project/ }));
    await user.click(await screen.findByRole('option', { name: 'Beta Data Platform' }));
  };

  it('asks before switching project throws away what the reporter typed', async () => {
    const user = userEvent.setup();
    const onProjectChange = vi.fn();
    await composerWithSwitcher(user, onProjectChange);

    await waitFor(() => expect(discardPrompt()).not.toBeNull());
    expect(onProjectChange).not.toHaveBeenCalled();
  });

  it('switches project only once the discard is confirmed', async () => {
    const user = userEvent.setup();
    const onProjectChange = vi.fn();
    await composerWithSwitcher(user, onProjectChange);
    await waitFor(() => expect(discardPrompt()).not.toBeNull());

    await user.click(screen.getByRole('button', { name: /^Discard$/ }));

    expect(onProjectChange).toHaveBeenCalledWith('p-2');
  });

  it('asks before KPI Explorer throws away what the reporter typed', async () => {
    const user = userEvent.setup();
    renderDialog({ startInCompose: true });
    await screen.findByRole('radiogroup', { name: /Q — Quality/ });
    await user.type(field(/Executive summary/), 'Halfway through the week');

    await user.click(screen.getByRole('button', { name: /KPI Explorer/i }));

    await waitFor(() => expect(discardPrompt()).not.toBeNull());
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('leaves for KPI Explorer from an untouched composer without asking', async () => {
    const user = userEvent.setup();
    renderDialog({ startInCompose: true });
    await screen.findByRole('radiogroup', { name: /Q — Quality/ });

    await user.click(screen.getByRole('button', { name: /KPI Explorer/i }));

    await waitFor(() => expect(navigateMock).toHaveBeenCalled());
    expect(discardPrompt()).toBeNull();
  });

  it('closes the dialog when the composer itself was the entry point', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderDialog({ startInCompose: true, onOpenChange });
    await screen.findByRole('radiogroup', { name: /Q — Quality/ });

    await user.click(cancelButton());

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('still offers a way out when the week cannot be loaded', async () => {
    fetchDetailMock.mockRejectedValue(new Error('You are not assigned to this project.'));
    renderDialog();

    expect(await screen.findByText(/not assigned to this project/i)).toBeTruthy();
    // The header X is an icon button of the same name — the footer's is the labelled one.
    const closers = screen.getAllByRole('button', { name: /^Close$/ });
    expect(closers.some((b) => b.textContent?.trim() === 'Close')).toBe(true);
  });
});

describe('WeeklyReportDetailDialog — leaving an unsent comment', () => {
  beforeEach(() => {
    fetchDetailMock.mockResolvedValue({ ...detail, reports: [myEntry] });
    addCommentMock.mockResolvedValue({ id: 'c-1' });
    navigateMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fetchDetailMock.mockReset();
    addCommentMock.mockReset();
    navigateMock.mockReset();
  });

  const mainDialog = () => screen.getByRole('dialog');
  const discardPrompt = () =>
    document.querySelector<HTMLDialogElement>('dialog[role="alertdialog"][open]');
  const closers = (labelled: boolean) =>
    screen
      .getAllByRole('button', { name: /^Close$/ })
      .find((b) => (b.textContent?.trim() === 'Close') === labelled) as HTMLElement;
  const headerX = () => closers(false);
  const footerClose = () => closers(true);

  const typeComment = async (text: string) => {
    await screen.findByText('Steady week.');
    const box = screen.getByLabelText('Write a comment');
    fireEvent.input(box, { target: { textContent: text } });
    await waitFor(() => expect(box.textContent).toBe(text));
    return box;
  };

  it('asks before Escape throws away an unsent comment', async () => {
    const onOpenChange = vi.fn();
    renderDialog({ onOpenChange });
    const box = await typeComment('Defect trend looks off');

    fireEvent.keyDown(mainDialog(), { key: 'Escape' });

    await waitFor(() => expect(discardPrompt()).not.toBeNull());
    expect(within(discardPrompt() as HTMLElement).getByText('Discard this comment?')).toBeTruthy();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(box.textContent).toBe('Defect trend looks off');
  });

  it('asks before the header X throws away an unsent comment', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderDialog({ onOpenChange });
    await typeComment('Defect trend looks off');

    await user.click(headerX());

    await waitFor(() => expect(discardPrompt()).not.toBeNull());
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('asks before the footer Close throws away an unsent comment', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderDialog({ onOpenChange });
    await typeComment('Defect trend looks off');

    await user.click(footerClose());

    await waitFor(() => expect(discardPrompt()).not.toBeNull());
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('keeps the comment when the writer chooses to keep editing', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderDialog({ onOpenChange });
    const box = await typeComment('Defect trend looks off');
    await user.click(footerClose());
    await waitFor(() => expect(discardPrompt()).not.toBeNull());

    await user.click(screen.getByRole('button', { name: /Keep editing/i }));

    await waitFor(() => expect(discardPrompt()).toBeNull());
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(box.textContent).toBe('Defect trend looks off');
  });

  it('closes the dialog once discarding the comment is confirmed', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderDialog({ onOpenChange });
    await typeComment('Defect trend looks off');
    await user.click(footerClose());
    await waitFor(() => expect(discardPrompt()).not.toBeNull());

    await user.click(screen.getByRole('button', { name: /^Discard$/ }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('lets an empty composer go on Escape without asking', async () => {
    const onOpenChange = vi.fn();
    renderDialog({ onOpenChange });
    await screen.findByText('Steady week.');

    fireEvent.keyDown(mainDialog(), { key: 'Escape' });

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(discardPrompt()).toBeNull();
  });

  it('stops asking once the comment has been posted', async () => {
    const onOpenChange = vi.fn();
    renderDialog({ onOpenChange });
    const box = await typeComment('Defect trend looks off');
    fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(() => expect(addCommentMock).toHaveBeenCalled());

    fireEvent.keyDown(mainDialog(), { key: 'Escape' });

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(discardPrompt()).toBeNull();
  });

  const kpiExplorer = () => screen.getByRole('button', { name: /KPI Explorer/i });
  const raiseBackfill = () => screen.getByRole('button', { name: /Raise backfill/i });

  it('asks before KPI Explorer navigates away from an unsent comment', async () => {
    const user = userEvent.setup();
    renderDialog();
    await typeComment('Defect trend looks off');

    await user.click(kpiExplorer());

    await waitFor(() => expect(discardPrompt()).not.toBeNull());
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('reaches KPI Explorer once discarding the comment is confirmed', async () => {
    const user = userEvent.setup();
    renderDialog();
    await typeComment('Defect trend looks off');
    await user.click(kpiExplorer());
    await waitFor(() => expect(discardPrompt()).not.toBeNull());

    await user.click(screen.getByRole('button', { name: /^Discard$/ }));

    expect(navigateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: '/pm/metrics',
        search: expect.objectContaining({ tab: 'explorer' }),
      }),
    );
  });

  it('asks before Raise backfill navigates away from an unsent comment', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderDialog({ onOpenChange });
    await typeComment('Defect trend looks off');

    await user.click(raiseBackfill());

    await waitFor(() => expect(discardPrompt()).not.toBeNull());
    expect(navigateMock).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('reaches resourcing once discarding the comment is confirmed', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderDialog({ onOpenChange });
    await typeComment('Defect trend looks off');
    await user.click(raiseBackfill());
    await waitFor(() => expect(discardPrompt()).not.toBeNull());

    await user.click(screen.getByRole('button', { name: /^Discard$/ }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(navigateMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: '/pm/resourcing', search: { project: 'p-1' } }),
    );
  });

  it('stays put when the writer keeps editing instead of navigating', async () => {
    const user = userEvent.setup();
    renderDialog();
    const box = await typeComment('Defect trend looks off');
    await user.click(kpiExplorer());
    await waitFor(() => expect(discardPrompt()).not.toBeNull());

    await user.click(screen.getByRole('button', { name: /Keep editing/i }));

    await waitFor(() => expect(discardPrompt()).toBeNull());
    expect(navigateMock).not.toHaveBeenCalled();
    expect(box.textContent).toBe('Defect trend looks off');
  });

  it('lets both navigations go straight through when nothing is typed', async () => {
    const user = userEvent.setup();
    renderDialog();
    await screen.findByText('Steady week.');

    await user.click(kpiExplorer());

    expect(discardPrompt()).toBeNull();
    expect(navigateMock).toHaveBeenCalledWith(expect.objectContaining({ to: '/pm/metrics' }));
  });
});
