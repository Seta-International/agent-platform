import { describe, expect, it } from 'vitest';
import { endDateIsInPast } from '../../src/pages/ra-shared.tsx';

// RA Monitoring lists allocations whose window overlaps [today, …]; an allocation whose
// end date is before today drops out of that view. This predicate drives the "moved out of
// the active window" notification so the record never disappears silently.
describe('endDateIsInPast', () => {
  const today = '2026-07-23';

  it('is false for an open-ended allocation (no end date)', () => {
    expect(endDateIsInPast(null, today)).toBe(false);
    expect(endDateIsInPast('', today)).toBe(false);
  });

  it('is false when the end date is today (still active today)', () => {
    expect(endDateIsInPast('2026-07-23', today)).toBe(false);
  });

  it('is false when the end date is in the future', () => {
    expect(endDateIsInPast('2026-08-01', today)).toBe(false);
  });

  it('is true when the end date is before today', () => {
    expect(endDateIsInPast('2026-07-22', today)).toBe(true);
    expect(endDateIsInPast('2020-01-01', today)).toBe(true);
  });

  it('is false for a non-ISO / malformed value (nothing to compare)', () => {
    expect(endDateIsInPast('not-a-date', today)).toBe(false);
  });
});
