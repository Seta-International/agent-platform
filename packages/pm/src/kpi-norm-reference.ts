/**
 * KPI Norm reference sections — Methodology lens (§5) and Executive — Engineering Health —
 * transcribed verbatim from the design mockup (docs/weekly.html, KPI Norm screen; SOP
 * SETA-08-SOP-001 v2.0). These are documentation, not measurable config: their thresholds are
 * prose ("Stable (trend ±10%)", "0", "≤ 1.5×"), not `BandCondition`s, so they deliberately do
 * NOT live in `kpi_norm_metric` and never feed OHS, Configure, or the Explorer. The web Norm
 * tab renders them read-only via the `/contracts` subpath.
 */

export interface KpiReferenceMetric {
  name: string;
  formula_label: string;
  green_label: string;
  yellow_label: string;
  red_label: string;
  insight: string;
}

export interface KpiMethodologyLensGroup {
  id: '5.1' | '5.2' | '5.3' | '5.4';
  label: string;
  metrics: readonly KpiReferenceMetric[];
}

export const KPI_METHODOLOGY_LENS: readonly KpiMethodologyLensGroup[] = [
  {
    id: '5.1',
    label: 'Agile / Scrum',
    metrics: [
      {
        name: 'Velocity',
        formula_label: 'Σ Story Points completed / Sprint',
        green_label: 'Stable (trend ±10%)',
        yellow_label: 'Biến động 11–25%',
        red_label: '> 25% hoặc giảm 3 sprint liên tiếp',
        insight: 'Red = instability, turnover, methodology failure.',
      },
      {
        name: 'Velocity Variance',
        formula_label: 'StdDev(last 5 sprints) / Avg',
        green_label: '≤ 15%',
        yellow_label: '16–25%',
        red_label: '> 25%',
        insight: 'Red = không thể dự đoán release.',
      },
      {
        name: 'Sprint Goal Success Rate',
        formula_label: 'Sprints achieved goal / Total',
        green_label: '≥ 85%',
        yellow_label: '70–84%',
        red_label: '< 70%',
        insight: 'Red = goal mơ hồ hoặc scope creep.',
      },
      {
        name: 'Scope Change Rate (mid-sprint)',
        formula_label: 'SP changed mid-sprint / SP committed',
        green_label: '≤ 10%',
        yellow_label: '11–20%',
        red_label: '> 20%',
        insight: 'Red = không bảo vệ được sprint.',
      },
      {
        name: 'Backlog Health',
        formula_label: 'Ready Stories ≥ 2 sprints / Required',
        green_label: '≥ 90%',
        yellow_label: '70–89%',
        red_label: '< 70%',
        insight: 'Red = team idle hoặc rush refinement.',
      },
      {
        name: 'Sprint Burndown Adherence',
        formula_label: '% sprints burndown bám trend',
        green_label: '≥ 80%',
        yellow_label: '60–79%',
        red_label: '< 60%',
        insight: 'Red = “big bang” cuối sprint, hidden block.',
      },
      {
        name: 'Refinement Coverage',
        formula_label: 'Refined SP / SP needed next 2 sprints',
        green_label: '≥ 100%',
        yellow_label: '75–99%',
        red_label: '< 75%',
        insight: 'Red = không kịp groom, planning chaos.',
      },
    ],
  },
  {
    id: '5.2',
    label: 'Kanban / Flow',
    metrics: [
      {
        name: 'Lead Time (P85)',
        formula_label: 'P85 of (Done − Request), days',
        green_label: '≤ 10 ngày',
        yellow_label: '11–20 ngày',
        red_label: '> 20 ngày',
        insight: 'Red = bottleneck nghiêm trọng.',
      },
      {
        name: 'Cycle Time (P85)',
        formula_label: 'P85 of (Done − In Progress)',
        green_label: '≤ 5 ngày',
        yellow_label: '6–10 ngày',
        red_label: '> 10 ngày',
        insight: 'Red = task quá lớn hoặc rework nhiều.',
      },
      {
        name: 'Throughput Stability',
        formula_label: 'StdDev(items/week) / Mean',
        green_label: '≤ 20%',
        yellow_label: '21–35%',
        red_label: '> 35%',
        insight: 'Red = không forecast được.',
      },
      {
        name: 'WIP Adherence',
        formula_label: 'Actual WIP / WIP Limit',
        green_label: '≤ 100%',
        yellow_label: '101–120%',
        red_label: '> 120%',
        insight: 'Vượt WIP limit → Lead Time blow up.',
      },
      {
        name: 'Flow Efficiency',
        formula_label: 'Active Time / Lead Time',
        green_label: '≥ 40%',
        yellow_label: '25–39%',
        red_label: '< 25%',
        insight: 'Red = phần lớn thời gian là chờ.',
      },
      {
        name: 'Blocked Time Ratio',
        formula_label: 'Σ Blocked / Σ Lead Time',
        green_label: '≤ 10%',
        yellow_label: '11–20%',
        red_label: '> 20%',
        insight: 'Red = cần escalation framework.',
      },
      {
        name: 'Aging WIP',
        formula_label: 'Max age in-flight / Target Cycle Time',
        green_label: '≤ 1.5×',
        yellow_label: '1.5×–2.5×',
        red_label: '> 2.5×',
        insight: 'Red = zombie tasks, cần triage.',
      },
      {
        name: 'Service Class Mix',
        formula_label: '% items per class vs policy',
        green_label: 'Within ±10%',
        yellow_label: '11–20% drift',
        red_label: '> 20% drift',
        insight: 'Red = Expedite bị lạm dụng, mất SLA.',
      },
    ],
  },
  {
    id: '5.3',
    label: 'Waterfall / Plan-driven',
    metrics: [
      {
        name: 'Phase Gate Pass Rate',
        formula_label: 'Gates pass first-try / Total',
        green_label: '≥ 95%',
        yellow_label: '85–94%',
        red_label: '< 85%',
        insight: 'Red = exit criteria hình thức, rework giữa pha.',
      },
      {
        name: 'Requirement Stability Index',
        formula_label: '1 − (Approved CRs / Total Requirements)',
        green_label: '≥ 90%',
        yellow_label: '75–89%',
        red_label: '< 75%',
        insight: 'Red = nên cân nhắc đổi methodology.',
      },
      {
        name: 'Deliverable Acceptance Rate',
        formula_label: 'Accepted first-pass / Total',
        green_label: '≥ 90%',
        yellow_label: '75–89%',
        red_label: '< 75%',
        insight: 'Red = UAT sẽ cháy, risk hợp đồng.',
      },
      {
        name: 'Baseline Adherence',
        formula_label: '# Re-baselines per Phase',
        green_label: '0',
        yellow_label: '1',
        red_label: '≥ 2',
        insight: 'Red = plan sai cơ bản, mất control.',
      },
      {
        name: 'WBS Coverage',
        formula_label: 'Work in WBS / Total delivered',
        green_label: '≥ 95%',
        yellow_label: '85–94%',
        red_label: '< 85%',
        insight: 'Ngoài WBS = không estimate, không paid.',
      },
      {
        name: 'EVM Cost Performance (CPI)',
        formula_label: 'EV / AC',
        green_label: '0.95–1.05',
        yellow_label: '0.85–0.94',
        red_label: '< 0.85',
        insight: 'Cost efficiency theo phase — bổ sung cho Margin.',
      },
    ],
  },
  {
    id: '5.4',
    label: 'Hybrid / Scaled (SAFe, Scrum-ban)',
    metrics: [
      {
        name: 'Feature Cycle Time',
        formula_label: 'Feature Discovery → Production',
        green_label: '≤ 6 tuần',
        yellow_label: '7–10 tuần',
        red_label: '> 10 tuần',
        insight: 'Feature-level, khác Time-to-Market (release-level).',
      },
      {
        name: 'Cross-team Dependency Lead Time',
        formula_label: 'Avg time resolve inter-team dependency',
        green_label: '≤ 3 ngày',
        yellow_label: '4–7 ngày',
        red_label: '> 7 ngày',
        insight: 'Red = silo hoặc priority conflict.',
      },
      {
        name: 'Agile Ceremony Health',
        formula_label: 'Ceremonies with quorum & outcome / Total',
        green_label: '≥ 90%',
        yellow_label: '75–89%',
        red_label: '< 75%',
        insight: 'Red = ceremony làm cho có.',
      },
      {
        name: 'PI / Release Plan Commitment',
        formula_label: 'Objectives achieved / Committed',
        green_label: '≥ 80%',
        yellow_label: '60–79%',
        red_label: '< 60%',
        insight: 'Red = plan quá tham hoặc business case sai.',
      },
      {
        name: 'ART Sync Attendance',
        formula_label: 'Attending Scrum-of-Scrums / Required',
        green_label: '≥ 90%',
        yellow_label: '75–89%',
        red_label: '< 75%',
        insight: 'Sync gãy → dependency miss.',
      },
      {
        name: 'Cross-functional Dependency Closure',
        formula_label: 'Closed within PI / Raised in PI',
        green_label: '≥ 85%',
        yellow_label: '70–84%',
        red_label: '< 70%',
        insight: 'Red = dependency rollover, debt scaling.',
      },
    ],
  },
];

