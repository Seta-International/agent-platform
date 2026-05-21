import { describe, expect, it } from 'vitest';
import { sourceHash } from '../src/source-hash.ts';

describe('sourceHash', () => {
  it('is stable across runs for the same string', () => {
    expect(sourceHash('hello')).toBe(sourceHash('hello'));
  });

  it('differs when content differs', () => {
    expect(sourceHash('a')).not.toBe(sourceHash('b'));
  });

  it('produces a 64-char hex string (sha256)', () => {
    expect(sourceHash('x')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('pinned regression: matches the documented hash for "Title: foo\\nDescription: bar"', () => {
    expect(sourceHash('Title: foo\nDescription: bar')).toBe(
      '36ddc5b63bba42a563c8ccea77a8a2576b697d459e4d889328ed81ded615d460',
    );
  });
});
