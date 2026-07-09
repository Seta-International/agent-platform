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
    date_from: defaultFrom,
    planned_pct: '100',
    bucket: 'billable',
    date_to: '',
  };
}

export function bucketBadge(bucket: Bucket) {
  const variant = bucket === 'billable' ? 'success' : bucket === 'bench' ? 'warning' : 'secondary';
  const label = bucket === 'billable' ? 'Billable' : bucket === 'bench' ? 'Bench' : 'Internal';
  return (
    <Badge variant={variant} className="font-normal capitalize">
      {label}
    </Badge>
  );
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
