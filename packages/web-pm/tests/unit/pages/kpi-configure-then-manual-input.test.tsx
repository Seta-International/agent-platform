import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { KpiRecordDetail, KpiRecordMetricRow } from '../../../src/api/pm-client.ts';
import { KpiConfigureDialog } from '../../../src/pages/kpi-configure-dialog.tsx';
import { KpiManualInputDialog } from '../../../src/pages/kpi-manual-input-dialog.tsx';

const METRIC_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_METRIC_ID = '22222222-2222-4222-8222-222222222222';
const PROJECT_ID = '33333333-3333-4333-8333-333333333333';

const fetchKpiRecordMock = vi.fn();
const upsertKpiRecordMock = vi.fn();
const setAppliedMetricsMock = vi.fn();
const fetchAppliedMetricsMock = vi.fn();

vi.mock('../../../src/api/pm-client.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/api/pm-client.ts')>();
  return {
    ...actual,
    fetchKpiRecord: () => fetchKpiRecordMock(),
    upsertKpiRecord: (body: unknown) => upsertKpiRecordMock(body),
    setAppliedMetrics: (...args: unknown[]) => setAppliedMetricsMock(...args),
    fetchAppliedMetrics: (...args: unknown[]) => fetchAppliedMetricsMock(...args),
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
            category: 'cost_capacity',
            tier: 'core',
            name: 'Utilization Rate',
            formula_label: 'Worked hours / Available hours',
            component_count: 2,
            component_1_label: 'Worked hours',
            component_2_label: 'Available hours',
            component_1_integer: false,
            component_2_integer: false,
            component_1_min: 0,
            component_1_max: null,
            is_share: false,
            green_band: { op: 'between', min: 0.75, max: 0.9 },
            yellow_band: { op: 'between', min: 0.6, max: 0.74 },
            red_band: { op: 'lt', value: 0.6 },
            insight: null,
          },
        ],
      }),
  };
});

const leakage: KpiRecordMetricRow = {
  metric_id: METRIC_ID,
  category: 'quality',
  tier: 'core',
  name: 'Defect Leakage',
  formula_label: 'Production defects / Total defects',
  component_count: 2,
  component_1_label: 'Production defects',
  component_2_label: 'Total defects',
  component_1_integer: true,
  component_2_integer: true,
  component_1_min: 0,
  component_1_max: null,
  is_share: true,
  green_band: { op: 'lte', value: 0.05 },
  yellow_band: { op: 'between', min: 0.05, max: 0.1 },
  red_band: { op: 'gt', value: 0.1 },
  insight: null,
  component_1_value: 3,
  component_2_value: 40,
  computed_value: 0.075,
  status: 'yellow',
};

const utilization: KpiRecordMetricRow = {
  metric_id: OTHER_METRIC_ID,
  category: 'cost_capacity',
  tier: 'core',
  name: 'Utilization Rate',
  formula_label: 'Worked hours / Available hours',
  component_count: 2,
  component_1_label: 'Worked hours',
  component_2_label: 'Available hours',
  component_1_integer: false,
  component_2_integer: false,
  component_1_min: 0,
  component_1_max: null,
  is_share: false,
  green_band: { op: 'between', min: 0.75, max: 0.9 },
  yellow_band: { op: 'between', min: 0.6, max: 0.74 },
  red_band: { op: 'lt', value: 0.6 },
  insight: null,
  component_1_value: null,
  component_2_value: null,
  computed_value: null,
  status: null,
};

const project = {
  project_id: PROJECT_ID,
  account_id: 'acc-1',
  name: 'Globex Subscriber Insights',
  phase: 'delivery' as const,
  status: 'active' as const,
  pm_worker_id: null,
  can_manage: true,
};

const recordWith = (metrics: KpiRecordMetricRow[]): KpiRecordDetail => ({
  record_id: 'rec-1',
  project_id: PROJECT_ID,
  iso_year: 2026,
  iso_week: 32,
  version: 3,
  metrics,
  category_health: {
    quality: 'yellow',
    cost_capacity: 'green',
    delivery: 'green',
    process: 'green',
  },
  overall_health: 'yellow',
});

function renderManualInput(qc: QueryClient) {
  return render(
    <QueryClientProvider client={qc}>
      <KpiManualInputDialog
        initial={{ project_id: PROJECT_ID, iso_year: 2026, iso_week: 32 }}
        projects={[{ value: PROJECT_ID, label: 'Globex Subscriber Insights' }]}
        weeks={[{ iso_year: 2026, iso_week: 32, label: '2026-W32 (current)' }]}
        onOpenChange={() => {}}
      />
    </QueryClientProvider>,
  );
}

function renderConfigure(qc: QueryClient) {
  return render(
    <QueryClientProvider client={qc}>
      <KpiConfigureDialog
        open
        onOpenChange={() => {}}
        projects={[project]}
        initialProjectId={PROJECT_ID}
        currentWeek={{ iso_year: 2026, iso_week: 32 }}
      />
    </QueryClientProvider>,
  );
}

describe('KpiConfigureDialog removing a metric, then reopening Manual KPI Input (FUT-949)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    fetchKpiRecordMock.mockReset();
    upsertKpiRecordMock.mockReset();
    setAppliedMetricsMock.mockReset();
    fetchAppliedMetricsMock.mockReset();
  });

  it('does not show the removed metric or its stale value on the first reopen', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup();

    fetchKpiRecordMock.mockResolvedValue(recordWith([leakage, utilization]));
    const manualInput = renderManualInput(qc);
    await screen.findByRole('textbox', { name: 'Production defects' });
    manualInput.unmount();

    fetchAppliedMetricsMock.mockResolvedValue([
      { metric_id: METRIC_ID, applied_count: 1, entered_count: 1, would_empty_count: 0 },
      { metric_id: OTHER_METRIC_ID, applied_count: 1, entered_count: 0, would_empty_count: 0 },
    ]);
    setAppliedMetricsMock.mockResolvedValue({});
    const configure = renderConfigure(qc);

    const checkbox = await screen.findByRole('checkbox', { name: /Defect Leakage/ });
    await waitFor(() => expect(checkbox).toBeChecked());
    await user.click(checkbox);
    await screen.findByText(/Its 2026-W32 figures/i);
    await user.click(screen.getByRole('button', { name: 'Turn it off' }));
    await user.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() =>
      expect(setAppliedMetricsMock).toHaveBeenCalledWith(
        [{ metric_id: METRIC_ID, applied: false }],
        [PROJECT_ID],
      ),
    );
    configure.unmount();

    fetchKpiRecordMock.mockResolvedValue(recordWith([utilization]));
    renderManualInput(qc);

    expect(screen.queryByRole('textbox', { name: 'Production defects' })).not.toBeInTheDocument();
    expect(screen.queryByText('Defect Leakage')).not.toBeInTheDocument();

    expect(await screen.findByRole('textbox', { name: 'Worked hours' })).toBeInTheDocument();
  });
});
