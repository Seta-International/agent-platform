import { describe, expect, it } from 'vitest';
import { initialsOf } from '../../../src/lib/initials';

describe('initialsOf', () => {
  it('takes first letters of up to two tokens, uppercased', () => {
    expect(initialsOf('Vo Thi Huong')).toBe('VT');
  });
  it('handles a single name', () => {
    expect(initialsOf('Operation')).toBe('O');
  });
  it('collapses extra whitespace', () => {
    expect(initialsOf('  jane   doe  ')).toBe('JD');
  });
  it('returns empty string for empty input', () => {
    expect(initialsOf('')).toBe('');
  });
});
