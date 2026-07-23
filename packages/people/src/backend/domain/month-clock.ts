/**
 * Performance month-clock (FUT-694 / AD-6): classify which window of a cycle
 * month we are in from a single transaction-start timestamp, Asia/Ho_Chi_Minh
 * (UTC+7, no DST). Pure + injectable clock — FE must never recompute this.
 */

import type { CycleStatus } from '../../contracts.ts';

export type { CycleStatus };

export const VN_OFFSET_MS = 7 * 3_600_000;

let clock: () => Date = () => new Date();

/** Test hook — classification depends on transaction-start, not receipt-time. */
export function setMonthClock(next?: () => Date): void {
  clock = next ?? (() => new Date());
}

/** Transaction-start instant for the current request (call once per handler). */
export function monthClockNow(): Date {
  return clock();
}

type VnParts = {
  year: number;
  month: number; // 1–12
  day: number;
  hour: number;
  minute: number;
  second: number;
  ms: number;
};

/** Wall-clock parts in Asia/Ho_Chi_Minh for a UTC instant. */
export function vnParts(at: Date): VnParts {
  const vn = new Date(at.getTime() + VN_OFFSET_MS);
  return {
    year: vn.getUTCFullYear(),
    month: vn.getUTCMonth() + 1,
    day: vn.getUTCDate(),
    hour: vn.getUTCHours(),
    minute: vn.getUTCMinutes(),
    second: vn.getUTCSeconds(),
    ms: vn.getUTCMilliseconds(),
  };
}

/** Current Performance cycle month (YYYY-MM) in Asia/Ho_Chi_Minh — not UTC. */
export function vnYearMonth(at: Date = monthClockNow()): string {
  const p = vnParts(at);
  return `${p.year}-${String(p.month).padStart(2, '0')}`;
}

function parseMonth(month: string): { year: number; month: number } {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!m) throw new Error(`invalid month: ${month}`);
  return { year: Number(m[1]), month: Number(m[2]) };
}

function lastDayOfMonth(year: number, month: number): number {
  // day 0 of next month = last day of this month (UTC calendar arithmetic)
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function nextMonth(year: number, month: number): { year: number; month: number } {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

/**
 * Classify cycle window for `month` (YYYY-MM) at transaction-start `at`.
 * Open = 25th → last day of cycle month (inclusive ms).
 * Makeup/grace = 2nd–4th of the following calendar month.
 * Override wins when `overrideActive` (Story 5.2 supplies the flag later).
 */
export function classifyCycleStatus(input: { month: string; at: Date; overrideActive?: boolean }): {
  status: CycleStatus;
  evaluated_at: string;
} {
  const evaluated_at = input.at.toISOString();
  if (input.overrideActive) {
    return { status: 'override', evaluated_at };
  }

  const cycle = parseMonth(input.month);
  const p = vnParts(input.at);
  const last = lastDayOfMonth(cycle.year, cycle.month);

  if (p.year === cycle.year && p.month === cycle.month && p.day >= 25 && p.day <= last) {
    return { status: 'open', evaluated_at };
  }

  const grace = nextMonth(cycle.year, cycle.month);
  if (p.year === grace.year && p.month === grace.month && p.day >= 2 && p.day <= 4) {
    return { status: 'makeup', evaluated_at };
  }

  return { status: 'locked', evaluated_at };
}
