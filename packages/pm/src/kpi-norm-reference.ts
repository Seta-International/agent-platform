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
        yellow_label: 'Variance 11–25%',
        red_label: '> 25% or 3 consecutive sprint declines',
        insight: 'Red = instability, turnover, methodology failure.',
      },
      {
        name: 'Velocity Variance',
        formula_label: 'StdDev(last 5 sprints) / Avg',
        green_label: '≤ 15%',
        yellow_label: '16–25%',
        red_label: '> 25%',
        insight: 'Red = release becomes unpredictable.',
      },
      {
        name: 'Sprint Goal Success Rate',
        formula_label: 'Sprints achieved goal / Total',
        green_label: '≥ 85%',
        yellow_label: '70–84%',
        red_label: '< 70%',
        insight: 'Red = vague goal or scope creep.',
      },
      {
        name: 'Scope Change Rate (mid-sprint)',
        formula_label: 'SP changed mid-sprint / SP committed',
        green_label: '≤ 10%',
        yellow_label: '11–20%',
        red_label: '> 20%',
        insight: 'Red = sprint not protected.',
      },
      {
        name: 'Backlog Health',
        formula_label: 'Ready Stories ≥ 2 sprints / Required',
        green_label: '≥ 90%',
        yellow_label: '70–89%',
        red_label: '< 70%',
        insight: 'Red = team idle or rushed refinement.',
      },
      {
        name: 'Sprint Burndown Adherence',
        formula_label: '% sprints burndown following trend',
        green_label: '≥ 80%',
        yellow_label: '60–79%',
        red_label: '< 60%',
        insight: 'Red = "big bang" at sprint end, hidden blockers.',
      },
      {
        name: 'Refinement Coverage',
        formula_label: 'Refined SP / SP needed next 2 sprints',
        green_label: '≥ 100%',
        yellow_label: '75–99%',
        red_label: '< 75%',
        insight: 'Red = insufficient grooming, planning chaos.',
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
        green_label: '≤ 10 days',
        yellow_label: '11–20 days',
        red_label: '> 20 days',
        insight: 'Red = severe bottleneck.',
      },
      {
        name: 'Cycle Time (P85)',
        formula_label: 'P85 of (Done − In Progress)',
        green_label: '≤ 5 days',
        yellow_label: '6–10 days',
        red_label: '> 10 days',
        insight: 'Red = tasks too large or heavy rework.',
      },
      {
        name: 'Throughput Stability',
        formula_label: 'StdDev(items/week) / Mean',
        green_label: '≤ 20%',
        yellow_label: '21–35%',
        red_label: '> 35%',
        insight: 'Red = cannot forecast.',
      },
      {
        name: 'WIP Adherence',
        formula_label: 'Actual WIP / WIP Limit',
        green_label: '≤ 100%',
        yellow_label: '101–120%',
        red_label: '> 120%',
        insight: 'Exceeding WIP limit → Lead Time blows up.',
      },
      {
        name: 'Flow Efficiency',
        formula_label: 'Active Time / Lead Time',
        green_label: '≥ 40%',
        yellow_label: '25–39%',
        red_label: '< 25%',
        insight: 'Red = most time spent waiting.',
      },
      {
        name: 'Blocked Time Ratio',
        formula_label: 'Σ Blocked / Σ Lead Time',
        green_label: '≤ 10%',
        yellow_label: '11–20%',
        red_label: '> 20%',
        insight: 'Red = escalation framework needed.',
      },
      {
        name: 'Aging WIP',
        formula_label: 'Max age in-flight / Target Cycle Time',
        green_label: '≤ 1.5×',
        yellow_label: '1.5×–2.5×',
        red_label: '> 2.5×',
        insight: 'Red = zombie tasks, triage needed.',
      },
      {
        name: 'Service Class Mix',
        formula_label: '% items per class vs policy',
        green_label: 'Within ±10%',
        yellow_label: '11–20% drift',
        red_label: '> 20% drift',
        insight: 'Red = Expedite overused, SLA missed.',
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
        insight: 'Red = exit criteria are a formality, rework between phases.',
      },
      {
        name: 'Requirement Stability Index',
        formula_label: '1 − (Approved CRs / Total Requirements)',
        green_label: '≥ 90%',
        yellow_label: '75–89%',
        red_label: '< 75%',
        insight: 'Red = consider changing methodology.',
      },
      {
        name: 'Deliverable Acceptance Rate',
        formula_label: 'Accepted first-pass / Total',
        green_label: '≥ 90%',
        yellow_label: '75–89%',
        red_label: '< 75%',
        insight: 'Red = UAT will burn, contract risk.',
      },
      {
        name: 'Baseline Adherence',
        formula_label: '# Re-baselines per Phase',
        green_label: '0',
        yellow_label: '1',
        red_label: '≥ 2',
        insight: 'Red = fundamentally wrong plan, loss of control.',
      },
      {
        name: 'WBS Coverage',
        formula_label: 'Work in WBS / Total delivered',
        green_label: '≥ 95%',
        yellow_label: '85–94%',
        red_label: '< 85%',
        insight: 'Outside WBS = not estimated, not paid.',
      },
      {
        name: 'EVM Cost Performance (CPI)',
        formula_label: 'EV / AC',
        green_label: '0.95–1.05',
        yellow_label: '0.85–0.94',
        red_label: '< 0.85',
        insight: 'Cost efficiency per phase — complements Margin.',
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
        green_label: '≤ 6 weeks',
        yellow_label: '7–10 weeks',
        red_label: '> 10 weeks',
        insight: 'Feature-level, distinct from Time-to-Market (release-level).',
      },
      {
        name: 'Cross-team Dependency Lead Time',
        formula_label: 'Avg time resolve inter-team dependency',
        green_label: '≤ 3 days',
        yellow_label: '4–7 days',
        red_label: '> 7 days',
        insight: 'Red = silos or priority conflict.',
      },
      {
        name: 'Agile Ceremony Health',
        formula_label: 'Ceremonies with quorum & outcome / Total',
        green_label: '≥ 90%',
        yellow_label: '75–89%',
        red_label: '< 75%',
        insight: 'Red = ceremonies done for show.',
      },
      {
        name: 'PI / Release Plan Commitment',
        formula_label: 'Objectives achieved / Committed',
        green_label: '≥ 80%',
        yellow_label: '60–79%',
        red_label: '< 60%',
        insight: 'Red = overambitious plan or wrong business case.',
      },
      {
        name: 'ART Sync Attendance',
        formula_label: 'Attending Scrum-of-Scrums / Required',
        green_label: '≥ 90%',
        yellow_label: '75–89%',
        red_label: '< 75%',
        insight: 'Broken sync → missed dependencies.',
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
    insight: 'EXECUTION — technical discipline; distinct from THI (investment).',
  },
  {
    name: 'TDI (Technical Debt Index)',
    formula_label: 'Tech Debt Effort / Dev Capacity',
    green_label: '≤ 10%',
    yellow_label: '11–20%',
    red_label: '> 20%',
    insight: 'OUTSTANDING — Red = dev time consumed by debt.',
  },
];

/** The 2×2 (EQI × TDI) quadrant read-out under the Executive table, danger quadrant first. */
export const KPI_EXECUTIVE_MATRIX_WARNING = {
  headline: 'EQI Low + TDI Low — “Fake Healthy System”',
  body: 'looks clean because debt has not accrued yet, but without discipline the debt will explode within 1–2 quarters.',
  other_quadrants:
    'EQI High + TDI High = Legacy Burden (needs a debt-down quarter) · EQI Low + TDI High = System Failure (stop new features, restructure now).',
} as const;
