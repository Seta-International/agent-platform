import { PgVector } from '@mastra/pg';

export const PLANNER_VECTOR_NAMESPACE = 'planner_rag';
export const PLANNER_VECTOR_INDEX = 'task_embeddings';
export const PLANNER_VECTOR_DIMENSION = 1536;

export interface TaskVectorMetadata {
  tenant_id: string;
  task_id: string;
  plan_id: string;
  chunk_text: string;
  source_hash: string;
  model_id: string;
  embedded_at: string;
}

export function taskVectorId(tenantId: string, taskId: string): string {
  return `${tenantId}:${taskId}`;
}

interface CachedStore {
  store: PgVector;
  databaseUrl: string;
  indexReady: Promise<void> | null;
}

let cached: CachedStore | null = null;

export function getPlannerVectorStore(databaseUrl: string): PgVector {
  if (cached && cached.databaseUrl === databaseUrl) return cached.store;
  if (cached && cached.databaseUrl !== databaseUrl) {
    void cached.store.disconnect().catch(() => {});
    cached = null;
  }
  const store = new PgVector({
    id: 'planner-task-embeddings',
    connectionString: databaseUrl,
    schemaName: PLANNER_VECTOR_NAMESPACE,
  });
  cached = { store, databaseUrl, indexReady: null };
  return store;
}

export function ensurePlannerVectorIndex(store: PgVector): Promise<void> {
  if (cached?.store === store && cached.indexReady) return cached.indexReady;
  const promise = store.createIndex({
    indexName: PLANNER_VECTOR_INDEX,
    dimension: PLANNER_VECTOR_DIMENSION,
    metric: 'cosine',
    indexConfig: { type: 'hnsw', hnsw: { m: 16, efConstruction: 64 } },
  });
  if (cached?.store === store) cached.indexReady = promise;
  return promise;
}

export async function resetPlannerVectorStore(): Promise<void> {
  if (!cached) return;
  const { store } = cached;
  cached = null;
  await store.disconnect().catch(() => {});
}
