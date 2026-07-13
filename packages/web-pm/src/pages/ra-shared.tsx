import { Badge } from '@seta/shared-ui';
import type { ReactNode } from 'react';

export const BUCKETS = ['billable', 'internal', 'bench'] as const;
export type Bucket = (typeof BUCKETS)[number];

/** One "new allocation" row in a Reassign dialog's target-project list. */
export interface ReassignTargetRow {
  key: string;
  account_id: string;
  project_id: string;
  date_from: string;
  planned_pct: string;
  bucket: Bucket;
  date_to: string;
}

export function emptyReassignRow(defaultFrom: string): ReassignTargetRow {
  return {
    key: crypto.randomUUID(),
    account_id: '',
    project_id: '',
    // Both dates are required and default to today so the row starts in a valid state.
    date_from: defaultFrom,
    date_to: defaultFrom,
    // Stored as a 0–1 fraction in the wizard UI (see pctToFraction); '1' = full allocation.
    planned_pct: '1',
    bucket: 'billable',
  };
}

/** True for a well-formed YYYY-MM-DD calendar date (rejects empty/partial/invalid input). */
export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const t = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(t);
}

/** Two date ranges overlap (a null end = open-ended, i.e. runs forever). */
export function rangesOverlap(
  aFrom: string,
  aTo: string | null,
  bFrom: string,
  bTo: string | null,
): boolean {
  const OPEN = '9999-12-31';
  return aFrom <= (bTo ?? OPEN) && bFrom <= (aTo ?? OPEN);
}

export const TARGET_ERROR = {
  pastStart: 'Start date cannot be in the past.',
  overlap: 'Overlaps another allocation on this project.',
} as const;

interface TargetSpan {
  project_id: string;
  date_from: string;
  date_to: string;
}
interface ExistingSpan {
  project_id: string;
  date_from: string | null;
  date_to: string | null;
}

/**
 * Per-row validation for the "Add project" allocations, returning an error message (or null)
 * for each target: (1) a start date before `today` is invalid; (2) a target that shares a
 * project with another target row or an existing allocation and overlaps it in time is invalid.
 * Rows with missing/invalid dates or no project yet defer to the other required-field gating.
 */
export function targetAllocationErrors(
  targets: TargetSpan[],
  existing: ExistingSpan[],
  today: string,
): (string | null)[] {
  return targets.map((t, i) => {
    if (isValidIsoDate(t.date_from) && t.date_from < today) return TARGET_ERROR.pastStart;
    if (!t.project_id || !isValidIsoDate(t.date_from)) return null;
    const tTo = isValidIsoDate(t.date_to) ? t.date_to : null;
    const clashesExisting = existing.some(
      (e) =>
        e.project_id === t.project_id &&
        e.date_from != null &&
        rangesOverlap(t.date_from, tTo, e.date_from, e.date_to),
    );
    const clashesTarget = targets.some(
      (o, j) =>
        j !== i &&
        o.project_id === t.project_id &&
        isValidIsoDate(o.date_from) &&
        rangesOverlap(t.date_from, tTo, o.date_from, isValidIsoDate(o.date_to) ? o.date_to : null),
    );
    return clashesExisting || clashesTarget ? TARGET_ERROR.overlap : null;
  });
}

interface ExistingRow {
  id: string;
  project_id: string;
  date_from: string;
  date_to: string;
  /** Already-started rows are locked to end-date edits, so their past start isn't an error. */
  locked: boolean;
}

/**
 * Per-row validation for the existing ("update") allocation rows, keyed by allocation id:
 * an *editable* row whose edited start moved into the past is invalid, and any row overlapping
 * another row on the same project is invalid. Locked rows keep their committed past start.
 */
export function existingAllocationErrors(
  rows: ExistingRow[],
  today: string,
): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  rows.forEach((r, i) => {
    if (!r.locked && isValidIsoDate(r.date_from) && r.date_from < today) {
      out[r.id] = TARGET_ERROR.pastStart;
      return;
    }
    if (!isValidIsoDate(r.date_from)) {
      out[r.id] = null;
      return;
    }
    const rTo = isValidIsoDate(r.date_to) ? r.date_to : null;
    const clash = rows.some(
      (o, j) =>
        j !== i &&
        o.project_id === r.project_id &&
        isValidIsoDate(o.date_from) &&
        rangesOverlap(r.date_from, rTo, o.date_from, isValidIsoDate(o.date_to) ? o.date_to : null),
    );
    out[r.id] = clash ? TARGET_ERROR.overlap : null;
  });
  return out;
}

// Allocation is entered as a 0–1 fraction in 0.1 steps in the RA Monitoring wizard, but the
// backend stores and serves it as a 0–100 percentage (`planned_pct`). Convert only at the UI
// edge so the rest of the app (RA table, People utilization, over-allocation math) keeps %.
export const ALLOCATION_FRACTION_STEPS = [
  '0',
  '0.1',
  '0.2',
  '0.3',
  '0.4',
  '0.5',
  '0.6',
  '0.7',
  '0.8',
  '0.9',
  '1',
] as const;

export function pctToFraction(pct: number): string {
  return String(Math.round(pct) / 100);
}

export function fractionToPct(fraction: string): number {
  // Round to kill float drift: 0.8 * 100 === 80.00000000000001 in JS.
  return Math.round(Number(fraction) * 100);
}

export function bucketBadge(bucket: Bucket) {
  const variant = bucket === 'billable' ? 'success' : bucket === 'bench' ? 'warning' : 'neutral';
  const label = bucket === 'billable' ? 'Billable' : bucket === 'bench' ? 'Bench' : 'Internal';
  return <Badge variant={variant} className="font-normal capitalize" label={label} />;
}

export function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Two-letter initials for an avatar fallback (display only). */
export function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}

export const DISPLAY_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export function formatDisplayDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d} ${DISPLAY_MONTHS[Number(m) - 1]} ${y}`;
}

export function daysBetweenInclusive(fromIso: string, toIso: string): number {
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  return Math.round(ms / 86_400_000) + 1;
}

export type MetricTone = 'danger' | 'info' | 'warning' | 'success';

const METRIC_TONE_CLS: Record<MetricTone, string> = {
  danger: 'bg-danger-tint text-danger-ink',
  info: 'bg-info-tint text-info-ink',
  warning: 'bg-warning-tint text-warning-ink',
  success: 'bg-success-tint text-success-ink',
};

export function ImpactMetric({
  icon,
  tone,
  label,
  value,
  sub,
}: {
  icon: ReactNode;
  tone: MetricTone;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-md border border-hairline p-3">
      <span
        className={`flex size-8 shrink-0 items-center justify-center rounded-full ${METRIC_TONE_CLS[tone]}`}
      >
        {icon}
      </span>
      <div className="min-w-0 space-y-0.5">
        <div className="text-caption text-ink-muted">{label}</div>
        <div className="text-body-sm font-semibold text-ink">{value}</div>
        {sub ? <div className="text-caption text-ink-muted">{sub}</div> : null}
      </div>
    </div>
  );
}
