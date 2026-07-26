import { afterEach, describe, expect, it } from 'vitest';
import {
  classifyCycleStatus,
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

  it('Dec cycle grace maps to Jan 2–4; Jan 5 hard-lock (TC-15 / TC-17)', () => {
    expect(classifyCycleStatus({ month: '2026-12', at: vn(2027, 1, 2, 0) }).status).toBe('makeup');
    expect(
      classifyCycleStatus({ month: '2026-12', at: vn(2027, 1, 4, 23, 59, 59, 999) }).status,
    ).toBe('makeup');
    expect(classifyCycleStatus({ month: '2026-12', at: vn(2027, 1, 5, 0, 0, 0, 0) }).status).toBe(
      'locked',
    );
  });

  it('31st / 1st / mid-month outside windows → locked', () => {
    expect(classifyCycleStatus({ month: '2026-07', at: vn(2026, 7, 15) }).status).toBe('locked');
    expect(classifyCycleStatus({ month: '2026-07', at: vn(2026, 8, 1, 12) }).status).toBe('locked');
  });

  it('grace window 2–4 of following month (TC-17)', () => {
    expect(classifyCycleStatus({ month: '2026-07', at: vn(2026, 8, 3, 9) }).status).toBe('makeup');
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
