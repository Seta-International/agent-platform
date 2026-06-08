import { PgVector } from '@mastra/pg';

export const KNOWLEDGE_VECTOR_NAMESPACE = 'knowledge_rag';
export const KNOWLEDGE_VECTOR_INDEX = 'chunks';
export const KNOWLEDGE_VECTOR_DIMENSION = 1536;

export interface KnowledgeChunkVectorMetadata {
  tenant_id: string;
  file_id: string;
  chunk_ordinal: number;
  chunk_text: string;
  filename: string;
  page_hint: string | null;
  model_id: string;
  embedded_at: string;
  // Thread-scoping: present on every chunk vector so retrieval can filter
  // `{ tenant_id, thread_id }` in pgvector. thread_id is null for KB files.
  thread_id: string | null;
  origin: 'knowledge_base' | 'chat';
}

export function knowledgeVectorId(tenantId: string, fileId: string, chunkOrdinal: number): string {
  return `${tenantId}:${fileId}:${chunkOrdinal}`;
}

interface CachedStore {
  store: PgVector;
  databaseUrl: string;
  indexReady: Promise<void> | null;
}

let cached: CachedStore | null = null;

export function getKnowledgeVectorStore(databaseUrl: string): PgVector {
  if (cached && cached.databaseUrl === databaseUrl) return cached.store;
  if (cached && cached.databaseUrl !== databaseUrl) {
    void cached.store.disconnect().catch(() => {});
    cached = null;
  }
  const store = new PgVector({
    id: 'knowledge-chunks',
    connectionString: databaseUrl,
    schemaName: KNOWLEDGE_VECTOR_NAMESPACE,
  });
  cached = { store, databaseUrl, indexReady: null };
  return store;
}

export function ensureKnowledgeVectorIndex(store: PgVector): Promise<void> {
  if (cached?.store === store && cached.indexReady) return cached.indexReady;
  const promise = store.createIndex({
    indexName: KNOWLEDGE_VECTOR_INDEX,
    dimension: KNOWLEDGE_VECTOR_DIMENSION,
    metric: 'cosine',
    indexConfig: { type: 'hnsw', hnsw: { m: 16, efConstruction: 200 } },
  });
  if (cached?.store === store) cached.indexReady = promise;
  return promise;
}

export async function resetKnowledgeVectorStore(): Promise<void> {
  if (!cached) return;
  const { store } = cached;
  cached = null;
  await store.disconnect().catch(() => {});
}
