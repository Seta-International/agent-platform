import { describe, expect, it } from 'vitest';
import { moraleHistoryWindow } from '../../src/backend/domain/list-morale-notes.ts';
import { moraleHistoryQuery } from '../../src/contracts.ts';

/** UTC instant for a wall-clock time in Asia/Ho_Chi_Minh (UTC+7, no DST). */
function vn(iso: string): Date {
  return new Date(`${iso}+07:00`);
}

describe('moraleHistoryWindow', () => {
  it('leaves both bounds open when neither date is given', () => {
    expect(moraleHistoryWindow({})).toEqual({ startAt: null, endAt: null });
  });

  it('starts at Vietnam midnight on the "from" day', () => {
    const { startAt } = moraleHistoryWindow({ from: '2026-08-18' });
    expect(startAt?.toISOString()).toBe('2026-08-17T17:00:00.000Z');
  });

  it('includes the whole of the "to" day, not just its midnight', () => {
    const { endAt } = moraleHistoryWindow({ to: '2026-08-18' });
    // The regression this guards: an inclusive end date compared against `submitted_at`
    // directly would drop every note filed after 00:00 on the last selected day.
    expect(endAt?.toISOString()).toBe('2026-08-18T17:00:00.000Z');
    expect(vn('2026-08-18T23:59:59').getTime()).toBeLessThan(endAt?.getTime() ?? 0);
    expect(vn('2026-08-19T00:00:00').getTime()).toBeGreaterThanOrEqual(endAt?.getTime() ?? 0);
  });

  it('admits a note filed at the first instant of the "from" day', () => {
    const { startAt } = moraleHistoryWindow({ from: '2026-08-18' });
    expect(vn('2026-08-18T00:00:00').getTime()).toBeGreaterThanOrEqual(startAt?.getTime() ?? 0);
    expect(vn('2026-08-17T23:59:59').getTime()).toBeLessThan(startAt?.getTime() ?? 0);
  });

  it('rolls the exclusive end over a month boundary', () => {
    expect(moraleHistoryWindow({ to: '2026-08-31' }).endAt?.toISOString()).toBe(
      '2026-08-31T17:00:00.000Z',
    );
    expect(moraleHistoryWindow({ to: '2026-12-31' }).endAt?.toISOString()).toBe(
      '2026-12-31T17:00:00.000Z',
    );
  });

  it('keeps a single-day window one day wide', () => {
    const { startAt, endAt } = moraleHistoryWindow({ from: '2026-08-18', to: '2026-08-18' });
    expect((endAt?.getTime() ?? 0) - (startAt?.getTime() ?? 0)).toBe(24 * 60 * 60 * 1000);
  });
});

describe('moraleHistoryQuery', () => {
  it('accepts the calendar dates the history page sends', () => {
    // The route wraps this in `.catch({})`, so a schema that rejects valid input degrades
    // silently into an unfiltered "all time" query instead of failing loudly.
    expect(moraleHistoryQuery.parse({ from: '2026-07-01', to: '2026-07-10' })).toEqual({
      from: '2026-07-01',
      to: '2026-07-10',
    });
  });

  it('treats an absent bound as an open end', () => {
    expect(moraleHistoryQuery.parse({ from: undefined, to: '2026-07-10' })).toEqual({
      to: '2026-07-10',
    });
  });

  it('rejects anything that is not a real calendar day', () => {
    for (const bad of ['07/01/2026', '2026-7-1', '2026-13-01', '2026-02-30', 'yesterday']) {
      expect(moraleHistoryQuery.safeParse({ from: bad }).success).toBe(false);
    }
  });
});