export const KPI_EXECUTIVE_METRICS: readonly KpiReferenceMetric[] = [
  {
    name: 'EQI (Engineering Quality Index)',
    formula_label: 'Practice items met / Required',
    green_label: '≥ 90%',
    yellow_label: '75–89%',
    red_label: '< 75%',
    insight: 'EXECUTION — discipline kỹ thuật; khác THI (investment).',
  },
  {
    name: 'TDI (Technical Debt Index)',
    formula_label: 'Tech Debt Effort / Dev Capacity',
    green_label: '≤ 10%',
    yellow_label: '11–20%',
    red_label: '> 20%',
    insight: 'OUTSTANDING — Red = dev time bị nuốt bởi debt.',
  },
];

/** The 2×2 (EQI × TDI) quadrant read-out under the Executive table, danger quadrant first. */
export const KPI_EXECUTIVE_MATRIX_WARNING = {
  headline: 'EQI Low + TDI Low — “Fake Healthy System”',
  body: 'trông sạch vì chưa tích nợ nhưng không có discipline, nợ sẽ bùng trong 1–2 quarter.',
  other_quadrants:
    'EQI High + TDI High = Legacy Burden (cần debt-down quarter) · EQI Low + TDI High = System Failure (stop new feature, restructure ngay).',
} as const;
