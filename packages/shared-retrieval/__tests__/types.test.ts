import { describe, expect, it } from 'vitest';
import type { RetrievalCtx, RetrievalHit, Retriever } from '../src/index.ts';

describe('@seta/shared-retrieval types', () => {
  it('exposes the Retriever, RetrievalHit, RetrievalCtx surface', () => {
    const hit: RetrievalHit<{ id: number }> = {
      item: { id: 1 },
      score: 0.42,
      rank: 1,
      source: 'hybrid',
    };
    expect(hit.source).toBe('hybrid');

    const ctx: RetrievalCtx = {
      tenant_id: '00000000-0000-0000-0000-000000000000',
      actor: { userId: 'u', tenantId: 't' },
    };
    expect(ctx.tenant_id).toBeDefined();

    const r: Retriever<{ q: string }, { id: number }> = {
      query: async () => [hit],
    };
    expect(typeof r.query).toBe('function');
  });
});
