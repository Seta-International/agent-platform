import { describe, expect, it } from 'vitest';
import { assertWithinProjectRange } from '../../src/backend/domain/assert-within-project-range.ts';

describe('assertWithinProjectRange', () => {
  it('reports an out-of-range end date in dd-mm-yyyy with a capitalized "Allocation" prefix', () => {
    expect(() =>
      assertWithinProjectRange({
        project_date_from: '2026-01-01',
        project_date_to: '2026-06-30',
        date_from: '2026-01-01',
        date_to: '2028-12-12',
      }),
    ).toThrow('Allocation end 12-12-2028 is after the project end 30-06-2026');
  });

  it('reports an out-of-range start date in dd-mm-yyyy with a capitalized "Allocation" prefix', () => {
    expect(() =>
      assertWithinProjectRange({
        project_date_from: '2026-03-01',
        project_date_to: '2026-10-31',
        date_from: '2026-01-01',
        date_to: '2026-06-30',
      }),
    ).toThrow('Allocation start 01-01-2026 is before the project start 01-03-2026');
  });
});
