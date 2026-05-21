interface Entry {
  vector: number[];
  expiresAt: number;
}

export interface EmbedQueryCacheOptions {
  maxEntries: number;
  ttlMs: number;
}

/**
 * A small per-process LRU+TTL cache for embedded queries. JavaScript's Map preserves
 * insertion order, so LRU is implemented by deleting and reinserting on access —
 * the most-recently-used entry ends at the back of the iteration order, and the
 * oldest sits at the front for eviction.
 *
 * Not thread-safe across processes — one provider call per (model, query) per
 * process per TTL window is the budget.
 *
 * Key separator is a space. Model IDs follow `provider:variant` convention and
 * cannot contain spaces, so collisions are not possible in practice.
 *
 * Concurrent get() calls for the same missing key will each fire compute() —
 * in-flight deduplication is out of scope for this slice.
 */
export class EmbedQueryCache {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly opts: EmbedQueryCacheOptions) {}

  async get(modelId: string, query: string, compute: () => Promise<number[]>): Promise<number[]> {
    const key = `${modelId} ${query}`;
    const now = Date.now();

    const cached = this.entries.get(key);
    if (cached && cached.expiresAt > now) {
      // Promote to most-recently-used by reinserting at the back.
      this.entries.delete(key);
      this.entries.set(key, cached);
      return cached.vector;
    }
    if (cached) this.entries.delete(key);

    const vector = await compute();
    this.entries.set(key, { vector, expiresAt: now + this.opts.ttlMs });

    while (this.entries.size > this.opts.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }

    return vector;
  }
}
