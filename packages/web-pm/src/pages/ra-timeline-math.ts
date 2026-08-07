export interface TimelineSegment {
  date_from: string;
  date_to: string | null;
  planned_pct: number;
}

/** 'YYYY-MM-DD' -> 'YYYY-MM'. */
export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

function addMonths(monthIso: string, count: number): string {
  const [y, m] = monthIso.split('-').map(Number);
  // biome-ignore lint/style/noNonNullAssertion: monthIso is always 'YYYY-MM' from monthKey/callers
  const total = y! * 12 + (m! - 1) + count;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

/**
 * Month columns ('YYYY-MM') spanning every segment's own date range plus
 * today, so the chart always shows at least the current month even if every
 * segment is entirely in the future or entirely in the past. A one-month
 * buffer is added on the open-ended end (no `date_to`) purely so an ongoing
 * bar doesn't look clipped flush against the chart's right edge.
 */
export function buildMonthColumns(segments: TimelineSegment[], todayIso: string): string[] {
  const starts = segments.map((s) => monthKey(s.date_from));
  const ends = segments.map((s) =>
    s.date_to ? monthKey(s.date_to) : addMonths(monthKey(todayIso), 1),
  );
  const all = [...starts, ...ends, monthKey(todayIso)];
  const from = all.sort()[0] as string;
  const to = [...all].sort().at(-1) as string;

  const months: string[] = [];
  let cursor = from;
  // Guard against a pathological huge range (bad data) turning this into an
  // effectively unbounded loop.
  for (let i = 0; i < 240 && cursor <= to; i++) {
    months.push(cursor);
    cursor = addMonths(cursor, 1);
  }
  return months;
}

/**
 * Inclusive-exclusive `[start, end)` column indices for a segment's bar,
 * clamped to the chart's month columns. Bar granularity is whole months —
 * a segment starting mid-month still occupies that whole month's column,
 * which keeps the chart readable at a glance rather than pixel-precise.
 */
export function monthColumnRange(
  months: string[],
  dateFrom: string,
  dateTo: string | null,
): { start: number; end: number } {
  const fromKey = monthKey(dateFrom);
  const toKey = dateTo ? monthKey(dateTo) : (months.at(-1) as string);
  const start = Math.max(0, months.indexOf(fromKey));
  const endIdx = months.indexOf(toKey);
  const end = (endIdx === -1 ? months.length - 1 : endIdx) + 1;
  return { start, end };
}

/**
 * Today's fractional position across the month columns (e.g. `5.4` for
 * ~40% through the 6th column), for the vertical "Today" marker. Clamped to
 * the chart's own range.
 */
export function todayFraction(months: string[], todayIso: string): number {
  if (months.length === 0) return 0;
  const key = monthKey(todayIso);
  const idx = months.indexOf(key);
  if (idx === -1) return todayIso < (months[0] as string) ? 0 : months.length;
  const day = Number(todayIso.slice(8, 10));
  const daysInMonth = new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0).getDate();
  return idx + (day - 1) / daysInMonth;
}

/**
 * Peak planned_pct per month, calculated as the maximum daily total allocation
 * across all days in that month (FUT-851).
 *
 * For consecutive non-overlapping allocations within the same month (e.g. 01–15 Sep @ 100%
 * and 16–30 Sep @ 100%), the daily total on every day is 100%, so the month peak is 100%
 * rather than summing all month-overlapping records to 200%.
 */
export function monthlyTotals(segments: TimelineSegment[], months: string[]): number[] {
  return months.map((month) => {
    const [y, m] = month.split('-').map(Number);
    // Date.UTC with month m (1-indexed) and day 0 gives the last day of month m.
    // biome-ignore lint/style/noNonNullAssertion: month is always 'YYYY-MM'
    const daysInMonth = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
    let maxDailySum = 0;

    for (let day = 1; day <= daysInMonth; day++) {
      const dayIso = `${month}-${String(day).padStart(2, '0')}`;
      const dailySum = segments
        .filter((s) => s.date_from <= dayIso && (s.date_to === null || s.date_to >= dayIso))
        .reduce((sum, s) => sum + s.planned_pct, 0);

      if (dailySum > maxDailySum) {
        maxDailySum = dailySum;
      }
    }

    return maxDailySum;
  });
}

/** 'YYYY-MM' -> short display label, e.g. 'Jan 2026'. */
export function monthLabel(month: string): string {
  const months = [
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
  const [y, m] = month.split('-');
  return `${months[Number(m) - 1]} ${y}`;
}
