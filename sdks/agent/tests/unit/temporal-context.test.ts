import { describe, expect, it } from 'vitest';
import {
  daysUntilDue,
  isOverdue,
  localDateKey,
  localDayBounds,
  PLATFORM_TIMEZONE,
  TEMPORAL_CONTEXT_MARKER,
  temporalAnchors,
  temporalContextBlock,
  withTemporalContext,
} from '../../src/temporal-context.ts';

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

describe('localDayBounds', () => {
  it('starts the local day at ICT midnight, not UTC midnight', () => {
    const { start, end } = localDayBounds('2026-08-03');
    expect(start.toISOString()).toBe('2026-08-02T17:00:00.000Z');
    expect(end.toISOString()).toBe('2026-08-03T17:00:00.000Z');
  });

  it('rejects a malformed key', () => {
    expect(() => localDayBounds('03-08-2026')).toThrow(RangeError);
  });
});

describe('localDateKey', () => {
  it('reads the local calendar day of an instant', () => {
    expect(localDateKey(new Date('2026-07-29T17:30:00Z'))).toBe('2026-07-30');
    expect(localDateKey(new Date('2026-07-29T16:59:00Z'))).toBe('2026-07-29');
  });
});

describe('isOverdue', () => {
  const now = new Date('2026-07-30T02:00:00Z'); // 09:00 ICT

  it('is false for a task due later the same local day', () => {
    expect(isOverdue('2026-07-30T10:00:00Z', now)).toBe(false);
  });

  it('is true once the due instant has passed', () => {
    expect(isOverdue('2026-07-30T01:59:00Z', now)).toBe(true);
  });

  it('is false exactly at the due instant', () => {
    expect(isOverdue('2026-07-30T02:00:00Z', now)).toBe(false);
  });

  it('is false when there is no due date', () => {
    expect(isOverdue(null, now)).toBe(false);
  });

  it('is false for an unparseable due date rather than throwing', () => {
    expect(isOverdue('not-a-date', now)).toBe(false);
  });

  it('accepts a Date as well as an ISO string', () => {
    expect(isOverdue(new Date('2026-07-29T00:00:00Z'), now)).toBe(true);
  });
});

describe('daysUntilDue', () => {
  const now = new Date('2026-07-29T17:30:00Z'); // 2026-07-30 00:30 ICT

  it('counts local calendar days, not 24-hour spans', () => {
    // 2026-07-30T16:00:00Z is 23:00 ICT the same local day → 0, not 1.
    expect(daysUntilDue('2026-07-30T16:00:00Z', now)).toBe(0);
  });

  it('is positive for a future local day', () => {
    expect(daysUntilDue('2026-08-02T03:00:00Z', now)).toBe(3);
  });

  it('is negative for a past local day', () => {
    expect(daysUntilDue('2026-07-28T03:00:00Z', now)).toBe(-2);
  });

  it('is null when there is no due date', () => {
    expect(daysUntilDue(null, now)).toBeNull();
  });
});

describe('temporalContextBlock', () => {
  const block = temporalContextBlock(new Date('2026-07-29T17:30:00Z'));

  it('opens with the marker the CI gate greps for', () => {
    expect(block.startsWith(TEMPORAL_CONTEXT_MARKER)).toBe(true);
  });

  it('states the local now and today', () => {
    expect(block).toContain('2026-07-30 00:30 +07:00');
    expect(block).toContain('today       = 2026-07-30');
  });

  it('states the exclusive dueBefore bound for this week', () => {
    expect(block).toContain('dueBefore 2026-08-03');
  });

  it('forbids the model from recomputing dates or judging lateness itself', () => {
    expect(block).toContain('do NOT recompute');
    expect(block).toContain('isOverdue');
  });
});

describe('withTemporalContext', () => {
  it('prepends the block to the agent instructions', () => {
    const out = withTemporalContext('You are a helpful agent.', {
      now: new Date('2026-07-29T17:30:00Z'),
    });
    expect(out.startsWith(TEMPORAL_CONTEXT_MARKER)).toBe(true);
    expect(out).toContain('You are a helpful agent.');
    expect(out.indexOf(TEMPORAL_CONTEXT_MARKER)).toBeLessThan(
      out.indexOf('You are a helpful agent.'),
    );
  });

  it('defaults now to the wall clock, so a per-turn caller always gets today', () => {
    expect(withTemporalContext('base')).toContain(`today       = ${localDateKey()}`);
  });

  it('honours an explicit timezone', () => {
    const out = withTemporalContext('base', {
      now: new Date('2026-07-29T17:30:00Z'),
      tz: 'UTC',
    });
    expect(out).toContain('today       = 2026-07-29');
  });
});
