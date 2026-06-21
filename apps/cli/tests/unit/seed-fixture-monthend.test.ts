import { describe, expect, it } from 'vitest';
import { monthEnd } from '../../src/commands/seed-fixture/phase-pm.ts';

describe('monthEnd', () => {
  it('returns last day of February in a common year', () => {
    expect(monthEnd('2026-02')).toBe('2026-02-28');
  });

  it('returns last day of February in a leap year', () => {
    expect(monthEnd('2024-02')).toBe('2024-02-29');
  });

  it('returns last day of April (30-day month)', () => {
    expect(monthEnd('2026-04')).toBe('2026-04-30');
  });

  it('returns last day of May (31-day month)', () => {
    expect(monthEnd('2026-05')).toBe('2026-05-31');
  });

  it('returns last day of December', () => {
    expect(monthEnd('2026-12')).toBe('2026-12-31');
  });
});
