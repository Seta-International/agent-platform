import { describe, expect, it } from 'vitest';
import type { RerankedHit, Reranker } from '../src/index.ts';

describe('@seta/shared-retrieval rerank types', () => {
  it('exposes the Reranker interface and RerankedHit shape', () => {
    const reranker = {
      providerId: 'noop',
      async rescore<T>(_query: string, hits: Parameters<Reranker['rescore']>[1]) {
        return hits.map((h, i) => ({
          ...h,
          rerankScore: 1 - i / 10,
          reranker: 'noop' as const,
        })) as RerankedHit<T>[];
      },
    } satisfies Reranker;
    expect(reranker.providerId).toBe('noop');
  });
});
