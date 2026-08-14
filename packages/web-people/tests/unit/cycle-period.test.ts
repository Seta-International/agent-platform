import { describe, expect, it } from 'vitest';
import { CYCLE_PERIOD_MONTHS, cyclePeriodOptions } from '../../src/nav/cycle-period.ts';

describe('cyclePeriodOptions', () => {
  it('offers exactly the last five cycles, newest first', () => {
    const options = cyclePeriodOptions('2026-08', '2026-08');
    expect(options).toHaveLength(CYCLE_PERIOD_MONTHS);
    expect(options.map((o) => o.value)).toEqual([
      '2026-08',
      '2026-07',
      '2026-06',
      '2026-05',
      '2026-04',
    ]);
    expect(options[0]?.label).toBe('Aug 2026');
  });

  it('walks back across a year boundary', () => {
    expect(cyclePeriodOptions('2026-02', '2026-02').map((o) => o.value)).toEqual([
      '2026-02',
      '2026-01',
      '2025-12',
      '2025-11',
      '2025-10',
    ]);
  });

  it('keeps a pinned older month selectable without dropping the window', () => {
    // A deep link to a cycle outside the window must not render an empty selection.
    const options = cyclePeriodOptions('2026-08', '2025-11');
    expect(options.map((o) => o.value)).toEqual([
      '2026-08',
      '2026-07',
      '2026-06',
      '2026-05',
      '2026-04',
      '2025-11',
    ]);
  });

  it('does not duplicate a selection already inside the window', () => {
    const options = cyclePeriodOptions('2026-08', '2026-06');
    expect(options.map((o) => o.value)).toEqual([
      '2026-08',
      '2026-07',
      '2026-06',
      '2026-05',
      '2026-04',
    ]);
  });
});
