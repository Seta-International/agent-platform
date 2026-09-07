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

function minusMonths(year: number, month: number, n: number): { year: number; month: number } {
  const zero = year * 12 + (month - 1) - n;
  return { year: Math.floor(zero / 12), month: (zero % 12) + 1 };
}

/**
 * The most recent review month whose evaluation window has ended (FUT-781).
 *
 * A month M is evaluable from the 25th of M to the end of M. The moment M+1 begins, M is
 * closed, and it is the only month PMO may manually unlock — every earlier month is
 * view-only for good. Note this is not simply "the latest locked month": a month whose
 * window has not opened yet also classifies as locked, and reopening that early is not
 * what a manual unlock is for.
 */
export function latestClosedCycleMonth(at: Date = monthClockNow()): string {
  const p = vnParts(at);
  // A cycle closes with its own calendar month, so the previous month is always the
  // latest closed one — there is no grace period to wait out first (FUT-973).
  const candidate = minusMonths(p.year, p.month, 1);
  return `${candidate.year}-${String(candidate.month).padStart(2, '0')}`;
}

/**
 * Classify cycle window for `month` (YYYY-MM) at transaction-start `at`.
 * Open = 25th → last day of cycle month (inclusive ms); locked from the 1st of the next.
 * Override wins when `overrideActive`.
 *
 * There is no grace period. One was offered through day 4 of the following month, but a
 * window that reopens by the calendar is a window nobody audits: it let a member, a lead
 * or an AM rewrite last month's scores days after the cycle closed, with no record of who
 * reopened it or why. A correction now goes through the PMO's manual unlock, which is
 * scoped to one account, expires, and leaves a trail (FUT-973).
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

  return { status: 'locked', evaluated_at };
}
