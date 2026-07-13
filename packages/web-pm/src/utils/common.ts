// Shared, framework-free helpers for the web-pm app. Keep these pure and dependency-light so
// they can be unit-tested and reused across pages.

/** Midnight-UTC epoch for a YYYY-MM-DD string (timezone-independent date math). */
function utcMidnight(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1);
}

/** Whole days between two YYYY-MM-DD dates (parsed as UTC, so timezone-independent). */
function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((utcMidnight(toIso) - utcMidnight(fromIso)) / 86_400_000);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Calendar effort (person-months) for one allocation, computed straight from its own
 * start/end dates — independent of "today". An allocation always has both dates, so the
 * value is simply the span start → end scaled by allocation; today never enters into it.
 *
 * @param startDate   allocation start, YYYY-MM-DD
 * @param endDate     allocation end, YYYY-MM-DD
 * @param allocation  planned load as a fraction, 0–1
 *
 *  - months = days between start and end ÷ 30, rounded to 2 decimals.
 *  - effort = months × allocation, returned as a decimal (never negative).
 */
export function calendarEffort(startDate: string, endDate: string, allocation: number): number {
  const months = round2(daysBetween(startDate, endDate) / 30);
  return Math.max(0, round2(months * allocation));
}

/** Convenience adapter for an allocation row: maps `planned_pct` (0–100) to a 0–1 allocation. */
export function rowCalendarEffort(row: {
  date_from: string | null;
  date_to: string | null;
  planned_pct: number | null;
}): number {
  if (!row.date_from || !row.date_to) return 0;
  return calendarEffort(row.date_from, row.date_to, (row.planned_pct ?? 0) / 100);
}
