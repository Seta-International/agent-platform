import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KpiConfigureDialog } from '../../../src/pages/kpi-configure-dialog.tsx';

const METRIC_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_METRIC_ID = '22222222-2222-4222-8222-222222222222';
const DELIVERY_METRIC_ID = '55555555-5555-4555-8555-555555555555';
const PROJECT_ID = '33333333-3333-4333-8333-333333333333';
const PROJECT_B_ID = '44444444-4444-4444-8444-444444444444';

const setAppliedMetricsMock = vi.fn();
const fetchAppliedMetricsMock = vi.fn();

vi.mock('../../../src/api/pm-client.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/api/pm-client.ts')>();
  return {
    ...actual,
    fetchKpiNorm: () =>
      Promise.resolve({
        norm_id: 'n1',
        code: 'SETA-08-SOP-001',
        revision: 'v2.0',
        effective_date: '2026-05-19',
        metrics: [
          {
            metric_id: METRIC_ID,
            category: 'quality',
            tier: 'core',
            name: 'Defect Leakage',
            formula_label: 'Production Defects / Total Defects',
            component_count: 2,
            component_1_label: 'Production defects',
            component_2_label: 'Total defects',
            component_1_integer: true,
            component_2_integer: true,
            component_1_min: 0,
            component_1_max: null,
            is_share: true,
            green_band: { op: 'lte', value: 0.05 },
            yellow_band: { op: 'between', min: 0.06, max: 0.1 },
            red_band: { op: 'gt', value: 0.1 },
            insight: null,
          },
          {
            metric_id: OTHER_METRIC_ID,
            category: 'quality',
            tier: 'core',
            name: 'Reopened Defect Rate',
            formula_label: 'Reopened Defects / Total Defects Closed',
            component_count: 2,
            component_1_label: 'Reopened defects',
            component_2_label: 'Total defects closed',
            component_1_integer: true,
            component_2_integer: true,
            component_1_min: 0,
            component_1_max: null,
            is_share: true,
            green_band: { op: 'lte', value: 0.05 },
            yellow_band: { op: 'between', min: 0.06, max: 0.15 },
            red_band: { op: 'gt', value: 0.15 },
            insight: null,
          },
          {
            metric_id: DELIVERY_METRIC_ID,
            category: 'delivery',
            tier: 'extended',
            name: 'Sprint Goal Success Rate',
            formula_label: 'Goals Met / Goals Committed',
            component_count: 2,
            component_1_label: 'Goals met',
            component_2_label: 'Goals committed',
            component_1_integer: true,
            component_2_integer: true,
            component_1_min: 0,
            component_1_max: null,
            is_share: true,
            green_band: { op: 'gte', value: 0.9 },
            yellow_band: { op: 'between', min: 0.75, max: 0.89 },
            red_band: { op: 'lt', value: 0.75 },
            insight: null,
          },
        ],
      }),
    fetchAppliedMetrics: (...args: unknown[]) => fetchAppliedMetricsMock(...args),
    setAppliedMetrics: (...args: unknown[]) => setAppliedMetricsMock(...args),
  };
});

const project = (project_id: string, name: string) => ({
  project_id,
  account_id: 'acc-1',
  name,
  phase: 'delivery' as const,
  status: 'active' as const,
  pm_worker_id: null,
  can_manage: true,
});

function renderDialog(
  projects = [project(PROJECT_ID, 'Globex Subscriber Insights')],
  initialProjectId: string | null = PROJECT_ID,
  onOpenChange: (open: boolean) => void = () => {},
) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <KpiConfigureDialog
        open
        onOpenChange={onOpenChange}
        projects={projects}
        initialProjectId={initialProjectId ?? undefined}
        currentWeek={{ iso_year: 2026, iso_week: 32 }}
      />
    </QueryClientProvider>,
  );
}

async function uncheck(metricName: string) {
  const user = userEvent.setup();
  const checkbox = await screen.findByRole('checkbox', { name: new RegExp(metricName) });
  await waitFor(() => expect(checkbox).toBeChecked());
  await user.click(checkbox);
  return user;
}

const clickDone = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: 'Done' }));

