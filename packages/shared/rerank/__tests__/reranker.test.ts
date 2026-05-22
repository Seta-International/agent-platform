import { describe, expect, it } from 'vitest';
import type { RerankedHit, Reranker } from '../src/index.ts';

describe('@seta/shared-rerank types', () => {
  it('exposes the Reranker interface and RerankedHit shape', () => {
    const reranker: Reranker = {
      providerId: 'fake',
      async rescore(_query, hits) {
        return hits.map((h, i) => ({
          ...h,
          rerankScore: 1 - i / 10,
          reranker: 'fake' as const,
        })) as RerankedHit<unknown>[];
      },
    };
    expect(reranker.providerId).toBe('fake');
  });
});
