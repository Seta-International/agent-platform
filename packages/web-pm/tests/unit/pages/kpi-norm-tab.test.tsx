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
      is_live_capable: true,
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
    const qualitySection = screen.getByText('Q — Quality').closest('section') as HTMLElement;
    expect(within(qualitySection).getByText('No metrics in this area yet.')).toBeInTheDocument();
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
        is_live_capable: false,
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
