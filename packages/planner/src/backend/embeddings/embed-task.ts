import type { PgVector } from '@mastra/pg';
import {
  countTokens,
  type EmbeddingProvider,
  embedMany,
  sourceHash,
} from '@seta/shared-embeddings';
import pino from 'pino';
import { getTaskForEmbedding } from '../domain/get-task-for-embedding.ts';
import { recordEmbedTaskSkipped } from '../observability.ts';
import { fitsInWindow, MAX_SOURCE_TOKENS } from './chunking.ts';
import { buildTaskSource } from './source.ts';
import {
  ensurePlannerVectorIndex,
  PLANNER_VECTOR_INDEX,
  type TaskVectorMetadata,
  taskVectorId,
} from './vector-store.ts';

const log = pino({ name: 'planner/embed-task' });

export interface EmbedTaskPayload {
  tenant_id: string;
  task_id: string;
  event_id: string;
}

export interface EmbedTaskDeps {
  provider: EmbeddingProvider;
  /**
   * Mastra-owned vector store. Tests inject a per-database instance; the worker
   * resolves the lazy singleton from getPlannerVectorStore(process.env.DATABASE_URL).
   */
  pgVector: PgVector;
}

/**
 * CDC pipeline handler for planner.embed_task jobs.
 *
 *   1. Fetch task (skips soft-deleted rows via getTaskForEmbedding).
 *   2. If missing → DELETE the vector row, exit.
 *   3. Build source → sha256 hash.
 *   4. Hash-gate: skip if source unchanged (read metadata->source_hash via
 *      PgVector's metadata-only query).
 *   5. Embed source.
 *   6. UPSERT vector with deterministic vector_id = "${tenant_id}:${task_id}".
 *      Mastra's createIndex(cosine, HNSW) is invoked lazily once per process.
 */
export async function embedTask(payload: EmbedTaskPayload, deps: EmbedTaskDeps): Promise<void> {
  const { tenant_id, task_id } = payload;
  const { provider, pgVector } = deps;

  const task = await getTaskForEmbedding({ tenant_id, task_id });

  if (task == null) {
    // Ensure the index/table exists before issuing a delete — first-ever call
    // with no prior writes would otherwise error on a missing relation.
    await ensurePlannerVectorIndex(pgVector);
    await pgVector
      .deleteVector({ indexName: PLANNER_VECTOR_INDEX, id: taskVectorId(tenant_id, task_id) })
      .catch((err: unknown) => {
        // Idempotent delete: missing-row errors are not fatal (the CDC pipeline
        // may fire embed jobs for tasks that were never embedded — e.g. those
        // whose source exceeded MAX_SOURCE_TOKENS and were skipped).
        log.debug(
          { event: 'planner.embed_task.delete_skipped', tenant_id, task_id, err },
          'deleteVector returned non-fatal error (likely missing row)',
        );
      });
    return;
  }

  const source = buildTaskSource(task);

  if (!fitsInWindow(source)) {
    log.warn(
      {
        event: 'planner.embed_task.skipped',
        reason: 'input_too_long',
        tenant_id,
        task_id,
        token_count: countTokens(source),
        max_tokens: MAX_SOURCE_TOKENS,
      },
      'embed_task skipped: source exceeds MAX_SOURCE_TOKENS',
    );
    recordEmbedTaskSkipped('input_too_long');
    return;
  }

  const hash = sourceHash(source);

  await ensurePlannerVectorIndex(pgVector);

  // Hash-gate: skip the embed call if the stored chunk's source_hash matches.
  // PgVector.query without queryVector performs a metadata-only fetch.
  const existing = await pgVector.query({
    indexName: PLANNER_VECTOR_INDEX,
    filter: { tenant_id: { $eq: tenant_id }, task_id: { $eq: task_id } },
    topK: 1,
  });
  if (existing[0]?.metadata?.source_hash === hash) return;

  const [vector] = await embedMany(provider, [source]);
  if (!vector) throw new Error('embedMany returned no vector');

  const metadata: TaskVectorMetadata = {
    tenant_id,
    task_id,
    plan_id: task.plan_id,
    chunk_text: source,
    source_hash: hash,
    model_id: provider.modelId,
    embedded_at: new Date().toISOString(),
  };

  await pgVector.upsert({
    indexName: PLANNER_VECTOR_INDEX,
    vectors: [vector],
    metadata: [metadata],
    ids: [taskVectorId(tenant_id, task_id)],
  });
}
