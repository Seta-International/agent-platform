import { describe, expect, it } from 'vitest';
import {
  assertProjectActiveForWeek,
  isProjectEndedForWeek,
} from '../../src/backend/domain/assert-project-active-for-week.ts';

describe('assertProjectActiveForWeek', () => {
  it('rejects a week that starts after the project already ended', () => {
    // iso week 30 of 2026 starts Monday 2026-07-20; project ended the week before.
    expect(() => assertProjectActiveForWeek('2026-07-17', 2026, 30)).toThrow(
      'This project ended 17-07-2026, before this reporting week started',
    );
  });

  it('allows the week the project ends in, even mid-week', () => {
    // iso week 29 of 2026 runs 2026-07-13..2026-07-19; project ends on the Wednesday.
    expect(() => assertProjectActiveForWeek('2026-07-15', 2026, 29)).not.toThrow();
  });

  it('allows a project with no end date', () => {
    expect(() => assertProjectActiveForWeek(null, 2026, 29)).not.toThrow();
  });

  it('allows a project ending well after the reporting week', () => {
    expect(() => assertProjectActiveForWeek('2027-01-01', 2026, 29)).not.toThrow();
  });
});

describe('isProjectEndedForWeek', () => {
  it('is true once the project ended before the reporting week started', () => {
    expect(isProjectEndedForWeek('2026-07-17', 2026, 30)).toBe(true);
  });

  it('is false for the week the project ends in', () => {
    expect(isProjectEndedForWeek('2026-07-15', 2026, 29)).toBe(false);
  });

  it('is false when there is no end date', () => {
    expect(isProjectEndedForWeek(null, 2026, 29)).toBe(false);
  });
});
