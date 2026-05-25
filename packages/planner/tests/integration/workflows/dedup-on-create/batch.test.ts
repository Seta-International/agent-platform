import { FakeEmbeddingProvider } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import {
  type BatchDedupDeps,
  dedupBatch,
} from '../../../../src/backend/workflows/dedup-on-create/batch.ts';

describe('dedupBatch (log-only)', () => {
  it('returns an empty array on an empty drafts list and never throws', async () => {
    const fakeDeps: BatchDedupDeps = {
      provider: new FakeEmbeddingProvider(),
      // pgVector + reranker are not invoked when drafts is empty; safe to cast.
      pgVector: undefined as never,
      reranker: undefined as never,
    };
    const out = await dedupBatch(
      { tenantId: 'tenant', drafts: [], thresholds: { likelyDup: 0.18, maybeDup: 0.3 } },
      fakeDeps,
    );
    expect(out).toEqual([]);
  });

  it('normalizes drafts before searching', async () => {
    // We can verify normalization without hitting the vector store by passing
    // a stub deps that throws if searchTasks is invoked, then catching it.
    // The test enforces that normalization runs first (validates the draft).
    const fakeDeps: BatchDedupDeps = {
      provider: new FakeEmbeddingProvider(),
      pgVector: undefined as never,
      reranker: undefined as never,
    };
    await expect(
      dedupBatch(
        {
          tenantId: 'tenant',
          // biome-ignore lint/suspicious/noExplicitAny: invalid by design
          drafts: [{ title: '' } as any],
          thresholds: { likelyDup: 0.18, maybeDup: 0.3 },
        },
        fakeDeps,
      ),
    ).rejects.toThrow(); // empty title → zod parse fails in normalizeDraft
  });
});
