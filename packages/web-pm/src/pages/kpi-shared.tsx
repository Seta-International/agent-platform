import type { BandCondition, KpiCategory, RagStatus } from '../api/pm-client.ts';
import { Badge, cn } from './_ui-compat.tsx';

export const KPI_CATEGORY_LABELS: Record<KpiCategory, string> = {
  quality: 'Q — Quality',
  cost_capacity: 'C — Cost & Capacity',
  delivery: 'D — Delivery',
  process: 'P — Process',
};

export const KPI_CATEGORIES: readonly KpiCategory[] = [
  'quality',
  'cost_capacity',
  'delivery',
  'process',
];

export const KPI_OHS_WEIGHTS: Record<KpiCategory, number> = {
  quality: 0.25,
  cost_capacity: 0.35,
  delivery: 0.25,
  process: 0.15,
};

/** 2-component metrics whose ratio is a density/rate, not a percentage (e.g. "defects per BMM",
 * "deploys per day") — everything else with component_count 2 is a percentage in the source
 * norm. Known simplification: this is a display-only exception list keyed by name rather than a
 * persisted per-metric flag; the underlying R/Y/G computation already uses the raw ratio
 * correctly regardless of how it's labeled here. */
const DENSITY_METRIC_NAMES = new Set([
  'Internal Defect Density',
  'Static Analysis Issue Density',
  'Deployment Frequency',
]);

/** Norm bands don't carry a display unit. Every 2-component metric in this norm is modeled as a
 * plain ratio (component_1 / component_2 — see kpi-norm-data.ts); most of those ratios are
 * stated as a percentage in the source norm (e.g. "≤ 5%" stored as 0.05), except the density/rate
 * metrics above. Every 1-component metric is a direct count/day/score value (e.g. MTTD "≤ 3
 * ngày" stored as 3), never a percentage. */
function isPercentMetric(metricName: string, component_count: 1 | 2): boolean {
  return component_count === 2 && !DENSITY_METRIC_NAMES.has(metricName);
}

/** Formats a single already-computed metric value the same way its norm band is formatted
 * (see formatBand) — so a value of 0.89 for a percentage metric reads "89%", matching the band's
 * own units, and a value of 3 for a day-count metric reads "3". */
export function formatMetricValue(
  value: number | null,
  metricName: string,
  component_count: 1 | 2,
): string {
  if (value === null) return '·';
  return isPercentMetric(metricName, component_count)
    ? `${Math.round(value * 1000) / 10}%`
    : String(Math.round(value * 100) / 100);
}

export function formatBand(
  metricName: string,
  component_count: 1 | 2,
  band: BandCondition,
): string {
  const asPercent = isPercentMetric(metricName, component_count);
  const fmtValue = (v: number): string => (asPercent ? `${Math.round(v * 1000) / 10}%` : String(v));

  const fmtOne = (c: BandCondition): string => {
    switch (c.op) {
      case 'lte':
        return `≤ ${fmtValue(c.value)}`;
      case 'lt':
        return `< ${fmtValue(c.value)}`;
      case 'gte':
        return `≥ ${fmtValue(c.value)}`;
      case 'gt':
        return `> ${fmtValue(c.value)}`;
      case 'eq':
        return fmtValue(c.value);
      case 'between':
        return `${fmtValue(c.min)}–${fmtValue(c.max)}`;
      case 'or':
        return c.conditions.map(fmtOne).join(' hoặc ');
      case 'and':
        return c.conditions.map(fmtOne).join(' và ');
    }
  };
  return fmtOne(band);
}

export function formatBandTriple(
  metricName: string,
  component_count: 1 | 2,
  green: BandCondition,
  yellow: BandCondition,
  red: BandCondition,
): { green: string; yellow: string; red: string } {
  return {
    green: formatBand(metricName, component_count, green),
    yellow: formatBand(metricName, component_count, yellow),
    red: formatBand(metricName, component_count, red),
  };
}

/** Short column headers for KPI Explorer's per-metric columns, matching the source mockup's
 * abbreviations (e.g. "Defect Leakage" → "LEAKAGE"). Display-only; falls back to the full metric
 * name for any metric not in this list (Extended metrics aren't shown in the mockup's Explorer
 * columns, only the always-applied Core ones needed this treatment). */
const SHORT_METRIC_LABEL: Record<string, string> = {
  'Defect Leakage': 'Leakage',
  'Internal Defect Density': 'Density',
  'Reopened Defect Rate': 'Reopened',
  'Defect Removal Efficiency (DRE)': 'DRE',
  'Tech Health Investment (THI)': 'THI',
  'Effort Consumption': 'Effort',
  Margin: 'Margin',
  'Billable Rate': 'Billable',
  'Utilization Rate': 'Util.',
  'Busy Rate': 'Busy',
  'eNPS / CSS': 'CSAT',
  'On-time Delivery': 'On-time',
  'Completed Effectiveness (CE)': 'CE',
  'Release Predictability': 'Predict.',
  'Schedule Performance Index (SPI)': 'SPI',
  'Forecast Accuracy': 'Forecast',
  'PCV (Process Compliance)': 'PCV',
  'Innovation Index': 'Innovation',
  'Audit Compliance Rate': 'Audit',
  'Retrospective Action Closure Rate': 'Retro',
};

