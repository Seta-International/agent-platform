import { createHash } from 'node:crypto';

interface Entry<T> {
  value: T;
  expiresAt: number;
}

export interface RerankCacheOptions {
  maxEntries: number;
  ttlMs: number;
}

/**
 * Per-process LRU+TTL cache for rerank results. Key is sha256(query + sorted doc_ids).
 *
 * The LLM calling search_tasks_semantic twice in one turn with the same query
 * (different filters) typically yields the same stage-1 doc id set on top —
 * cache hit avoids a redundant rerank call.
 */
export class RerankCache<T = unknown> {
  private readonly entries = new Map<string, Entry<T>>();
  private readonly opts: RerankCacheOptions;

  constructor(opts: RerankCacheOptions) {
    this.opts = opts;
  }

  async get(query: string, docIds: string[], compute: () => Promise<T>): Promise<T> {
    const key = this.keyFor(query, docIds);
    const now = Date.now();
    const hit = this.entries.get(key);
    if (hit && hit.expiresAt > now) {
      this.entries.delete(key);
      this.entries.set(key, hit);
      return hit.value;
    }
    if (hit) this.entries.delete(key);

    const value = await compute();
    this.entries.set(key, { value, expiresAt: now + this.opts.ttlMs });

    while (this.entries.size > this.opts.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
    return value;
  }

  private keyFor(query: string, docIds: string[]): string {
    const sortedIds = [...docIds].sort().join(',');
    return createHash('sha256').update(`${query}|${sortedIds}`).digest('hex');
  }
}
