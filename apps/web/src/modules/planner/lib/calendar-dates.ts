export type CalendarMode = 'week' | 'month';

const DAY_MS = 86_400_000;

export function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function fromDateKey(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

export function addDaysKey(key: string, days: number): string {
  return toDateKey(new Date(fromDateKey(key).getTime() + days * DAY_MS));
}

/** Monday of the week containing `key`. */
export function startOfWeekKey(key: string): string {
  const dow = (fromDateKey(key).getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  return addDaysKey(key, -dow);
}

export function startOfMonthKey(key: string): string {
  return `${key.slice(0, 8)}01`;
}

export function endOfMonthKey(key: string): string {
  const d = fromDateKey(key);
  return toDateKey(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
}

export function currentMonthRange(now: Date): { from: string; to: string } {
  const key = toDateKey(now);
  return { from: startOfMonthKey(key), to: endOfMonthKey(key) };
}

export function currentWeekRange(now: Date): { from: string; to: string } {
  const from = startOfWeekKey(toDateKey(now));
  return { from, to: addDaysKey(from, 6) };
}

/** Exactly-7-day ranges are week mode; everything else is treated as a month. */
export function deriveCalendarMode(from: string, to: string): CalendarMode {
  const days = (fromDateKey(to).getTime() - fromDateKey(from).getTime()) / DAY_MS + 1;
  return days === 7 ? 'week' : 'month';
}

export function shiftRange(from: string, to: string, dir: 1 | -1): { from: string; to: string } {
  if (deriveCalendarMode(from, to) === 'week') {
    const nextFrom = addDaysKey(from, 7 * dir);
    return { from: nextFrom, to: addDaysKey(nextFrom, 6) };
  }
  const d = fromDateKey(from);
  const key = toDateKey(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + dir, 1)));
  return { from: key, to: endOfMonthKey(key) };
}

/** Snap an anchor day to the full week (Mon–Sun) or month containing it. */
export function toModeRange(anchor: string, mode: CalendarMode): { from: string; to: string } {
  if (mode === 'week') {
    const from = startOfWeekKey(anchor);
    return { from, to: addDaysKey(from, 6) };
  }
  return { from: startOfMonthKey(anchor), to: endOfMonthKey(anchor) };
}

const monthYearFmt = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const dayMonthFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});
const dayMonthYearFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

export function rangeLabel(from: string, to: string): string {
  if (deriveCalendarMode(from, to) === 'month') return monthYearFmt.format(fromDateKey(from));
  return `${dayMonthFmt.format(fromDateKey(from))} – ${dayMonthYearFmt.format(fromDateKey(to))}`;
}

/** Inclusive lower API bound for a date key. */
export function apiFrom(key: string): string {
  return `${key}T00:00:00.000Z`;
}

/** Inclusive upper API bound for a date key. */
export function apiTo(key: string): string {
  return `${key}T23:59:59.999Z`;
}
