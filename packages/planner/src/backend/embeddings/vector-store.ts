import { PgVector } from '@mastra/pg';

/**
 * Mastra-owned vector store for planner task embeddings.
 *
 * Layout:
 *   schema = "planner_rag"   — outside Drizzle's planner schemaFilter; PgVector
 *                              creates and manages the schema, table, and index.
 *   index  = "task_embeddings" — Mastra resolves this to a table named
 *                                planner_rag.task_embeddings with the standard
 *                                Mastra columns (vector_id UUID PK, embedding
 *                                vector(1536), metadata JSONB).
 *
 * The index is built with cosine distance and HNSW (m=16, efConstruction=64) —
 * matching the per-tenant HNSW config previously provisioned by
 * ensureTenantPartition() on the dropped planner.task_embeddings.
 *
 * Vector IDs are deterministic: "${tenant_id}:${task_id}". Upserts therefore
 * idempotently replace the prior chunk for a task without explicit DELETE.
 *
 * Metadata is the source of truth for tenant_id, plan_id, chunk_text, hash, and
 * model_id. Filtering uses Mastra's MongoDB-style operators ({ tenant_id: ... }).
 */

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

/** Build the deterministic vector_id for a (tenant_id, task_id) pair. */
export function taskVectorId(tenantId: string, taskId: string): string {
  return `${tenantId}:${taskId}`;
}

interface CachedStore {
  store: PgVector;
  databaseUrl: string;
  indexReady: Promise<void> | null;
}

let cached: CachedStore | null = null;

/**
 * Lazily build (or return) the module-level PgVector singleton for the planner
 * embeddings. Tests should call resetPlannerVectorStore() between runs and
 * inject their own instance via the deps parameter on embedTask/searchTasks.
 */
export function getPlannerVectorStore(databaseUrl: string): PgVector {
  if (cached && cached.databaseUrl === databaseUrl) return cached.store;
  // If the URL changed (test fixture rotation), drop the old singleton.
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

/**
 * Ensure the cosine HNSW index exists for the given PgVector instance. Mastra's
 * createIndex is internally idempotent (cached by config hash) — the promise
 * cache here just avoids the cache lookup hit on every embed call.
 */
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

/** Tests only — drops the cached singleton so the next call rebuilds it. */
export async function resetPlannerVectorStore(): Promise<void> {
  if (!cached) return;
  const { store } = cached;
  cached = null;
  await store.disconnect().catch(() => {});
}
