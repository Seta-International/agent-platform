import { describe, expect, it } from 'vitest';
import { rrfFuse } from '../src/rrf.ts';

describe('rrfFuse', () => {
  it('fuses two lists by reciprocal rank with k=60 default', () => {
    // FTS ranks: a=1, b=2, c=3
    // Vector ranks: c=1, a=2, d=3
    // Expected fused order: a (1/61 + 1/62), c (1/63 + 1/61), b (1/62 + 0), d (0 + 1/63)
    const fused = rrfFuse(
      [
        { rank: 1, id: 'a' },
        { rank: 2, id: 'b' },
        { rank: 3, id: 'c' },
      ],
      [
        { rank: 1, id: 'c' },
        { rank: 2, id: 'a' },
        { rank: 3, id: 'd' },
      ],
      (x) => x.id,
    );

    expect(fused.map((x) => x.id)).toEqual(['a', 'c', 'b', 'd']);
  });

  it('respects a custom k', () => {
    const fused = rrfFuse([{ rank: 1, id: 'x' }], [{ rank: 1, id: 'y' }], (x) => x.id, { k: 1 });
    // Both have score 1/(1+1) = 0.5 → stable order keeps first-list-first.
    expect(fused[0]?.id).toBe('x');
  });

  it('returns score field for downstream consumers', () => {
    const fused = rrfFuse([{ rank: 1, id: 'a' }], [], (x) => x.id);
    expect(fused[0]?.score).toBeCloseTo(1 / 61, 6);
  });
});
