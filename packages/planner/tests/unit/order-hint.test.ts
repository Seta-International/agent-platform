import { describe, expect, it } from 'vitest';
import { hintBetween, hintsForN } from '../../src/backend/domain/order-hint.ts';

describe('hintBetween — native path (fractional-indexing)', () => {
  it('produces an initial key when both endpoints are null', () => {
    const h = hintBetween(null, null);
    expect(h).toBe('a0');
  });

  it('produces a key between two keys', () => {
    const h = hintBetween('a0', 'a1');
    expect(h > 'a0').toBe(true);
    expect(h < 'a1').toBe(true);
  });

  it('throws when prev >= next (collision)', () => {
    expect(() => hintBetween('a1', 'a0')).toThrow();
  });

  it('defaults to native when planExternalSource is omitted', () => {
    expect(hintBetween(null, null)).toBe(hintBetween(null, null, 'native'));
  });
});

describe('hintBetween — m365 directive path', () => {
  it('returns " !" when both endpoints are null', () => {
    expect(hintBetween(null, null, 'm365')).toBe(' !');
  });

  it('returns "<prev> !" when only prev is set', () => {
    expect(hintBetween('5637', null, 'm365')).toBe('5637 !');
  });

  it('returns " <next>!" when only next is set', () => {
    expect(hintBetween(null, '5637', 'm365')).toBe(' 5637!');
  });

  it('returns "<prev> <next>!" between two existing items', () => {
    expect(hintBetween('5637', 'adhg', 'm365')).toBe('5637 adhg!');
  });

  it('handles canonical short hints unchanged', () => {
    expect(hintBetween('A6673H', 'Ejkl', 'm365')).toBe('A6673H Ejkl!');
  });
});

describe('hintsForN — native', () => {
  it('produces N strictly-increasing keys', () => {
    const keys = hintsForN(5);
    expect(keys).toHaveLength(5);
    for (let i = 0; i < keys.length - 1; i++) {
      expect(keys[i]! < keys[i + 1]!).toBe(true);
    }
  });
});

describe('hintsForN — m365', () => {
  it('produces N chained directive keys', () => {
    const keys = hintsForN(3, 'm365');
    expect(keys).toHaveLength(3);
    expect(keys[0]).toBe(' !');
    expect(keys[1]).toBe(' ! !');
    expect(keys[2]).toBe(' ! ! !');
  });
});