// useToast self-mounts its viewport on document.body, outside the React root RTL cleans up —
// without this a success toast survives into the next test.
afterEach(() => {
  for (const el of Array.from(document.querySelectorAll('[data-astryx-toast-fallback]')))
    el.remove();
});

describe('KpiConfigureDialog — un-applying a metric (FUT-802 AC5)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setAppliedMetricsMock.mockReset();
    fetchAppliedMetricsMock.mockReset();
  });

  it('queries coverage for the open week so it knows what has been measured', async () => {
    fetchAppliedMetricsMock.mockResolvedValue([
      { metric_id: METRIC_ID, applied_count: 1, entered_count: 0, would_empty_count: 0 },
    ]);
    renderDialog();

    await waitFor(() =>
      expect(fetchAppliedMetricsMock).toHaveBeenCalledWith([PROJECT_ID], {
        iso_year: 2026,
        iso_week: 32,
      }),
    );
  });

  it('turns a metric off without asking when nothing is measured for the week', async () => {
    fetchAppliedMetricsMock.mockResolvedValue([
      { metric_id: METRIC_ID, applied_count: 1, entered_count: 0, would_empty_count: 0 },
      { metric_id: OTHER_METRIC_ID, applied_count: 1, entered_count: 0, would_empty_count: 0 },
    ]);
    setAppliedMetricsMock.mockResolvedValue({});
    renderDialog();

    const user = await uncheck('Defect Leakage');
    expect(screen.queryByText(/stop counting towards/i)).not.toBeInTheDocument();
    await clickDone(user);

    await waitFor(() =>
      expect(setAppliedMetricsMock).toHaveBeenCalledWith(
        [{ metric_id: METRIC_ID, applied: false }],
        [PROJECT_ID],
      ),
    );
  });

  it('warns before saving when figures exist, naming the week and the flag', async () => {
    fetchAppliedMetricsMock.mockResolvedValue([
      { metric_id: METRIC_ID, applied_count: 1, entered_count: 1, would_empty_count: 0 },
      { metric_id: OTHER_METRIC_ID, applied_count: 1, entered_count: 0, would_empty_count: 0 },
    ]);
    setAppliedMetricsMock.mockResolvedValue({});
    renderDialog();

    await uncheck('Defect Leakage');

    const warning = await screen.findByText(/Its 2026-W32 figures/i);
    expect(warning).toHaveTextContent(/Quality flag/i);
    expect(warning).toHaveTextContent(/are deleted when you save/i);
    expect(warning).toHaveTextContent(/blank cell/i);
    expect(screen.getByRole('button', { name: 'Turn it off' })).toBeVisible();
    expect(setAppliedMetricsMock).not.toHaveBeenCalled();
  });

  it('shows one dialog, not two, when the metric is the last one in its category', async () => {
    fetchAppliedMetricsMock.mockResolvedValue([
      { metric_id: METRIC_ID, applied_count: 1, entered_count: 1, would_empty_count: 1 },
      { metric_id: OTHER_METRIC_ID, applied_count: 0, entered_count: 0, would_empty_count: 1 },
    ]);
    renderDialog();

    await uncheck('Defect Leakage');

    expect(await screen.findByText("Can't turn this off")).toBeVisible();
    expect(screen.queryByText(/Its 2026-W32 figures/i)).not.toBeInTheDocument();
    expect(setAppliedMetricsMock).not.toHaveBeenCalled();
  });

  it('shows one dialog when un-applying empties the category in only some selected projects', async () => {
    const user = userEvent.setup();
    fetchAppliedMetricsMock.mockImplementation((projectIds: string[]) =>
      Promise.resolve(
        projectIds.length === 1
          ? [
              { metric_id: METRIC_ID, applied_count: 1, entered_count: 1, would_empty_count: 0 },
              {
                metric_id: OTHER_METRIC_ID,
                applied_count: 1,
                entered_count: 0,
                would_empty_count: 0,
              },
            ]
          : [
              { metric_id: METRIC_ID, applied_count: 2, entered_count: 1, would_empty_count: 1 },
              {
                metric_id: OTHER_METRIC_ID,
                applied_count: 1,
                entered_count: 0,
                would_empty_count: 0,
              },
            ],
      ),
    );
    renderDialog([
      project(PROJECT_ID, 'Globex Subscriber Insights'),
      project(PROJECT_B_ID, 'Nordic Mobile Checkout'),
    ]);

    await user.click(await screen.findByRole('checkbox', { name: 'Nordic Mobile Checkout' }));
    await waitFor(() =>
      expect(fetchAppliedMetricsMock).toHaveBeenCalledWith([PROJECT_ID, PROJECT_B_ID], {
        iso_year: 2026,
        iso_week: 32,
      }),
    );

    const metric = await screen.findByRole('checkbox', { name: /Defect Leakage/ });
    await waitFor(() => expect(metric).toBeChecked());
    await user.click(metric);

    expect(await screen.findByText("Can't turn this off")).toBeVisible();
    expect(screen.queryByText(/stop counting towards/i)).not.toBeInTheDocument();
    expect(setAppliedMetricsMock).not.toHaveBeenCalled();
  });

  it('locks the metric list while the save is in flight', async () => {
    let finishSave: (() => void) | undefined;
    fetchAppliedMetricsMock.mockResolvedValue([
      { metric_id: METRIC_ID, applied_count: 1, entered_count: 0, would_empty_count: 0 },
      { metric_id: OTHER_METRIC_ID, applied_count: 1, entered_count: 0, would_empty_count: 0 },
    ]);
    setAppliedMetricsMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishSave = () => resolve({});
        }),
    );
    renderDialog();

    const user = await uncheck('Defect Leakage');
    await clickDone(user);

    const other = await screen.findByRole('checkbox', { name: /Reopened Defect Rate/ });
    await waitFor(() => expect(other).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();

    finishSave?.();
    await waitFor(() => expect(other).toBeEnabled());
  });

  it('only stages the change after the warning is confirmed', async () => {
    fetchAppliedMetricsMock.mockResolvedValue([
      { metric_id: METRIC_ID, applied_count: 1, entered_count: 1, would_empty_count: 0 },
      { metric_id: OTHER_METRIC_ID, applied_count: 1, entered_count: 0, would_empty_count: 0 },
    ]);
    setAppliedMetricsMock.mockResolvedValue({});
    renderDialog();

    const user = await uncheck('Defect Leakage');
    await screen.findByText(/Its 2026-W32 figures/i);
    await user.click(screen.getByRole('button', { name: 'Turn it off' }));
    await clickDone(user);

    await waitFor(() =>
      expect(setAppliedMetricsMock).toHaveBeenCalledWith(
        [{ metric_id: METRIC_ID, applied: false }],
        [PROJECT_ID],
      ),
    );
  });

  it('warns at Done when a project added after the tick has figures for the week', async () => {
    fetchAppliedMetricsMock.mockImplementation((projectIds: string[]) =>
      Promise.resolve(
        projectIds.length === 1
          ? [
              { metric_id: METRIC_ID, applied_count: 1, entered_count: 0, would_empty_count: 0 },
              {
                metric_id: OTHER_METRIC_ID,
                applied_count: 1,
                entered_count: 0,
                would_empty_count: 0,
              },
            ]
          : [
              { metric_id: METRIC_ID, applied_count: 2, entered_count: 1, would_empty_count: 0 },
              {
                metric_id: OTHER_METRIC_ID,
                applied_count: 2,
                entered_count: 0,
                would_empty_count: 0,
              },
            ],
      ),
    );
    setAppliedMetricsMock.mockResolvedValue({});
    renderDialog([
      project(PROJECT_ID, 'Globex Subscriber Insights'),
      project(PROJECT_B_ID, 'Nordic Mobile Checkout'),
    ]);

    const user = await uncheck('Defect Leakage');
    expect(screen.queryByText(/stop counting towards/i)).not.toBeInTheDocument();

    await user.click(await screen.findByRole('checkbox', { name: 'Nordic Mobile Checkout' }));
    await waitFor(() =>
      expect(fetchAppliedMetricsMock).toHaveBeenCalledWith([PROJECT_ID, PROJECT_B_ID], {
        iso_year: 2026,
        iso_week: 32,
      }),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Done' })).toBeEnabled());
    await clickDone(user);

    const warning = await screen.findByText(/2026-W32 figures/i);
    expect(warning).toHaveTextContent(/Quality flag/i);
    expect(warning).toHaveTextContent(/deleted/i);
    expect(setAppliedMetricsMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Turn it off and save' }));
    await waitFor(() =>
      expect(setAppliedMetricsMock).toHaveBeenCalledWith(
        [{ metric_id: METRIC_ID, applied: false }],
        [PROJECT_ID, PROJECT_B_ID],
      ),
    );
  });
});

