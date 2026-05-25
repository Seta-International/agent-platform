import { PgVector } from '@mastra/pg';

export const IDENTITY_VECTOR_NAMESPACE = 'identity_rag';
export const IDENTITY_VECTOR_INDEX = 'user_profile_embeddings';
export const IDENTITY_VECTOR_DIMENSION = 1536;

export interface UserProfileVectorMetadata {
  tenant_id: string;
  user_id: string;
  display_name: string;
  email: string;
  skills: string[];
  source_hash: string;
  model_id: string;
  embedded_at: string;
}

export function userProfileVectorId(tenantId: string, userId: string): string {
  return `${tenantId}:${userId}`;
}

interface CachedStore {
  store: PgVector;
  databaseUrl: string;
  indexReady: Promise<void> | null;
}

let cached: CachedStore | null = null;

export function getIdentityVectorStore(databaseUrl: string): PgVector {
  if (cached && cached.databaseUrl === databaseUrl) return cached.store;
  if (cached && cached.databaseUrl !== databaseUrl) {
    void cached.store.disconnect().catch(() => {});
    cached = null;
  }
  const store = new PgVector({
    id: 'identity-user-profile-embeddings',
    connectionString: databaseUrl,
    schemaName: IDENTITY_VECTOR_NAMESPACE,
  });
  cached = { store, databaseUrl, indexReady: null };
  return store;
}

export function ensureIdentityVectorIndex(store: PgVector): Promise<void> {
  if (cached?.store === store && cached.indexReady) return cached.indexReady;
  const promise = store.createIndex({
    indexName: IDENTITY_VECTOR_INDEX,
    dimension: IDENTITY_VECTOR_DIMENSION,
    metric: 'cosine',
    indexConfig: { type: 'hnsw', hnsw: { m: 16, efConstruction: 200 } },
  });
  if (cached?.store === store) cached.indexReady = promise;
  return promise;
}

export async function resetIdentityVectorStore(): Promise<void> {
  if (!cached) return;
  const { store } = cached;
  cached = null;
  await store.disconnect().catch(() => {});
}
