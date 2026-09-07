import { afterEach, describe, expect, it } from 'vitest';
import {
  classifyCycleStatus,
  latestClosedCycleMonth,
  monthClockNow,
  setMonthClock,
  vnParts,
  vnYearMonth,
} from '../../src/backend/domain/month-clock.ts';

/** Build a UTC Date from an Asia/Ho_Chi_Minh wall-clock local. */
function vn(y: number, m: number, d: number, h = 0, min = 0, s = 0, ms = 0): Date {
  return new Date(Date.UTC(y, m - 1, d, h, min, s, ms) - 7 * 3_600_000);
}

afterEach(() => setMonthClock());

describe('vnParts', () => {
  it('shifts UTC instant to VN wall (+7)', () => {
    // 2026-07-26 03:00 UTC = 10:00 VN
    const at = new Date('2026-07-26T03:00:00.000Z');
    expect(vnParts(at)).toMatchObject({
      year: 2026,
      month: 7,
      day: 26,
      hour: 10,
    });
  });
});

describe('vnYearMonth', () => {
  it('uses VN wall, not UTC, across the month boundary', () => {
    // 2026-08-01 00:30 VN = 2026-07-31 17:30 UTC → still July in UTC, August in VN
    expect(vnYearMonth(vn(2026, 8, 1, 0, 30))).toBe('2026-08');
    expect(vnYearMonth(vn(2026, 7, 31, 23))).toBe('2026-07');
  });
});

describe('classifyCycleStatus (TC-11..17)', () => {
  it('open starts at 25th 00:00 VN; 24th remains locked', () => {
    expect(
      classifyCycleStatus({ month: '2026-07', at: vn(2026, 7, 24, 23, 59, 59, 999) }).status,
    ).toBe('locked');
    expect(classifyCycleStatus({ month: '2026-07', at: vn(2026, 7, 25, 0, 0, 0, 0) }).status).toBe(
      'open',
    );
  });

  it('26th 10:00 VN → open (AC1 / TC-11)', () => {
    const r = classifyCycleStatus({ month: '2026-07', at: vn(2026, 7, 26, 10) });
    expect(r.status).toBe('open');
    expect(r.evaluated_at).toBe(vn(2026, 7, 26, 10).toISOString());
  });

  it('open inclusive through last ms of last day; next ms locked (AC2 / TC-12)', () => {
    // July has 31 days — open through 31 23:59:59.999 VN
    expect(
      classifyCycleStatus({ month: '2026-07', at: vn(2026, 7, 31, 23, 59, 59, 999) }).status,
    ).toBe('open');
    expect(classifyCycleStatus({ month: '2026-07', at: vn(2026, 8, 1, 0, 0, 0, 0) }).status).toBe(
      'locked',
    );

    // 30-day month: open through 30th end; 31st does not exist — use June
    expect(
      classifyCycleStatus({ month: '2026-06', at: vn(2026, 6, 30, 23, 59, 59, 900) }).status,
    ).toBe('open');
    expect(classifyCycleStatus({ month: '2026-06', at: vn(2026, 7, 1, 0, 0, 0, 1) }).status).toBe(
      'locked',
    );
  });

  it('Feb open through last day, not hard-coded 30 (TC-14)', () => {
    expect(classifyCycleStatus({ month: '2026-02', at: vn(2026, 2, 28, 12) }).status).toBe('open');
    expect(classifyCycleStatus({ month: '2026-02', at: vn(2026, 3, 1, 0, 0, 0, 1) }).status).toBe(
      'locked',
    );
    // leap year
    expect(
      classifyCycleStatus({ month: '2024-02', at: vn(2024, 2, 29, 23, 59, 59, 999) }).status,
    ).toBe('open');
  });

  it('a December cycle locks the instant January starts (FUT-973)', () => {
    // The grace window used to run Jan 2–4. It is gone: a window that reopens by the
    // calendar reopens for everyone, with nothing on the row to say who used it.
    expect(
      classifyCycleStatus({ month: '2026-12', at: vn(2026, 12, 31, 23, 59, 59, 999) }).status,
    ).toBe('open');
    expect(classifyCycleStatus({ month: '2026-12', at: vn(2027, 1, 1, 0, 0, 0, 0) }).status).toBe(
      'locked',
    );
    for (const day of [2, 3, 4, 5]) {
      expect(classifyCycleStatus({ month: '2026-12', at: vn(2027, 1, day, 12) }).status).toBe(
        'locked',
      );
    }
  });

  it('31st / 1st / mid-month outside windows → locked', () => {
    expect(classifyCycleStatus({ month: '2026-07', at: vn(2026, 7, 15) }).status).toBe('locked');
    expect(classifyCycleStatus({ month: '2026-07', at: vn(2026, 8, 1, 12) }).status).toBe('locked');
  });

  it('the days that used to be the grace window are locked like any other', () => {
    expect(classifyCycleStatus({ month: '2026-07', at: vn(2026, 8, 3, 9) }).status).toBe('locked');
  });

  it('overrideActive wins (display path for S5.2)', () => {
    expect(
      classifyCycleStatus({
        month: '2026-07',
        at: vn(2026, 7, 15),
        overrideActive: true,
      }).status,
    ).toBe('override');
  });

  it('monthClockNow uses injectable clock (transaction-start, not receipt)', () => {
    const fixed = vn(2026, 7, 26, 10);
    setMonthClock(() => fixed);
    expect(monthClockNow().toISOString()).toBe(fixed.toISOString());
    expect(classifyCycleStatus({ month: '2026-07', at: monthClockNow() }).status).toBe('open');
  });
});

describe('latestClosedCycleMonth (FUT-781)', () => {
  // A cycle month M is closed the moment M+1 begins. Only that month may be manually
  // unlocked; anything older is view-only forever.

  it('mid-month: the previous cycle is the latest closed one', () => {
    // Aug 13 — July's window ended when July did, August's has not opened (25th).
    expect(latestClosedCycleMonth(vn(2026, 8, 13, 10))).toBe('2026-07');
  });

  it('the previous cycle is unlockable from the first day of the new month (FUT-973)', () => {
    // Aug 1 — July closed at midnight, so it is the month a PMO may reopen. Under the
    // old grace window this said June, leaving July unfixable while it was still open
    // to everyone by the calendar.
    expect(latestClosedCycleMonth(vn(2026, 8, 1, 0, 0, 0, 0))).toBe('2026-07');
    expect(latestClosedCycleMonth(vn(2026, 8, 3, 10))).toBe('2026-07');
  });

  it('inside an open window the current month is open, previous is closed', () => {
    // Jul 26 — July is open for evaluation; June closed when June ended.
    expect(latestClosedCycleMonth(vn(2026, 7, 26, 10))).toBe('2026-06');
  });

  it('rolls the year over correctly', () => {
    // Any day of January 2027 — December 2026 closed at the turn of the year.
    expect(latestClosedCycleMonth(vn(2027, 1, 13, 10))).toBe('2026-12');
    expect(latestClosedCycleMonth(vn(2027, 1, 3, 10))).toBe('2026-12');
  });

  it('the month it returns classifies as locked (nothing else to unlock)', () => {
    const at = vn(2026, 8, 13, 10);
    expect(classifyCycleStatus({ month: latestClosedCycleMonth(at), at }).status).toBe('locked');
  });
});