describe('KpiConfigureDialog — Done and Cancel replace auto-save (FUT-963)', () => {
  const COVERAGE = [
    { metric_id: METRIC_ID, applied_count: 1, entered_count: 0, would_empty_count: 0 },
    { metric_id: OTHER_METRIC_ID, applied_count: 0, entered_count: 0, would_empty_count: 0 },
    { metric_id: DELIVERY_METRIC_ID, applied_count: 1, entered_count: 0, would_empty_count: 0 },
  ];

  afterEach(() => {
    vi.restoreAllMocks();
    setAppliedMetricsMock.mockReset();
    fetchAppliedMetricsMock.mockReset();
  });

  it('keeps a tick out of the server until Done is clicked', async () => {
    fetchAppliedMetricsMock.mockResolvedValue(COVERAGE);
    renderDialog();

    await uncheck('Defect Leakage');

    expect(setAppliedMetricsMock).not.toHaveBeenCalled();
    expect(await screen.findByText('Not saved')).toBeVisible();
  });

  it('sends every staged tick in one save', async () => {
    fetchAppliedMetricsMock.mockResolvedValue(COVERAGE);
    setAppliedMetricsMock.mockResolvedValue({});
    renderDialog();

    const user = await uncheck('Defect Leakage');
    await user.click(screen.getByRole('checkbox', { name: /Reopened Defect Rate/ }));
    await waitFor(() => expect(screen.getAllByText('Not saved')).toHaveLength(2));
    await clickDone(user);

    await waitFor(() => expect(setAppliedMetricsMock).toHaveBeenCalledTimes(1));
    expect(setAppliedMetricsMock).toHaveBeenCalledWith(
      [
        { metric_id: METRIC_ID, applied: false },
        { metric_id: OTHER_METRIC_ID, applied: true },
      ],
      [PROJECT_ID],
    );
  });

  it('drops a tick that puts the metric back where it started', async () => {
    fetchAppliedMetricsMock.mockResolvedValue(COVERAGE);
    renderDialog();

    const user = await uncheck('Defect Leakage');
    await screen.findByText('Not saved');
    await user.click(screen.getByRole('checkbox', { name: /Defect Leakage/ }));

    await waitFor(() => expect(screen.queryByText('Not saved')).not.toBeInTheDocument());
  });

  it('closes and reports the save with a toast', async () => {
    fetchAppliedMetricsMock.mockResolvedValue(COVERAGE);
    setAppliedMetricsMock.mockResolvedValue({});
    const onOpenChange = vi.fn();
    renderDialog([project(PROJECT_ID, 'Globex Subscriber Insights')], PROJECT_ID, onOpenChange);

    const user = await uncheck('Defect Leakage');
    await clickDone(user);

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(
      await screen.findByText('Metrics updated for Globex Subscriber Insights'),
    ).toBeInTheDocument();
  });

  it('asks before throwing away unsaved ticks, and keeps them when told to', async () => {
    fetchAppliedMetricsMock.mockResolvedValue(COVERAGE);
    const onOpenChange = vi.fn();
    renderDialog([project(PROJECT_ID, 'Globex Subscriber Insights')], PROJECT_ID, onOpenChange);

    const user = await uncheck('Defect Leakage');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(await screen.findByText('Discard changes?')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));

    await waitFor(() => expect(screen.getByText('Discard changes?')).not.toBeVisible());
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(await screen.findByText('Not saved')).toBeVisible();
  });

  it('closes without saving when the unsaved ticks are discarded', async () => {
    fetchAppliedMetricsMock.mockResolvedValue(COVERAGE);
    const onOpenChange = vi.fn();
    renderDialog([project(PROJECT_ID, 'Globex Subscriber Insights')], PROJECT_ID, onOpenChange);

    const user = await uncheck('Defect Leakage');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(await screen.findByRole('button', { name: 'Discard changes' }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(setAppliedMetricsMock).not.toHaveBeenCalled();
  });

  it('closes straight away when nothing was ticked', async () => {
    fetchAppliedMetricsMock.mockResolvedValue(COVERAGE);
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    renderDialog([project(PROJECT_ID, 'Globex Subscriber Insights')], PROJECT_ID, onOpenChange);

    await screen.findByRole('checkbox', { name: /Defect Leakage/ });
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByText('Discard changes?')).not.toBeVisible();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('lets one save swap the last metric in an area for another', async () => {
    fetchAppliedMetricsMock.mockResolvedValue([
      { metric_id: METRIC_ID, applied_count: 1, entered_count: 0, would_empty_count: 1 },
      { metric_id: OTHER_METRIC_ID, applied_count: 0, entered_count: 0, would_empty_count: 0 },
      { metric_id: DELIVERY_METRIC_ID, applied_count: 1, entered_count: 0, would_empty_count: 1 },
    ]);
    setAppliedMetricsMock.mockResolvedValue({});
    const user = userEvent.setup();
    renderDialog();

    await user.click(await screen.findByRole('checkbox', { name: /Reopened Defect Rate/ }));
    await user.click(screen.getByRole('checkbox', { name: /Defect Leakage/ }));

    expect(screen.getByText("Can't turn this off")).not.toBeVisible();
    await clickDone(user);
    await waitFor(() =>
      expect(setAppliedMetricsMock).toHaveBeenCalledWith(
        [
          { metric_id: OTHER_METRIC_ID, applied: true },
          { metric_id: METRIC_ID, applied: false },
        ],
        [PROJECT_ID],
      ),
    );
  });

  it('blocks the tick that empties an area across several staged changes', async () => {
    fetchAppliedMetricsMock.mockResolvedValue([
      { metric_id: METRIC_ID, applied_count: 1, entered_count: 0, would_empty_count: 0 },
      { metric_id: OTHER_METRIC_ID, applied_count: 1, entered_count: 0, would_empty_count: 0 },
      { metric_id: DELIVERY_METRIC_ID, applied_count: 1, entered_count: 0, would_empty_count: 1 },
    ]);
    renderDialog();

    const user = await uncheck('Defect Leakage');
    await user.click(screen.getByRole('checkbox', { name: /Reopened Defect Rate/ }));

    expect(await screen.findByText("Can't turn this off")).toBeVisible();
    expect(screen.getByRole('checkbox', { name: /Reopened Defect Rate/ })).toBeChecked();
    expect(screen.getByText('Not saved')).toBeVisible();
    expect(setAppliedMetricsMock).not.toHaveBeenCalled();
  });
});

describe('KpiConfigureDialog — searching metrics', () => {
  const COVERAGE = [
    { metric_id: METRIC_ID, applied_count: 1, entered_count: 0, would_empty_count: 0 },
    { metric_id: OTHER_METRIC_ID, applied_count: 0, entered_count: 0, would_empty_count: 0 },
    { metric_id: DELIVERY_METRIC_ID, applied_count: 0, entered_count: 0, would_empty_count: 0 },
  ];

  afterEach(() => {
    vi.restoreAllMocks();
    setAppliedMetricsMock.mockReset();
    fetchAppliedMetricsMock.mockReset();
  });

  async function searchFor(query: string) {
    const user = userEvent.setup();
    await screen.findByRole('checkbox', { name: /Defect Leakage/ });
    await user.type(screen.getByLabelText('Search metrics'), query);
    return user;
  }

  it('narrows the list to metrics whose name matches', async () => {
    fetchAppliedMetricsMock.mockResolvedValue(COVERAGE);
    renderDialog();

    await searchFor('reopened');

    expect(await screen.findByRole('checkbox', { name: /Reopened Defect Rate/ })).toBeVisible();
    expect(screen.queryByRole('checkbox', { name: /Defect Leakage/ })).not.toBeInTheDocument();
  });

  it('matches the formula as well as the name', async () => {
    fetchAppliedMetricsMock.mockResolvedValue(COVERAGE);
    renderDialog();

    await searchFor('goals committed');

    expect(await screen.findByRole('checkbox', { name: /Sprint Goal Success Rate/ })).toBeVisible();
    expect(screen.queryByRole('checkbox', { name: /Defect Leakage/ })).not.toBeInTheDocument();
  });

  it('hides a category once nothing in it matches', async () => {
    fetchAppliedMetricsMock.mockResolvedValue(COVERAGE);
    renderDialog();

    await searchFor('defect');

    await waitFor(() => expect(screen.queryByText('D — Delivery')).not.toBeInTheDocument());
    expect(screen.getByText('Q — Quality')).toBeVisible();
  });

  it('counts only what the search is showing', async () => {
    fetchAppliedMetricsMock.mockResolvedValue(COVERAGE);
    renderDialog();

    await searchFor('leakage');

    expect(await screen.findByText(/1 of 2 shown/)).not.toHaveTextContent(/applied/);
  });

  it('goes back to counting applied metrics once the search is cleared', async () => {
    fetchAppliedMetricsMock.mockResolvedValue(COVERAGE);
    renderDialog();

    const user = await searchFor('leakage');
    await screen.findByText(/1 of 2 shown/);
    await user.clear(screen.getByLabelText('Search metrics'));

    expect(await screen.findByText('1/2 applied · 1/3 overall')).toBeVisible();
  });

  it('names the failed search and says what else to try when nothing matches', async () => {
    fetchAppliedMetricsMock.mockResolvedValue(COVERAGE);
    renderDialog();

    await searchFor('velocity');

    const empty = await screen.findByText(/No metric matches/);
    expect(empty).toHaveTextContent('velocity');
    expect(screen.getByText(/Search by metric name or its formula/)).toBeVisible();
    expect(screen.queryByRole('checkbox', { name: /Defect Leakage/ })).not.toBeInTheDocument();
  });

  it('brings the full list back when the search is cleared', async () => {
    fetchAppliedMetricsMock.mockResolvedValue(COVERAGE);
    renderDialog();

    const user = await searchFor('leakage');
    await waitFor(() =>
      expect(
        screen.queryByRole('checkbox', { name: /Reopened Defect Rate/ }),
      ).not.toBeInTheDocument(),
    );
    await user.clear(screen.getByLabelText('Search metrics'));

    expect(await screen.findByRole('checkbox', { name: /Reopened Defect Rate/ })).toBeVisible();
    expect(screen.getByRole('checkbox', { name: /Sprint Goal Success Rate/ })).toBeVisible();
  });

  it('offers no metric search until a project is selected', async () => {
    fetchAppliedMetricsMock.mockResolvedValue(COVERAGE);
    renderDialog([project(PROJECT_ID, 'Globex Subscriber Insights')], null);

    expect(await screen.findByText('No project selected')).toBeVisible();
    expect(screen.queryByLabelText('Search metrics')).not.toBeInTheDocument();
  });
});

describe('KpiConfigureDialog — applied roll-up', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setAppliedMetricsMock.mockReset();
    fetchAppliedMetricsMock.mockReset();
  });

  it('carries the whole-library figure alongside each pillar count', async () => {
    fetchAppliedMetricsMock.mockResolvedValue([
      { metric_id: METRIC_ID, applied_count: 1, entered_count: 0, would_empty_count: 0 },
      { metric_id: OTHER_METRIC_ID, applied_count: 0, entered_count: 0, would_empty_count: 0 },
      { metric_id: DELIVERY_METRIC_ID, applied_count: 1, entered_count: 0, would_empty_count: 0 },
    ]);
    renderDialog();

    expect(await screen.findByText('1/2 applied · 2/3 overall')).toBeVisible();
    expect(screen.getByText('1/1 applied · 2/3 overall')).toBeVisible();
  });

  it('counts a metric only where every selected project has it', async () => {
    fetchAppliedMetricsMock.mockResolvedValue([
      { metric_id: METRIC_ID, applied_count: 2, entered_count: 0, would_empty_count: 0 },
      { metric_id: OTHER_METRIC_ID, applied_count: 1, entered_count: 0, would_empty_count: 0 },
      { metric_id: DELIVERY_METRIC_ID, applied_count: 0, entered_count: 0, would_empty_count: 0 },
    ]);
    const user = userEvent.setup();
    renderDialog([
      project(PROJECT_ID, 'Globex Subscriber Insights'),
      project(PROJECT_B_ID, 'Initech Data Platform'),
    ]);

    await user.click(await screen.findByRole('checkbox', { name: 'Initech Data Platform' }));

    expect(await screen.findByText('1/2 applied to all · 1/3 overall')).toBeVisible();
  });

  it('says nothing about coverage until it is known', async () => {
    fetchAppliedMetricsMock.mockReturnValue(new Promise(() => {}));
    renderDialog();

    expect(await screen.findByText('1 project')).toBeVisible();
    expect(screen.queryByText(/overall/)).not.toBeInTheDocument();
  });
});