export function shortMetricLabel(name: string): string {
  return SHORT_METRIC_LABEL[name] ?? name;
}

const RAG_TEXT_CLASS: Record<RagStatus, string> = {
  green: 'text-success',
  yellow: 'text-warning',
  red: 'text-error',
};

/** A per-metric Explorer cell: the formatted value colored by its RAG status, or a plain "·"
 * when the metric has no value for that project/week — matches the mockup's inline colored
 * numbers (not a Badge pill, which is reserved for the overall Health column). */
export function metricValueText(
  cell: { value: number | null; status: RagStatus | null },
  metricName: string,
  component_count: 1 | 2,
) {
  if (cell.value === null || cell.status === null) {
    return <span className="text-secondary">·</span>;
  }
  return (
    <span className={cn('font-medium', RAG_TEXT_CLASS[cell.status])}>
      {formatMetricValue(cell.value, metricName, component_count)}
    </span>
  );
}

/** KPI Explorer's "Record" column. The mockup shows a static "Live · auto" pill on every row —
 * but that's a demo artifact (see functional-analysis.md §5: "Live · auto" data-source wiring is
 * explicitly deferred, not implemented yet). Since every record in this build is entered through
 * Manual KPI input, showing the honest state here: "Manual · saved" once a record exists for
 * that project/week, or "—" before anything has been entered. */
export function recordStatusBadge(hasRecord: boolean) {
  if (!hasRecord) {
    return <span className="text-secondary">—</span>;
  }
  return (
    <Badge variant="outline" className="whitespace-nowrap font-normal">
      Manual · saved
    </Badge>
  );
}

export function ragBadge(status: RagStatus | null) {
  if (status === null) {
    return (
      <Badge variant="secondary" className="font-normal">
        —
      </Badge>
    );
  }
  const variant = status === 'green' ? 'success' : status === 'yellow' ? 'warning' : 'destructive';
  const label = status === 'green' ? 'Green' : status === 'yellow' ? 'Yellow' : 'Red';
  return (
    <Badge variant={variant} className="font-normal">
      {label}
    </Badge>
  );
}

// FUT-595 AC4: the live preview runs the EXACT functions the server settles colours with —
// imported from @seta/pm/contracts (pm's public contract subpath), not a client-side copy,
// so preview and stored colour can never disagree.
export {
  computeCategoryHealth,
  computeEntryStatus,
  computeMetricValue,
  computeOverallHealth,
} from '@seta/pm/contracts';

/** ISO 8601 week (Monday-start, week 1 = week containing the year's first Thursday). */
export function isoWeekOf(date: Date): { iso_year: number; iso_week: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const iso_week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return { iso_year: d.getUTCFullYear(), iso_week };
}

/** Week label with its lifecycle mark (FUT-589 AC4): the current week reads "· current",
 * closed weeks read "· 🔒 view-only" — the picker itself says which context is writable. */
export function isoWeekLabel(
  iso_year: number,
  iso_week: number,
  current: { iso_year: number; iso_week: number },
): string {
  const isCurrent = iso_year === current.iso_year && iso_week === current.iso_week;
  const base = `${iso_year}-W-${String(iso_week).padStart(2, '0')}`;
  return isCurrent ? `${base} · current` : `${base} · 🔒 view-only`;
}

/** Client-side mirror of the server's Epic 3 week gate: weekly data (KPI records, reports,
 * flags) is writable only for the CURRENT week, until Friday 17:00 Asia/Ho_Chi_Minh (Friday
 * 10:00 UTC). The server re-checks on every write; this only drives the view-only UI state. */
export function isReportingWeekOpen(
  iso_year: number,
  iso_week: number,
  current: { iso_year: number; iso_week: number } | undefined,
): boolean {
  if (!current || iso_year !== current.iso_year || iso_week !== current.iso_week) return false;
  const jan4 = new Date(Date.UTC(iso_year, 0, 4));
  const day = jan4.getUTCDay() || 7;
  const monday = Date.UTC(iso_year, 0, 4 - (day - 1) + (iso_week - 1) * 7);
  const fridayDeadline = monday + 4 * 86_400_000 + 10 * 3_600_000;
  return Date.now() < fridayDeadline;
}

/** Last 3 ISO weeks (current + 2 prior) — the mockup hard-limits the week picker to this range
 * (functional-analysis.md §7 câu #8). Anchors on the server-authoritative current week
 * (Asia/Ho_Chi_Minh) when provided; the browser clock is only the pre-fetch fallback. */
export function recentIsoWeeks(
  anchor?: { iso_year: number; iso_week: number } | null,
): { iso_year: number; iso_week: number; label: string }[] {
  const now = anchor ?? isoWeekOf(new Date());
  const weeks: { iso_year: number; iso_week: number }[] = [now];
  let { iso_year, iso_week } = now;
  for (let i = 0; i < 2; i++) {
    if (iso_week > 1) {
      iso_week -= 1;
    } else {
      iso_year -= 1;
      iso_week = isoWeekOf(new Date(Date.UTC(iso_year, 11, 28))).iso_week;
    }
    weeks.push({ iso_year, iso_week });
  }
  return weeks.map((w) => ({ ...w, label: isoWeekLabel(w.iso_year, w.iso_week, now) }));
}
