import { buildTaskSource } from '@seta/planner';
import { ensureTenantPartition } from '@seta/shared-db';
import { sourceHash } from '@seta/shared-embeddings';
import type { Pool } from 'pg';
import {
  type BatchInputRow,
  type BatchResultRow,
  pollUntilDone as defaultPoll,
  submitBatch as defaultSubmit,
  type OpenAIBatchClient,
  type SubmitOptions,
} from './openai-batch.ts';

export type { BatchInputRow, BatchResultRow };

const PAGE_SIZE = 1000;

export interface BackfillTasksOptions {
  tenant_id: string;
  pool: Pool;
  apiKey: string;
  model: 'text-embedding-3-small' | 'text-embedding-3-large';
  /** Injectable for tests — defaults to the real submitBatch */
  submitBatch?: typeof defaultSubmit;
  /** Injectable for tests — defaults to the real pollUntilDone */
  pollUntilDone?: typeof defaultPoll;
}

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  skill_tags: string[];
}

/**
 * Drain a tenant's planner.tasks into planner.task_embeddings via the OpenAI
 * Batch API.
 *
 * Sequence:
 * 1. Ensure the per-tenant HNSW partition exists.
 * 2. Page through live tasks (keyset cursor, PAGE_SIZE=1000).
 * 3. For each page: hash-gate → submit batch → poll → upsert in a transaction.
 */
export async function backfillTasks(opts: BackfillTasksOptions): Promise<void> {
  const {
    tenant_id,
    pool,
    apiKey,
    model,
    submitBatch: submit = defaultSubmit,
    pollUntilDone: poll = defaultPoll,
  } = opts;

  const modelId = `openai:${model}`;

  // Step 1: ensure per-tenant partition + HNSW index (same call as embedTask).
  await ensureTenantPartition(pool, {
    parent: 'planner.task_embeddings',
    embeddingColumn: 'embedding',
    tenantId: tenant_id,
    opclass: 'halfvec_cosine_ops',
    hnsw: { m: 16, efConstruction: 200 },
  });

  // Step 2: keyset-paginate through live tasks.
  let cursor = '00000000-0000-0000-0000-000000000000';
  const submitOpts: SubmitOptions = { apiKey, model };
  const pollOpts: OpenAIBatchClient = { apiKey };

  while (true) {
    const result = await pool.query<TaskRow>(
      `SELECT id, title, description, skill_tags
         FROM planner.tasks
        WHERE tenant_id = $1
          AND deleted_at IS NULL
          AND id > $2
        ORDER BY id
        LIMIT $3`,
      [tenant_id, cursor, PAGE_SIZE],
    );

    const page = result.rows;
    if (page.length === 0) break;

    // Update cursor for the next page.
    cursor = page[page.length - 1]!.id;

    // Step 3a: build source + hash for each row.
    const sourced = page.map((row) => {
      const source = buildTaskSource({
        title: row.title,
        description: row.description,
        skill_tags: row.skill_tags,
      });
      return { id: row.id, source, hash: sourceHash(source) };
    });

    // Step 3b: hash-gate — load existing source_hash for chunk_ordinal=0.
    const pageIds = page.map((r) => r.id);
    const existingResult = await pool.query<{ task_id: string; source_hash: string }>(
      `SELECT task_id, source_hash
         FROM planner.task_embeddings
        WHERE tenant_id = $1
          AND task_id = ANY($2::uuid[])
          AND chunk_ordinal = 0`,
      [tenant_id, pageIds],
    );
    const existingByTask = new Map<string, string>(
      existingResult.rows.map((r) => [r.task_id, r.source_hash]),
    );

    // Filter out rows whose hash is already current.
    const toEmbed = sourced.filter((s) => existingByTask.get(s.id) !== s.hash);

    if (toEmbed.length === 0) {
      // All rows on this page are already current.
      if (page.length < PAGE_SIZE) break;
      continue;
    }

    // Step 3c: build batch inputs and submit.
    const batchInputs: BatchInputRow[] = toEmbed.map((s) => ({
      custom_id: s.id,
      input: s.source,
    }));

    const batchId = await submit(submitOpts, batchInputs);
    const batchResults: BatchResultRow[] = await poll(pollOpts, batchId);

    // Build a map of task_id → vector for the upsert step.
    const vectorByTask = new Map<string, number[]>(
      batchResults.map((r) => [r.custom_id, r.vector]),
    );

    // Build a map of task_id → { source, hash } for convenience.
    const sourceByTask = new Map<string, { source: string; hash: string }>(
      toEmbed.map((s) => [s.id, { source: s.source, hash: s.hash }]),
    );

    // Step 3d: transactional DELETE + bulk INSERT for the toEmbed rows.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Remove stale rows for all task_ids being re-embedded.
      const toEmbedIds = toEmbed.map((s) => s.id);
      await client.query(
        `DELETE FROM planner.task_embeddings
          WHERE tenant_id = $1 AND task_id = ANY($2::uuid[])`,
        [tenant_id, toEmbedIds],
      );

      // Bulk INSERT — single chunk per task (chunk_ordinal=0).
      // Fixed params: $1=tenant_id, $2=modelId
      // Per-row params starting at $3: task_id, chunk_text, source_hash, embedding
      const placeholders: string[] = [];
      const params: unknown[] = [tenant_id, modelId];
      let p = 2; // 2 fixed params consumed

      for (const taskId of toEmbedIds) {
        const vec = vectorByTask.get(taskId);
        if (!vec) continue; // No vector returned — skip to avoid data loss.
        const meta = sourceByTask.get(taskId);
        if (!meta) continue;

        const iTaskId = ++p;
        const iChunkText = ++p;
        const iSourceHash = ++p;
        const iEmbedding = ++p;

        placeholders.push(
          `($1, $${iTaskId}, 0, $${iChunkText}, $${iSourceHash}, $${iEmbedding}::halfvec, $2, now())`,
        );
        params.push(taskId, meta.source, meta.hash, `[${vec.join(',')}]`);
      }

      if (placeholders.length > 0) {
        await client.query(
          `INSERT INTO planner.task_embeddings
             (tenant_id, task_id, chunk_ordinal, chunk_text, source_hash, embedding, model_id, embedded_at)
           VALUES ${placeholders.join(', ')}`,
          params,
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Connection already dead.
      }
      throw err;
    } finally {
      client.release();
    }

    if (page.length < PAGE_SIZE) break;
  }
}
