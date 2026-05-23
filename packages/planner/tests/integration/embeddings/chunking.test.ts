import { countTokens } from '@seta/shared-embeddings';
import { describe, expect, it } from 'vitest';
import { fitsInWindow, MAX_SOURCE_TOKENS } from '../../../src/embeddings/chunking.ts';

describe('fitsInWindow', () => {
  it('returns true for empty string', () => {
    expect(fitsInWindow('')).toBe(true);
  });

  it('returns true for short string well under the limit', () => {
    expect(fitsInWindow('Title: hello\nDescription: short body')).toBe(true);
  });

  it('returns true at exactly MAX_SOURCE_TOKENS tokens (inclusive)', () => {
    let s = 'word';
    while (countTokens(s) < MAX_SOURCE_TOKENS) {
      s += ' word';
    }
    while (countTokens(s) > MAX_SOURCE_TOKENS) {
      s = s.slice(0, -5);
    }
    expect(countTokens(s)).toBe(MAX_SOURCE_TOKENS);
    expect(fitsInWindow(s)).toBe(true);
  });

  it('returns false once token count crosses MAX_SOURCE_TOKENS', () => {
    let s = 'word';
    while (countTokens(s) <= MAX_SOURCE_TOKENS) {
      s += ' word';
    }
    expect(countTokens(s)).toBeGreaterThan(MAX_SOURCE_TOKENS);
    expect(fitsInWindow(s)).toBe(false);
  });

  it('MAX_SOURCE_TOKENS is 1000', () => {
    expect(MAX_SOURCE_TOKENS).toBe(1000);
  });
});
