import { describe, expect, it } from 'vitest';
import { existingEndDateMin } from '../../src/pages/ra-shared.tsx';

// The End-date picker of an existing allocation row must never offer a past date: ending an
// allocation before today silently drops it out of RA Monitoring's active window (FUT-747).
// The floor the picker enforces is the later of the row's own start and today.
describe('existingEndDateMin', () => {
  const today = '2026-07-27';

  it('floors a locked (past-start) row at today so no past end date can be picked', () => {
    // Start is in the past — without the floor the picker would allow ending in the past.
    expect(existingEndDateMin('2026-01-01', today)).toBe(today);
  });

  it('uses the start date when it is already today or later (end cannot precede start)', () => {
    expect(existingEndDateMin('2026-08-15', today)).toBe('2026-08-15');
  });

  it('returns today when the start equals today', () => {
    expect(existingEndDateMin(today, today)).toBe(today);
  });

  it('falls back to today when the start is unset', () => {
    expect(existingEndDateMin('', today)).toBe(today);
  });
});
