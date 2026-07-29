import { describe, expect, it } from 'vitest';
import { PLATFORM_TIMEZONE, temporalAnchors } from '../../src/temporal-context.ts';

// 2026-07-29T17:30:00Z is 2026-07-30 00:30 in Asia/Ho_Chi_Minh (UTC+7).
// This is the exact FUT-800 AC4 regression: UTC math answers 2026-07-29.
const EARLY_MORNING = new Date('2026-07-29T17:30:00Z');

describe('PLATFORM_TIMEZONE', () => {
  it('defaults to Asia/Ho_Chi_Minh', () => {
    expect(PLATFORM_TIMEZONE).toBe('Asia/Ho_Chi_Minh');
  });
});

describe('temporalAnchors — early morning ICT (AC4)', () => {
  const a = temporalAnchors(EARLY_MORNING);

  it('resolves today to the local calendar day, not the UTC one', () => {
    expect(a.today).toBe('2026-07-30');
  });

  it('resolves yesterday and tomorrow from the local day', () => {
    expect(a.yesterday).toBe('2026-07-29');
    expect(a.tomorrow).toBe('2026-07-31');
  });

  it('reports the local wall clock with its offset', () => {
    expect(a.nowLocal).toBe('2026-07-30 00:30 +07:00');
  });
});

describe('temporalAnchors — week anchors (ISO, Monday start)', () => {
  it('anchors the week from the local day', () => {
    // 2026-07-30 local is a Thursday; its ISO week runs Mon 27 Jul .. Sun 2 Aug.
    const a = temporalAnchors(EARLY_MORNING);
    expect(a.thisWeekStart).toBe('2026-07-27');
    expect(a.thisWeekEnd).toBe('2026-08-02');
    expect(a.thisWeekDueBefore).toBe('2026-08-03');
    expect(a.nextWeekStart).toBe('2026-08-03');
    expect(a.nextWeekEnd).toBe('2026-08-09');
    expect(a.nextWeekDueBefore).toBe('2026-08-10');
    expect(a.lastWeekStart).toBe('2026-07-20');
    expect(a.lastWeekEnd).toBe('2026-07-26');
  });

  it('does not roll back a week when local Monday has not yet reached 07:00', () => {
    // 2026-08-02T17:30:00Z is Monday 2026-08-03 00:30 ICT. UTC math would place
    // this in the week of 27 Jul; local math must start the week on 3 Aug.
    const a = temporalAnchors(new Date('2026-08-02T17:30:00Z'));
    expect(a.today).toBe('2026-08-03');
    expect(a.thisWeekStart).toBe('2026-08-03');
  });

  it('treats local Sunday as the end of the week that began the previous Monday', () => {
    // 2026-08-02T05:00:00Z is Sunday 2026-08-02 12:00 ICT.
    const a = temporalAnchors(new Date('2026-08-02T05:00:00Z'));
    expect(a.today).toBe('2026-08-02');
    expect(a.thisWeekStart).toBe('2026-07-27');
    expect(a.thisWeekEnd).toBe('2026-08-02');
  });
});

describe('temporalAnchors — month anchors', () => {
  it('rolls the month over from the local day', () => {
    // 2026-07-31T17:30:00Z is 2026-08-01 00:30 ICT.
    const a = temporalAnchors(new Date('2026-07-31T17:30:00Z'));
    expect(a.today).toBe('2026-08-01');
    expect(a.thisMonth).toBe('2026-08');
    expect(a.lastMonth).toBe('2026-07');
    expect(a.nextMonth).toBe('2026-09');
    expect(a.thisMonthDueBefore).toBe('2026-09-01');
    expect(a.nextMonthDueBefore).toBe('2026-10-01');
  });

  it('handles the December to January rollover', () => {
    const a = temporalAnchors(new Date('2026-12-31T17:30:00Z'));
    expect(a.today).toBe('2027-01-01');
    expect(a.thisMonth).toBe('2027-01');
    expect(a.nextMonth).toBe('2027-02');
    expect(a.lastMonth).toBe('2026-12');
  });
});

describe('temporalAnchors — explicit timezone override', () => {
  it('honours a caller-supplied zone', () => {
    const a = temporalAnchors(EARLY_MORNING, 'UTC');
    expect(a.today).toBe('2026-07-29');
    expect(a.nowLocal).toBe('2026-07-29 17:30 +00:00');
  });
});
