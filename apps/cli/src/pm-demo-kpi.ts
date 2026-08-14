/**
 * Shared fixture helpers for the dev-only PM seeders (`dev-seed-pm-metrics.ts`,
 * `dev-seed-pm-volume.ts`): ISO-week arithmetic plus RAG-consistent metric values built with the
 * REAL @seta/pm/contracts functions, so a seeded value and its stored status can never disagree
 * with what the app would compute.
 */
import {
  type BandCondition,
  computeEntryStatus,
  computeScoredValue,
  kpiValuePrecision,
  type RagStatus,
} from '@seta/pm/contracts';

export type KpiCategory = 'quality' | 'cost_capacity' | 'delivery' | 'process';

export const CATEGORIES: readonly KpiCategory[] = [
  'quality',
  'cost_capacity',
  'delivery',
  'process',
];

export interface CatalogMetric {
  id: string;
  category: KpiCategory;
  component_count: 1 | 2;
  green_band: BandCondition;
  yellow_band: BandCondition;
  red_band: BandCondition;
}

export function isoWeeksInYear(year: number): number {
  const d = new Date(Date.UTC(year, 11, 28));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

export function previousIsoWeeks(
  iso_year: number,
  iso_week: number,
  count: number,
): { iso_year: number; iso_week: number }[] {
  const weeks = [{ iso_year, iso_week }];
  let y = iso_year;
  let w = iso_week;
  while (weeks.length < count) {
    if (w > 1) w -= 1;
    else {
      y -= 1;
      w = isoWeeksInYear(y);
    }
    weeks.push({ iso_year: y, iso_week: w });
  }
  return weeks;
}

export const RANK: Record<RagStatus, number> = { green: 0, yellow: 1, red: 2 };
export const BY_RANK: RagStatus[] = ['green', 'yellow', 'red'];

export const shift = (s: RagStatus, n: number): RagStatus =>
  BY_RANK[Math.max(0, Math.min(2, RANK[s] + n))]!;

export const worst = (xs: RagStatus[]): RagStatus =>
  xs.reduce((w, s) => (RANK[s] > RANK[w] ? s : w), 'green' as RagStatus);

export const round4 = (x: number): number => Math.round(x * 10_000) / 10_000;

/** A value comfortably in the interior of a band (not on a boundary), so rounding can't push
 * it into a neighbouring band. */
export function pickInterior(cond: BandCondition): number {
  switch (cond.op) {
    case 'lte':
    case 'lt':
      return cond.value > 0 ? round4(cond.value * 0.6) : round4(cond.value - 0.5);
    case 'gte':
    case 'gt':
      return round4(cond.value + Math.max(0.03, Math.abs(cond.value) * 0.05));
    case 'eq':
      return cond.value;
    case 'between':
      return round4((cond.min + cond.max) / 2);
    case 'or':
    case 'and':
      return pickInterior(cond.conditions[0]!);
  }
}

/** Build (component values, computed value, status) for one metric at a target RAG. */
export function buildEntry(
  m: CatalogMetric,
  target: RagStatus,
): { c1: number; c2: number | null; computed: number | null; status: RagStatus | null } {
  const band = target === 'green' ? m.green_band : target === 'yellow' ? m.yellow_band : m.red_band;
  const value = pickInterior(band);
  let c1: number;
  let c2: number | null;
  if (m.component_count === 1) {
    c1 = round4(value);
    c2 = null;
  } else {
    c2 = 20;
    c1 = round4(value * c2);
  }
  const computed = computeScoredValue(
    m.component_count,
    c1,
    c2,
    kpiValuePrecision(m.green_band, m.yellow_band, m.red_band),
  );
  const status = computeEntryStatus(computed, m.green_band, m.yellow_band, m.red_band);
  return { c1, c2, computed, status };
}
