import { describe, expect, it } from 'vitest';
import {
  existingAllocationErrors,
  TARGET_ERROR,
  targetAllocationErrors,
} from '../../src/pages/ra-shared.tsx';

const TODAY = '2026-07-10';
const span = (over: Partial<{ project_id: string; date_from: string; date_to: string }> = {}) => ({
  project_id: 'p1',
  date_from: '2026-07-10',
  date_to: '2026-08-10',
  ...over,
});

describe('targetAllocationErrors', () => {
  it('flags a start date in the past', () => {
    expect(targetAllocationErrors([span({ date_from: '2026-07-09' })], [], TODAY)).toEqual([
      TARGET_ERROR.pastStart,
    ]);
  });

  it('allows a start date of today or later', () => {
    expect(targetAllocationErrors([span({ date_from: '2026-07-10' })], [], TODAY)).toEqual([null]);
    expect(
      targetAllocationErrors([span({ date_from: '2026-09-01', date_to: '2026-10-01' })], [], TODAY),
    ).toEqual([null]);
  });

  it('flags overlap with an existing allocation on the same project', () => {
    const existing = [{ project_id: 'p1', date_from: '2026-06-01', date_to: '2026-07-20' }];
    // target 2026-07-10 → 2026-08-10 overlaps existing 2026-06-01 → 2026-07-20.
    expect(targetAllocationErrors([span()], existing, TODAY)).toEqual([TARGET_ERROR.overlap]);
  });

  it('does not flag a same-project allocation whose dates do not overlap', () => {
    const existing = [{ project_id: 'p1', date_from: '2026-01-01', date_to: '2026-07-01' }];
    expect(targetAllocationErrors([span()], existing, TODAY)).toEqual([null]);
  });

  it('does not flag a different project even when dates overlap', () => {
    const existing = [{ project_id: 'p2', date_from: '2026-06-01', date_to: '2026-08-01' }];
    expect(targetAllocationErrors([span({ project_id: 'p1' })], existing, TODAY)).toEqual([null]);
  });

  it('flags two target rows on the same project that overlap each other', () => {
    const targets = [
      span({ date_from: '2026-07-10', date_to: '2026-08-10' }),
      span({ date_from: '2026-08-01', date_to: '2026-09-01' }),
    ];
    expect(targetAllocationErrors(targets, [], TODAY)).toEqual([
      TARGET_ERROR.overlap,
      TARGET_ERROR.overlap,
    ]);
  });

  it('flags a missing start date', () => {
    expect(targetAllocationErrors([span({ date_from: '' })], [], TODAY)).toEqual([
      TARGET_ERROR.missingStartDate,
    ]);
  });

  it('flags a missing end date', () => {
    expect(targetAllocationErrors([span({ date_to: '' })], [], TODAY)).toEqual([
      TARGET_ERROR.missingEndDate,
    ]);
  });

  it('flags missing both start and end date', () => {
    expect(targetAllocationErrors([span({ date_from: '', date_to: '' })], [], TODAY)).toEqual([
      TARGET_ERROR.missingDates,
    ]);
  });

  it('flags an end date before start date', () => {
    expect(
      targetAllocationErrors([span({ date_from: '2026-07-20', date_to: '2026-07-10' })], [], TODAY),
    ).toEqual([TARGET_ERROR.invalidEndDate]);
  });
});

const eRow = (
  over: Partial<{
    id: string;
    project_id: string;
    date_from: string;
    date_to: string;
    locked: boolean;
  }> = {},
) => ({
  id: 'a1',
  project_id: 'p1',
  date_from: '2026-08-01',
  date_to: '2026-09-01',
  locked: false,
  ...over,
});

describe('existingAllocationErrors', () => {
  it('flags an editable row whose start was moved into the past', () => {
    expect(existingAllocationErrors([eRow({ date_from: '2026-07-09' })], TODAY)).toEqual({
      a1: TARGET_ERROR.pastStart,
    });
  });

  it('does not flag a locked row that already started in the past', () => {
    expect(
      existingAllocationErrors([eRow({ date_from: '2026-01-01', locked: true })], TODAY),
    ).toEqual({ a1: null });
  });

  it('flags two rows on the same project whose dates overlap', () => {
    const rows = [
      eRow({ id: 'a1', date_from: '2026-08-01', date_to: '2026-09-01' }),
      eRow({ id: 'a2', date_from: '2026-08-15', date_to: '2026-10-01' }),
    ];
    expect(existingAllocationErrors(rows, TODAY)).toEqual({
      a1: TARGET_ERROR.overlap,
      a2: TARGET_ERROR.overlap,
    });
  });

  it('does not flag distinct projects or non-overlapping ranges', () => {
    const rows = [
      eRow({ id: 'a1', project_id: 'p1', date_from: '2026-08-01', date_to: '2026-09-01' }),
      eRow({ id: 'a2', project_id: 'p2', date_from: '2026-08-15', date_to: '2026-10-01' }),
    ];
    expect(existingAllocationErrors(rows, TODAY)).toEqual({ a1: null, a2: null });
  });
});
