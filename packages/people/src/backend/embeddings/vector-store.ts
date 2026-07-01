import { PgVector } from '@mastra/pg';

export const PEOPLE_VECTOR_NAMESPACE = 'people_rag';
export const PEOPLE_VECTOR_INDEX = 'person_profile_embeddings';
export const PEOPLE_VECTOR_DIMENSION = 1536;

export interface PersonProfileVectorMetadata {
  tenant_id: string;
  person_id: string;
  skills: string[];
  source_hash: string;
  model_id: string;
  embedded_at: string;
}

export function personProfileVectorId(tenantId: string, personId: string): string {
  return `${tenantId}:${personId}`;
}

interface CachedStore {
  store: PgVector;
  databaseUrl: string;
  indexReady: Promise<void> | null;
}

let cached: CachedStore | null = null;

export function getPeopleVectorStore(databaseUrl: string): PgVector {
  if (cached && cached.databaseUrl === databaseUrl) return cached.store;
  if (cached && cached.databaseUrl !== databaseUrl) {
    void cached.store.disconnect().catch(() => {});
    cached = null;
  }
  const store = new PgVector({
    id: 'people-person-profile-embeddings',
    connectionString: databaseUrl,
    schemaName: PEOPLE_VECTOR_NAMESPACE,
  });
  cached = { store, databaseUrl, indexReady: null };
  return store;
}

export function ensurePeopleVectorIndex(store: PgVector): Promise<void> {
  if (cached?.store === store && cached.indexReady) return cached.indexReady;
  const promise = store.createIndex({
    indexName: PEOPLE_VECTOR_INDEX,
    dimension: PEOPLE_VECTOR_DIMENSION,
    metric: 'cosine',
    indexConfig: { type: 'hnsw', hnsw: { m: 16, efConstruction: 200 } },
  });
  if (cached?.store === store) cached.indexReady = promise;
  return promise;
}

export async function resetPeopleVectorStore(): Promise<void> {
  if (!cached) return;
  const { store } = cached;
  cached = null;
  await store.disconnect().catch(() => {});
}
