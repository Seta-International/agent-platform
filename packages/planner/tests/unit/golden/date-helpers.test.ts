import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  daysFromNow,
  endOfWeek,
  REFERENCE_TIME,
  startOfWeek,
} from '../../fixtures/golden/constants.ts';

describe('golden date helpers are reference-anchored', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('REFERENCE_TIME is the frozen anchor', () => {
    expect(REFERENCE_TIME.toISOString()).toBe('2026-07-01T02:00:00.000Z'); // 09:00+07:00
  });

  it('daysFromNow is independent of the system clock', () => {
    vi.setSystemTime(new Date('2020-01-01T00:00:00Z'));
    const a = daysFromNow(3).getTime();
    vi.setSystemTime(new Date('2030-12-31T00:00:00Z'));
    const b = daysFromNow(3).getTime();
    expect(a).toBe(b); // same regardless of wall clock
  });

  it('startOfWeek is Monday 00:00+07:00 of the reference week', () => {
    // 2026-07-01 is a Wednesday; Monday of that ISO week = 2026-06-29
    expect(startOfWeek().toISOString()).toBe('2026-06-28T17:00:00.000Z'); // 2026-06-29 00:00+07:00
  });

  it('endOfWeek half-open upper bound is the next Monday 00:00+07:00', () => {
    expect(endOfWeek().toISOString()).toBe('2026-07-05T17:00:00.000Z'); // 2026-07-06 00:00+07:00
  });
});
