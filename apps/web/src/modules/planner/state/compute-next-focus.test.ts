import { describe, expect, it } from 'vitest';
import { computeNextFocus } from './compute-next-focus';

const structure = {
  buckets: [
    { id: 'b1', cardIds: ['c1', 'c2', 'c3'] },
    { id: 'b2', cardIds: [] }, // empty — should be skipped for left/right
    { id: 'b3', cardIds: ['c4', 'c5'] },
  ],
};

describe('computeNextFocus', () => {
  it('returns first card of first non-empty bucket when prev is null', () => {
    expect(computeNextFocus(null, 'down', structure)).toBe('c1');
  });

  it('returns null when all buckets are empty and prev is null', () => {
    expect(computeNextFocus(null, 'down', { buckets: [{ id: 'b1', cardIds: [] }] })).toBeNull();
  });

  it('moves down within a bucket', () => {
    expect(computeNextFocus('c1', 'down', structure)).toBe('c2');
    expect(computeNextFocus('c2', 'down', structure)).toBe('c3');
  });

  it('stays at last card when moving down at bottom', () => {
    expect(computeNextFocus('c3', 'down', structure)).toBe('c3');
  });

  it('moves up within a bucket', () => {
    expect(computeNextFocus('c3', 'up', structure)).toBe('c2');
    expect(computeNextFocus('c2', 'up', structure)).toBe('c1');
  });

  it('stays at first card when moving up at top', () => {
    expect(computeNextFocus('c1', 'up', structure)).toBe('c1');
  });

  it('moves right to the first card of the next non-empty bucket', () => {
    // b2 is empty, so right from b1 should land on b3's first card
    expect(computeNextFocus('c1', 'right', structure)).toBe('c4');
  });

  it('stays put when moving right at the last bucket', () => {
    expect(computeNextFocus('c4', 'right', structure)).toBe('c4');
  });

  it('moves left to the first card of the previous non-empty bucket', () => {
    // b2 is empty, so left from b3 should land on b1's first card
    expect(computeNextFocus('c4', 'left', structure)).toBe('c1');
  });

  it('stays put when moving left at the first bucket', () => {
    expect(computeNextFocus('c1', 'left', structure)).toBe('c1');
  });

  it('returns prev when focused card id is stale (not in any bucket)', () => {
    expect(computeNextFocus('stale-id', 'down', structure)).toBe('stale-id');
  });
});
