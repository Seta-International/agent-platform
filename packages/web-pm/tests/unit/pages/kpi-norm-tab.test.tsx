import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { KpiNormDoc } from '../../../src/api/pm-client.ts';
import { KpiNormTab } from '../../../src/pages/kpi-norm-tab.tsx';

const norm: KpiNormDoc = {
  norm_id: 'n1',
  code: 'SETA-08-SOP-001',
  revision: 'v2.0',
  effective_date: null,
  metrics: [
    {
      metric_id: 'm1',
      category: 'quality',
      tier: 'core',
      name: 'Defect Leakage',
      formula_label: 'Production Defects / Total Defects',
      component_count: 2,
      component_1_label: 'Production defects',
      component_2_label: 'Total defects',
      green_band: { op: 'lte', value: 0.05 },
      yellow_band: { op: 'between', min: 0.06, max: 0.1 },
      red_band: { op: 'gt', value: 0.1 },
      insight: 'Độ kín của quality gate.',
      sort_order: 1,
    },
  ],
};

function renderTab() {
  return render(<KpiNormTab norm={norm} isLoading={false} />);
}

describe('KpiNormTab — Methodology lens & Executive reference sections', () => {
  it('renders the Methodology lens card with its four methodology groups', () => {
    renderTab();
    expect(screen.getByText('Methodology lens')).toBeInTheDocument();
    expect(
      screen.getByText(/supplementary lens per methodology — does not replace Core/),
    ).toBeInTheDocument();
    expect(screen.getByText('5.1 · Agile / Scrum')).toBeInTheDocument();
    expect(screen.getByText('5.2 · Kanban / Flow')).toBeInTheDocument();
    expect(screen.getByText('5.3 · Waterfall / Plan-driven')).toBeInTheDocument();
    expect(screen.getByText('5.4 · Hybrid / Scaled (SAFe, Scrum-ban)')).toBeInTheDocument();
    // One representative row per group, with its prose bands intact.
    expect(screen.getByText('Velocity')).toBeInTheDocument();
    expect(screen.getByText('Stable (trend ±10%)')).toBeInTheDocument();
    expect(screen.getByText('Aging WIP')).toBeInTheDocument();
    expect(screen.getByText('EVM Cost Performance (CPI)')).toBeInTheDocument();
    expect(screen.getByText('ART Sync Attendance')).toBeInTheDocument();
  });

  it('renders the Executive card with EQI/TDI and the Fake Healthy System warning', () => {
    renderTab();
    expect(screen.getByText('Executive — Engineering Health')).toBeInTheDocument();
    expect(screen.getByText(/quarterly · EQI \/ TDI → Executive Matrix 2×2/)).toBeInTheDocument();
    expect(screen.getByText('EQI (Engineering Quality Index)')).toBeInTheDocument();
    expect(screen.getByText('TDI (Technical Debt Index)')).toBeInTheDocument();
    expect(screen.getByText(/Fake Healthy System/)).toBeInTheDocument();
    expect(screen.getByText(/Legacy Burden/)).toBeInTheDocument();
  });

  it('search filters reference rows and hides emptied groups and cards', async () => {
    const user = userEvent.setup();
    renderTab();
    await user.type(screen.getByPlaceholderText('Search metrics…'), 'velocity');
    // Scrum group survives with its two Velocity rows; the other groups disappear.
    expect(screen.getByText('Velocity')).toBeInTheDocument();
    expect(screen.getByText('Velocity Variance')).toBeInTheDocument();
    expect(screen.queryByText('5.2 · Kanban / Flow')).not.toBeInTheDocument();
    // Executive card has no match at all — the whole card hides.
    expect(screen.queryByText('Executive — Engineering Health')).not.toBeInTheDocument();
    expect(screen.queryByText('Defect Leakage')).not.toBeInTheDocument();
    // FUT-946: a QCDP area emptied by search collapses to its header — no big empty block
    // to scroll past, and no "No metrics in this area yet." (that copy would wrongly imply
    // the area has no metrics configured at all, when it's just filtered by the search).
    const qualitySection = screen.getByText('Q — Quality').closest('section') as HTMLElement;
    expect(within(qualitySection).getByText('0 metrics · 25% of OHS')).toBeInTheDocument();
    expect(
      within(qualitySection).queryByText('No metrics in this area yet.'),
    ).not.toBeInTheDocument();
  });
});

