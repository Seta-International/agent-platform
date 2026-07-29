/**
 * Platform wall-clock reasoning for agents (FUT-800).
 *
 * Every date an agent sees comes from here. The previous implementation
 * (planner's `date-anchors.ts`) did its arithmetic in UTC, so between 00:00 and
 * 07:00 Asia/Ho_Chi_Minh it reported yesterday as "today". Rule for this file:
 * derive the LOCAL year/month/day triple through `Intl.DateTimeFormat`, then do
 * all arithmetic on that triple. Never call `getUTCDate()` on a raw instant and
 * never slice `toISOString()` of one.
 *
 * A "day key" is a `YYYY-MM-DD` string in platform-local time. Internally a day
 * key is carried as a *proxy* Date at exactly midnight UTC, which makes
 * arithmetic and `toISOString().slice(0, 10)` safe on it — the proxy is a
 * calendar coordinate, not an instant.
 */
import { z } from 'zod';

const TimezoneEnv = z.object({
  TEMPORAL_TIMEZONE: z.string().min(1).default('Asia/Ho_Chi_Minh'),
});

/**
 * Platform wall clock. Override with TEMPORAL_TIMEZONE. Deliberately a single
 * platform-wide value: SessionScope carries no timezone and `people.timezone`
 * defaults to 'UTC', so a per-user lookup would be wrong for most users. A
 * per-tenant setting is a separate change.
 */
export const PLATFORM_TIMEZONE: string = (() => {
  const { TEMPORAL_TIMEZONE: tz } = TimezoneEnv.parse(process.env);
  try {
    // Fail fast at module load rather than mid-turn if ICU data is missing.
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
  } catch {
    throw new Error(
      `TEMPORAL_TIMEZONE="${tz}" is not a resolvable IANA timezone. ` +
        'Check the value, and that this Node build ships full ICU data.',
    );
  }
  return tz;
})();

const MS_PER_DAY = 86_400_000;

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function localParts(instant: Date, tz: string): LocalParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const found = parts.find((p) => p.type === type);
    if (!found) throw new Error(`temporal-context: Intl gave no "${type}" part for ${tz}`);
    return Number(found.value);
  };
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
  };
}

/** The local calendar day of `instant`, as a midnight-UTC proxy Date. */
function localDayProxy(instant: Date, tz: string): Date {
  const p = localParts(instant, tz);
  return new Date(Date.UTC(p.year, p.month - 1, p.day));
}

/** Minutes `tz` is ahead of UTC at `instant` (+420 for ICT). */
function offsetMinutes(instant: Date, tz: string): number {
  const p = localParts(instant, tz);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  const flooredToMinute = Math.floor(instant.getTime() / 60_000) * 60_000;
  return (asIfUtc - flooredToMinute) / 60_000;
}

function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `${sign}${hh}:${mm}`;
}

function dayKey(proxy: Date): string {
  return proxy.toISOString().slice(0, 10);
}

function monthKey(proxy: Date): string {
  return proxy.toISOString().slice(0, 7);
}

function shiftDays(proxy: Date, days: number): Date {
  return new Date(proxy.getTime() + days * MS_PER_DAY);
}

function keyToProxy(key: string): Date {
  const ms = Date.parse(`${key}T00:00:00Z`);
  if (Number.isNaN(ms)) throw new RangeError(`temporal-context: invalid day key "${key}"`);
  return new Date(ms);
}

/** `YYYY-MM-DD` shifted by whole local days. */
export function addDaysToKey(key: string, days: number): string {
  return dayKey(shiftDays(keyToProxy(key), days));
}

/** The platform-local calendar day of `instant`, as `YYYY-MM-DD`. */
export function localDateKey(instant: Date = new Date(), tz: string = PLATFORM_TIMEZONE): string {
  return dayKey(localDayProxy(instant, tz));
}

/** The instant at which local `key` begins. */
function localMidnight(key: string, tz: string): Date {
  const naive = keyToProxy(key).getTime();
  // First pass uses the offset at the naive instant; a second pass re-reads the
  // offset at the corrected instant so zones with DST transitions converge.
  const first = new Date(naive - offsetMinutes(new Date(naive), tz) * 60_000);
  return new Date(naive - offsetMinutes(first, tz) * 60_000);
}

/**
 * Half-open instant range `[start, end)` covering the local day `key`.
 * In ICT, `localDayBounds('2026-08-03').start` is 2026-08-02T17:00:00Z.
 */
export function localDayBounds(
  key: string,
  tz: string = PLATFORM_TIMEZONE,
): { start: Date; end: Date } {
  return { start: localMidnight(key, tz), end: localMidnight(addDaysToKey(key, 1), tz) };
}

export interface TemporalAnchors {
  /** Local wall clock with offset, e.g. '2026-07-30 00:30 +07:00'. */
  nowLocal: string;
  today: string;
  tomorrow: string;
  yesterday: string;
  thisWeekStart: string;
  thisWeekEnd: string;
  nextWeekStart: string;
  nextWeekEnd: string;
  lastWeekStart: string;
  lastWeekEnd: string;
  thisMonth: string;
  nextMonth: string;
  lastMonth: string;
  /** EXCLUSIVE upper bounds, matching `due_at < due_before` in list-tasks.ts. */
  thisWeekDueBefore: string;
  nextWeekDueBefore: string;
  thisMonthDueBefore: string;
  nextMonthDueBefore: string;
}

export function temporalAnchors(
  now: Date = new Date(),
  tz: string = PLATFORM_TIMEZONE,
): TemporalAnchors {
  const p = localParts(now, tz);
  const today = new Date(Date.UTC(p.year, p.month - 1, p.day));
  const dow = today.getUTCDay(); // 0 Sun .. 6 Sat
  const monday = shiftDays(today, dow === 0 ? -6 : 1 - dow); // ISO week starts Monday
  const monthStart = (offset: number): Date => new Date(Date.UTC(p.year, p.month - 1 + offset, 1));

  const hh = String(p.hour).padStart(2, '0');
  const mm = String(p.minute).padStart(2, '0');

  return {
    nowLocal: `${dayKey(today)} ${hh}:${mm} ${formatOffset(offsetMinutes(now, tz))}`,
    today: dayKey(today),
    tomorrow: dayKey(shiftDays(today, 1)),
    yesterday: dayKey(shiftDays(today, -1)),
    thisWeekStart: dayKey(monday),
    thisWeekEnd: dayKey(shiftDays(monday, 6)),
    nextWeekStart: dayKey(shiftDays(monday, 7)),
    nextWeekEnd: dayKey(shiftDays(monday, 13)),
    lastWeekStart: dayKey(shiftDays(monday, -7)),
    lastWeekEnd: dayKey(shiftDays(monday, -1)),
    thisMonth: monthKey(monthStart(0)),
    nextMonth: monthKey(monthStart(1)),
    lastMonth: monthKey(monthStart(-1)),
    thisWeekDueBefore: dayKey(shiftDays(monday, 7)),
    nextWeekDueBefore: dayKey(shiftDays(monday, 14)),
    thisMonthDueBefore: dayKey(monthStart(1)),
    nextMonthDueBefore: dayKey(monthStart(2)),
  };
}
