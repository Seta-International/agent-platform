import { formatPerformanceMonth } from './performance-dashboard.ts';

/**
 * How many cycles the period picker offers. Five is a quarter-and-a-bit of history —
 * enough to compare against recent months without turning the picker into a scroll.
 */
export const CYCLE_PERIOD_MONTHS = 5;

export type CyclePeriodOption = { value: string; label: string };

function monthValue(year: number, monthIndex0: number): string {
  const d = new Date(Date.UTC(year, monthIndex0, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * The `CYCLE_PERIOD_MONTHS` most recent cycles (newest first), anchored on a FIXED
 * reference month (the current cycle) — never on the current selection. Anchoring on
 * the selection would slide the whole window on every pick, so a chosen month keeps
 * jumping to a new position; a fixed anchor keeps every option in place and only moves
 * the highlight. A `selected` month outside the window (a pinned historical cycle, or
 * a deep link) is folded in so it stays selectable.
 */
export function cyclePeriodOptions(
  anchor: string,
  selected: string,
  count = CYCLE_PERIOD_MONTHS,
): CyclePeriodOption[] {
  const parts = anchor.split('-');
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const values: string[] = [];
  for (let i = 0; i < count; i += 1) values.push(monthValue(y, m - 1 - i));
  if (!values.includes(selected)) {
    values.push(selected);
    // Keep newest-first ordering after folding the outlier in.
    values.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  }
  return values.map((value) => ({ value, label: formatPerformanceMonth(value) }));
}