describe('KpiConfigureDialog — initial project', () => {
  afterEach(() => {
    setAppliedMetricsMock.mockReset();
    fetchAppliedMetricsMock.mockReset();
  });

  it('starts empty when the initial project is not one the user manages', async () => {
    fetchAppliedMetricsMock.mockResolvedValue([]);
    renderDialog([project(PROJECT_ID, 'Globex Subscriber Insights')], PROJECT_B_ID);

    expect(await screen.findByText('No project selected')).toBeVisible();
    expect(screen.getByText('0/1')).toBeVisible();
    expect(fetchAppliedMetricsMock).not.toHaveBeenCalled();
  });

  it('selects the initial project when the user does manage it', async () => {
    fetchAppliedMetricsMock.mockResolvedValue([]);
    renderDialog([project(PROJECT_ID, 'Globex Subscriber Insights')], PROJECT_ID);

    await waitFor(() =>
      expect(fetchAppliedMetricsMock).toHaveBeenCalledWith([PROJECT_ID], {
        iso_year: 2026,
        iso_week: 32,
      }),
    );
    expect(screen.getByText('1/1')).toBeVisible();
  });
});

describe('KpiConfigureDialog — no project to configure', () => {
  afterEach(() => {
    setAppliedMetricsMock.mockReset();
    fetchAppliedMetricsMock.mockReset();
  });

  it('explains an empty project list instead of blaming the search box', async () => {
    fetchAppliedMetricsMock.mockResolvedValue([]);
    renderDialog([], null);

    expect(await screen.findByText('No project you manage in this view')).toBeVisible();
    expect(screen.queryByText(/No project matches/)).not.toBeInTheDocument();
  });
});

