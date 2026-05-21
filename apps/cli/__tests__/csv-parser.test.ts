import { describe, expect, it } from 'vitest';
import { mapPriority, mapStatus, splitIds } from '../src/commands/lib/csv-parser.ts';

describe('mapPriority', () => {
  it.each([
    ['1', 'urgent'],
    ['2', 'urgent'],
    ['3', 'important'],
    ['4', 'important'],
    ['5', 'medium'],
    ['6', 'medium'],
    ['7', 'low'],
    ['9', 'low'],
  ])('maps %s → %s', (input, expected) => {
    expect(mapPriority(input)).toBe(expected);
  });

  it('returns medium for NaN', () => {
    expect(mapPriority('')).toBe('medium');
    expect(mapPriority('abc')).toBe('medium');
  });

  it('returns urgent for 0', () => {
    expect(mapPriority('0')).toBe('urgent'); // 0 <= 2, so urgent
  });
});

describe('mapStatus', () => {
  it('maps done → completed', () => expect(mapStatus('done')).toBe('completed'));
  it('maps in progress → in_progress', () => expect(mapStatus('in progress')).toBe('in_progress'));
  it('maps todo → not_started', () => expect(mapStatus('todo')).toBe('not_started'));
  it('maps empty → not_started', () => expect(mapStatus('')).toBe('not_started'));
  it('maps unrecognised → not_started', () => expect(mapStatus('pending')).toBe('not_started'));
});

describe('splitIds', () => {
  it('splits comma-separated ids', () => expect(splitIds('a,b,c')).toEqual(['a', 'b', 'c']));
  it('trims whitespace', () => expect(splitIds(' a , b ')).toEqual(['a', 'b']));
  it('filters empty strings', () => expect(splitIds('a,,b')).toEqual(['a', 'b']));
  it('returns empty array for empty string', () => expect(splitIds('')).toEqual([]));
  it('returns single-element array for no commas', () => expect(splitIds('abc')).toEqual(['abc']));
});
