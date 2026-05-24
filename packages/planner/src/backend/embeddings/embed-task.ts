import { ensureTenantPartition } from '@seta/shared-db';
import {
  countTokens,
  type EmbeddingProvider,
  embedMany,
  sourceHash,
} from '@seta/shared-embeddings';
import type { Pool } from 'pg';
import pino from 'pino';
import { getTaskForEmbedding } from '../domain/get-task-for-embedding.ts';
import { recordEmbedTaskSkipped } from '../observability.ts';
import { fitsInWindow, MAX_SOURCE_TOKENS } from './chunking.ts';
import { buildTaskSource } from './source.ts';

const log = pino({ name: 'planner/embed-task' });

export interface EmbedTaskPayload {
  tenant_id: string;
  task_id: string;
  event_id: string;
}

export interface EmbedTaskDeps {
  pool: Pool;
  provider: EmbeddingProvider;
}

/**
 * CDC pipeline handler for planner.embed_task jobs.
 *
 *   1. Fetch task (skips soft-deleted rows via getTaskForEmbedding).
 *   2. If missing → DELETE any existing row, exit.
 *   3. Build source → sha256 hash.
 *   4. Hash-gate: skip if source unchanged.
 *   5. Ensure per-tenant HNSW partition exists.
 *   6. Embed source.
 *   7. UPSERT row.
 */
export async function embedTask(payload: EmbedTaskPayload, deps: EmbedTaskDeps): Promise<void> {
  const { tenant_id, task_id } = payload;

  const task = await getTaskForEmbedding({ tenant_id, task_id });

  if (task == null) {
    await deps.pool.query(
      `DELETE FROM planner.task_embeddings WHERE tenant_id = $1 AND task_id = $2`,
      [tenant_id, task_id],
    );
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

  const existing = await deps.pool.query<{ source_hash: string }>(
    `SELECT source_hash FROM planner.task_embeddings
       WHERE tenant_id = $1 AND task_id = $2`,
    [tenant_id, task_id],
  );
  if (existing.rows[0]?.source_hash === hash) return;

  await ensureTenantPartition(deps.pool, {
    parent: 'planner.task_embeddings',
    embeddingColumn: 'embedding',
    tenantId: tenant_id,
    opclass: 'halfvec_cosine_ops',
    hnsw: { m: 16, efConstruction: 200 },
  });

  const [vector] = await embedMany(deps.provider, [source]);
  if (!vector) throw new Error('embedMany returned no vector');

  await deps.pool.query(
    `INSERT INTO planner.task_embeddings
       (tenant_id, task_id, plan_id, chunk_text, source_hash, embedding, model_id, embedded_at)
     VALUES ($1, $2, $3, $4, $5, $6::halfvec, $7, now())
     ON CONFLICT (tenant_id, task_id) DO UPDATE
       SET plan_id     = EXCLUDED.plan_id,
           chunk_text  = EXCLUDED.chunk_text,
           source_hash = EXCLUDED.source_hash,
           embedding   = EXCLUDED.embedding,
           model_id    = EXCLUDED.model_id,
           embedded_at = now()`,
    [
      tenant_id,
      task_id,
      task.plan_id,
      source,
      hash,
      `[${vector.join(',')}]`,
      deps.provider.modelId,
    ],
  );
}