describe('KpiNormTab — metric library (FUT-797)', () => {
  const richNorm: KpiNormDoc = {
    ...norm,
    metrics: [
      ...norm.metrics,
      {
        metric_id: 'm2',
        category: 'delivery',
        tier: 'extended',
        name: 'Lead Time for Changes',
        formula_label: 'Commit → Production',
        component_count: 1,
        component_1_label: 'Commit → production (days)',
        component_2_label: null,
        green_band: { op: 'lt', value: 1 },
        yellow_band: { op: 'between', min: 1, max: 7 },
        red_band: { op: 'gt', value: 7 },
        insight: 'DORA #2 — pipeline agility.',
        sort_order: 30,
      },
    ],
  };

  function renderRichTab() {
    return render(<KpiNormTab norm={richNorm} isLoading={false} />);
  }

  it("shows a metric count alongside each area's OHS weight (AC2)", () => {
    renderRichTab();
    const qualitySection = screen.getByText('Q — Quality').closest('section') as HTMLElement;
    expect(within(qualitySection).getByText('1 metric · 25% of OHS')).toBeInTheDocument();
    const deliverySection = screen.getByText('D — Delivery').closest('section') as HTMLElement;
    expect(within(deliverySection).getByText('1 metric · 25% of OHS')).toBeInTheDocument();
  });

  it('shows "No metrics in this area yet." for a genuinely empty area (AC2)', () => {
    renderRichTab();
    const costSection = screen.getByText('C — Cost & Capacity').closest('section') as HTMLElement;
    expect(within(costSection).getByText('0 metrics · 35% of OHS')).toBeInTheDocument();
    expect(within(costSection).getByText('No metrics in this area yet.')).toBeInTheDocument();
  });

  it("shows each metric's formula alongside its name (AC3)", () => {
    renderRichTab();
    expect(screen.getByText('Production Defects / Total Defects')).toBeInTheDocument();
    expect(screen.getByText('Commit → Production')).toBeInTheDocument();
  });
});

describe('KpiNormTab — collapse empty QCDP areas on search (FUT-946)', () => {
  const qcdpNorm: KpiNormDoc = {
    norm_id: 'n2',
    code: 'SETA-08-SOP-001',
    revision: 'v2.0',
    effective_date: null,
    metrics: [
      {
        metric_id: 'q1',
        category: 'quality',
        tier: 'core',
        name: 'Defect Leakage',
        formula_label: 'Production Defects / Total Defects',
        component_count: 2,
        component_1_label: 'Production defects',
        component_2_label: 'Total defects',
        green_band: { op: 'lte', value: 0.05 },
        yellow_band: { op: 'between', min: 0.06, max: 0.1 },
        red_band: { op: 'gt', value: 0.1 },
        insight: 'x',
        sort_order: 1,
      },
      {
        metric_id: 'c1',
        category: 'cost_capacity',
        tier: 'core',
        name: 'Margin',
        formula_label: 'Revenue - Cost',
        component_count: 2,
        component_1_label: 'Revenue',
        component_2_label: 'Cost',
        green_band: { op: 'gte', value: 0.2 },
        yellow_band: { op: 'between', min: 0.1, max: 0.2 },
        red_band: { op: 'lt', value: 0.1 },
        insight: 'x',
        sort_order: 2,
      },
      {
        metric_id: 'd1',
        category: 'delivery',
        tier: 'core',
        name: 'On-time Delivery',
        formula_label: 'On-time / Total',
        component_count: 2,
        component_1_label: 'On-time',
        component_2_label: 'Total',
        green_band: { op: 'gte', value: 0.9 },
        yellow_band: { op: 'between', min: 0.75, max: 0.9 },
        red_band: { op: 'lt', value: 0.75 },
        insight: 'x',
        sort_order: 3,
      },
      {
        metric_id: 'p1',
        category: 'process',
        tier: 'core',
        name: 'PCV (Process Compliance)',
        formula_label: 'Compliant / Total',
        component_count: 2,
        component_1_label: 'Compliant',
        component_2_label: 'Total',
        green_band: { op: 'gte', value: 0.9 },
        yellow_band: { op: 'between', min: 0.75, max: 0.89 },
        red_band: { op: 'lt', value: 0.75 },
        insight: 'x',
        sort_order: 4,
      },
    ],
  };

  it('collapses non-matching QCDP areas to their header — no empty block to scroll past', async () => {
    const user = userEvent.setup();
    render(<KpiNormTab norm={qcdpNorm} isLoading={false} />);
    await user.type(screen.getByPlaceholderText('Search metrics…'), 'process');

    expect(screen.getByText('PCV (Process Compliance)')).toBeInTheDocument();
    // Header stays (so the fixed Q/C/D/P structure is always visible), but neither the
    // "No metrics..." illustration nor the metric table renders underneath it.
    const zeroMetricsText: Record<string, string> = {
      'Q — Quality': '0 metrics · 25% of OHS',
      'C — Cost & Capacity': '0 metrics · 35% of OHS',
      'D — Delivery': '0 metrics · 25% of OHS',
    };
    for (const [label, countText] of Object.entries(zeroMetricsText)) {
      const section = screen.getByText(label).closest('section') as HTMLElement;
      expect(within(section).getByText(countText)).toBeInTheDocument();
      expect(within(section).queryByText('No metrics in this area yet.')).not.toBeInTheDocument();
      expect(within(section).queryByText('Metric')).not.toBeInTheDocument();
    }
    const processSection = screen.getByText('P — Process').closest('section') as HTMLElement;
    expect(within(processSection).getByText('Metric')).toBeInTheDocument();
    expect(screen.queryByText('No metrics in this area yet.')).not.toBeInTheDocument();
  });
});
