// Shared, framework-free helpers for the web-pm app. Keep these pure and dependency-light so
// they can be unit-tested and reused across pages.

/**
 * Counts the number of working days (Monday to Friday, excluding Saturday & Sunday)
 * between two ISO date strings 'YYYY-MM-DD' (inclusive).
 */
export function countWorkingDays(fromIso: string, toIso: string): number {
  if (!fromIso || !toIso || fromIso > toIso) return 0;
  const [y1, m1, d1] = fromIso.split('-').map(Number);
  const [y2, m2, d2] = toIso.split('-').map(Number);
  if (!y1 || !m1 || !d1 || !y2 || !m2 || !d2) return 0;

  const cur = new Date(Date.UTC(y1, m1 - 1, d1));
  const end = new Date(Date.UTC(y2, m2 - 1, d2));

  let count = 0;
  while (cur <= end) {
    const day = cur.getUTCDay();
    if (day !== 0 && day !== 6) {
      count++;
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return count;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Calendar effort (person-months) for one allocation, computed month-by-month
 * based on actual working days (Mon–Fri) in each overlapping month:
 *
 *   AllocatedHours = allocation × WorkingDaysCovered × 8
 *   MM = AllocatedHours / (WorkingDaysOfMonth × 8) = (allocation × WorkingDaysCovered) / WorkingDaysOfMonth
 *
 * @param startDate   allocation start, YYYY-MM-DD
 * @param endDate     allocation end, YYYY-MM-DD
 * @param allocation  planned load as a fraction, 0–1
 */
export function calendarEffort(startDate: string, endDate: string, allocation: number): number {
  if (!startDate || !endDate || startDate > endDate || allocation <= 0) return 0;
  const [y1, m1] = startDate.split('-').map(Number);
  const [y2, m2] = endDate.split('-').map(Number);
  if (!y1 || !m1 || !y2 || !m2) return 0;

  let totalMm = 0;
  let curY = y1;
  let curM = m1;

  while (curY < y2 || (curY === y2 && curM <= m2)) {
    const firstDayStr = `${curY}-${String(curM).padStart(2, '0')}-01`;
    const lastDayNum = new Date(Date.UTC(curY, curM, 0)).getUTCDate();
    const lastDayStr = `${curY}-${String(curM).padStart(2, '0')}-${String(lastDayNum).padStart(2, '0')}`;

    const ovStart = startDate > firstDayStr ? startDate : firstDayStr;
    const ovEnd = endDate < lastDayStr ? endDate : lastDayStr;

    if (ovStart <= ovEnd) {
      const workingDaysCovered = countWorkingDays(ovStart, ovEnd);
      const workingDaysOfMonth = countWorkingDays(firstDayStr, lastDayStr);
      if (workingDaysOfMonth > 0) {
        totalMm += (allocation * workingDaysCovered) / workingDaysOfMonth;
      }
    }

    curM++;
    if (curM > 12) {
      curM = 1;
      curY++;
    }
  }

  return Math.max(0, round2(totalMm));
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
