import { describe, expect, it } from 'vitest';
import { mapPriorityNumber, mapStatusFields, splitIds } from '../src/commands/lib/csv-parser.ts';

describe('mapPriorityNumber', () => {
  it.each([
    ['1', 1],
    ['2', 1],
    ['3', 3],
    ['4', 3],
    ['5', 5],
    ['6', 5],
    ['7', 9],
    ['9', 9],
  ] as const)('maps %s → %s', (input, expected) => {
    expect(mapPriorityNumber(input)).toBe(expected);
  });

  it('returns 5 (medium) for NaN', () => {
    expect(mapPriorityNumber('')).toBe(5);
    expect(mapPriorityNumber('abc')).toBe(5);
  });

  it('returns 1 (urgent) for 0', () => {
    expect(mapPriorityNumber('0')).toBe(1); // 0 <= 2, so urgent
  });
});

describe('mapStatusFields', () => {
  it('maps done → percent_complete=100', () =>
    expect(mapStatusFields('done')).toEqual({ percent_complete: 100, is_deferred: false }));
  it('maps in progress → percent_complete=50', () =>
    expect(mapStatusFields('in progress')).toEqual({ percent_complete: 50, is_deferred: false }));
  it('maps todo → percent_complete=0', () =>
    expect(mapStatusFields('todo')).toEqual({ percent_complete: 0, is_deferred: false }));
  it('maps empty → percent_complete=0', () =>
    expect(mapStatusFields('')).toEqual({ percent_complete: 0, is_deferred: false }));
  it('maps unrecognised → percent_complete=0', () =>
    expect(mapStatusFields('pending')).toEqual({ percent_complete: 0, is_deferred: false }));
});

describe('splitIds', () => {
  it('splits comma-separated ids', () => expect(splitIds('a,b,c')).toEqual(['a', 'b', 'c']));
  it('trims whitespace', () => expect(splitIds(' a , b ')).toEqual(['a', 'b']));
  it('filters empty strings', () => expect(splitIds('a,,b')).toEqual(['a', 'b']));
  it('returns empty array for empty string', () => expect(splitIds('')).toEqual([]));
  it('returns single-element array for no commas', () => expect(splitIds('abc')).toEqual(['abc']));
});
