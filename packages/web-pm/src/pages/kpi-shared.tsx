import type { BandCondition, KpiCategory, KpiRecordColour, RagStatus } from '../api/pm-client.ts';
import { Badge, cn, StatusDot, type StatusDotVariant } from './_ui-compat.tsx';

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
        return c.conditions.map(fmtOne).join(' or ');
      case 'and':
        return c.conditions.map(fmtOne).join(' and ');
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

export function metricUnit(
  metricName: string,
  component_count: 1 | 2,
  component_1_label: string,
): string {
  if (component_count === 2) return isPercentMetric(metricName, 2) ? '%' : 'Ratio';
  const label = component_1_label.toLowerCase();
  if (label.includes('score')) return 'Score';
  if (label.includes('hour')) return 'Hours';
  if (label.includes('week')) return 'Weeks';
  if (label.includes('day')) return 'Days';
  return 'Count';
}

/** Short column headers for KPI Explorer's per-metric columns, matching the source mockup's
 * abbreviations (e.g. "Defect Leakage" → "LEAKAGE"). Display-only; falls back to the full metric
 * name for any metric not in this list (Extended metrics aren't shown in the mockup's Explorer
 * columns, only the always-applied Core ones needed this treatment). */
export const SHORT_METRIC_LABELS: Record<string, string> = {
  'Defect Leakage': 'Leakage',
  'Internal Defect Density': 'Density',
  'Reopened Defect Rate': 'Reopened',
  'Defect Removal Efficiency (DRE)': 'DRE',
  'Tech Health Investment (THI)': 'THI',
  'Effort Consumption': 'Effort',
  Margin: 'Margin',
  'Billable Rate': 'Billable',
  'Utilization Rate': 'Util',
  'Busy Rate': 'Busy',
  'eNPS / CSS': 'CSAT',
  'On-time Delivery': 'On-time',
  'Completed Effectiveness (CE)': 'CE',
  'Release Predictability': 'Predict',
  'Schedule Performance Index (SPI)': 'SPI',
  'Forecast Accuracy': 'Forecast',
  'PCV (Process Compliance)': 'PCV',
  'Innovation Index': 'Innovation',
  'Audit Compliance Rate': 'Audit',
  'Retrospective Action Closure Rate': 'Retro',
};

export function shortMetricLabel(name: string): string {
  return SHORT_METRIC_LABELS[name] ?? (name.split(' — ')[0] || name);
}

const RAG_MARK: Record<
  RagStatus,
  { text: string; weight: string; dot: StatusDotVariant | null; label: string }
> = {
  green: { text: 'text-success', weight: 'font-normal', dot: null, label: 'Green' },
  yellow: { text: 'text-warning', weight: 'font-medium', dot: 'warning', label: 'Amber' },
  red: { text: 'text-error', weight: 'font-semibold', dot: 'error', label: 'Red' },
};

export function metricValueText(
  cell: { value: number | null; status: RagStatus | null; band: BandCondition | null },
  metricName: string,
  component_count: 1 | 2,
) {
  if (cell.value === null || cell.status === null) {
    return (
      <span className="text-secondary" title="No figures entered for this week">
        ·
      </span>
    );
  }
  const band = cell.band ? formatBand(metricName, component_count, cell.band) : null;
  const mark = RAG_MARK[cell.status];
  return (
    <span
      className={cn('inline-flex items-center justify-end gap-1.5', mark.text, mark.weight)}
      title={
        band ? `${metricName}: ${mark.label} — matched ${band}` : `${metricName}: ${mark.label}`
      }
    >
      {mark.dot ? <StatusDot variant={mark.dot} label={mark.label} /> : null}
      {formatMetricValue(cell.value, metricName, component_count)}
    </span>
  );
}

export function kpiResultValue(
  value: number | null,
  status: RagStatus | null,
  metricName: string,
  component_count: 1 | 2,
) {
  if (value === null) return null;
  return (
    <span
      className={cn(
        'shrink-0 text-sm font-medium tabular-nums',
        status === null ? 'text-secondary' : RAG_MARK[status].text,
      )}
      title={`${metricName} — computed from the figures above`}
    >
      {formatMetricValue(value, metricName, component_count)}
    </span>
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
  const label = status === 'green' ? 'Green' : status === 'yellow' ? 'Amber' : 'Red';
  return (
    <Badge variant={variant} className="font-normal">
      {label}
    </Badge>
  );
}

export function kpiColourBadge(colour: KpiRecordColour | null) {
  return ragBadge(colour === 'gray' ? null : colour);
}

// FUT-595 AC4: the live preview runs the EXACT functions the server settles colours with —
// imported from @seta/pm/contracts (pm's public contract subpath), not a client-side copy,
// so preview and stored colour can never disagree.
export {
  computeCategoryHealth,
  computeEntryStatus,
  computeOverallHealth,
  computeRecordCategoryColour,
  computeRecordOverallColour,
  computeScoredValue,
  hasKpiEntryIssue,
  incompleteRecordMetrics,
  kpiComponentIssue,
  kpiValuePrecision,
  validateKpiEntry,
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

/** Week label with its lifecycle mark (FUT-589 AC4): only the current week is marked —
 * closed weeks stay bare; the warning banner in the entry dialog already says view-only. */
export function isoWeekBase(iso_year: number, iso_week: number): string {
  return `${iso_year}-W${String(iso_week).padStart(2, '0')}`;
}

export function isoWeekLabel(
  iso_year: number,
  iso_week: number,
  current: { iso_year: number; iso_week: number },
): string {
  const isCurrent = iso_year === current.iso_year && iso_week === current.iso_week;
  const base = isoWeekBase(iso_year, iso_week);
  return isCurrent ? `${base} (current)` : base;
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

export const RECENT_WEEK_COUNT = 5;

export function recentIsoWeeks(
  anchor?: { iso_year: number; iso_week: number } | null,
): { iso_year: number; iso_week: number; label: string }[] {
  const now = anchor ?? isoWeekOf(new Date());
  const weeks: { iso_year: number; iso_week: number }[] = [now];
  let { iso_year, iso_week } = now;
  for (let i = 0; i < RECENT_WEEK_COUNT - 1; i++) {
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
