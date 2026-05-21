import { describe, expect, it } from 'vitest';
import { countTokens } from '../src/tokens.ts';

describe('countTokens', () => {
  it('counts the empty string as 0 tokens', () => {
    expect(countTokens('')).toBe(0);
  });

  it('counts a short ASCII string with cl100k_base', () => {
    // "hello world" → 2 tokens under cl100k_base.
    expect(countTokens('hello world')).toBe(2);
  });

  it('treats source identically across calls (cache is internal)', () => {
    const s = 'Title: foo\nDescription: bar baz qux';
    const a = countTokens(s);
    const b = countTokens(s);
    expect(a).toBe(b);
    expect(a).toBeGreaterThan(0);
  });
});