describe('KpiConfigureDialog — Select all with a project filter', () => {
  const bothProjects = [
    project(PROJECT_ID, 'Globex Subscriber Insights'),
    project(PROJECT_B_ID, 'Nordic Mobile Checkout'),
  ];

  afterEach(() => {
    setAppliedMetricsMock.mockReset();
    fetchAppliedMetricsMock.mockReset();
  });

  const lastSelection = () => fetchAppliedMetricsMock.mock.calls.at(-1)?.[0] as string[];

  async function filterTo(query: string, hiddenName: string) {
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('Search projects…'), query);
    await waitFor(() => expect(screen.queryByLabelText(hiddenName)).not.toBeInTheDocument());
    return user;
  }

  it('selects only the projects the filter is showing', async () => {
    fetchAppliedMetricsMock.mockResolvedValue([]);
    renderDialog(bothProjects, null);

    const user = await filterTo('Nordic', 'Globex Subscriber Insights');
    await user.click(screen.getByLabelText('Select all'));

    await waitFor(() => expect(fetchAppliedMetricsMock).toHaveBeenCalled());
    expect(lastSelection()).toEqual([PROJECT_B_ID]);
  });

  it('clears only the filtered projects, keeping a selection the filter hides', async () => {
    fetchAppliedMetricsMock.mockResolvedValue([]);
    renderDialog(bothProjects, null);
    const user = userEvent.setup();

    await user.click(screen.getByLabelText('Select all'));
    await waitFor(() => expect(lastSelection()).toHaveLength(2));

    await filterTo('Nordic', 'Globex Subscriber Insights');
    await user.click(screen.getByLabelText('Select all'));

    await waitFor(() => expect(lastSelection()).toEqual([PROJECT_ID]));
  });
});
