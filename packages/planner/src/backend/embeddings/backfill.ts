import { ensureTenantPartition } from '@seta/shared-db';
import { sourceHash } from '@seta/shared-embeddings';
import type { Pool } from 'pg';
import { fitsInWindow } from './chunking.ts';
import {
  type BatchInputRow,
  type BatchResultRow,
  pollUntilDone as defaultPoll,
  submitBatch as defaultSubmit,
  type OpenAIBatchClient,
  type SubmitOptions,
} from './openai-batch.ts';
import { buildTaskSource } from './source.ts';

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
  plan_id: string;
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
 * 3. For each page: hash-gate → submit batch → poll → upsert.
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

  await ensureTenantPartition(pool, {
    parent: 'planner.task_embeddings',
    embeddingColumn: 'embedding',
    tenantId: tenant_id,
    opclass: 'halfvec_cosine_ops',
    hnsw: { m: 16, efConstruction: 200 },
  });

  let cursor = '00000000-0000-0000-0000-000000000000';
  const submitOpts: SubmitOptions = { apiKey, model };
  const pollOpts: OpenAIBatchClient = { apiKey };

  while (true) {
    const result = await pool.query<TaskRow>(
      `SELECT id, plan_id, title, description, skill_tags
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

    // biome-ignore lint/style/noNonNullAssertion: page.length > 0 checked above
    cursor = page[page.length - 1]!.id;

    const sourced = page
      .map((row) => {
        const source = buildTaskSource({
          title: row.title,
          description: row.description,
          skill_tags: row.skill_tags,
        });
        return { id: row.id, plan_id: row.plan_id, source, hash: sourceHash(source) };
      })
      .filter((s) => fitsInWindow(s.source));

    const pageIds = page.map((r) => r.id);
    const existingResult = await pool.query<{ task_id: string; source_hash: string }>(
      `SELECT task_id, source_hash
         FROM planner.task_embeddings
        WHERE tenant_id = $1
          AND task_id = ANY($2::uuid[])`,
      [tenant_id, pageIds],
    );
    const existingByTask = new Map<string, string>(
      existingResult.rows.map((r) => [r.task_id, r.source_hash]),
    );

    const toEmbed = sourced.filter((s) => existingByTask.get(s.id) !== s.hash);

    if (toEmbed.length === 0) {
      if (page.length < PAGE_SIZE) break;
      continue;
    }

    const batchInputs: BatchInputRow[] = toEmbed.map((s) => ({
      custom_id: s.id,
      input: s.source,
    }));

    const batchId = await submit(submitOpts, batchInputs);
    const batchResults: BatchResultRow[] = await poll(pollOpts, batchId);

    const vectorByTask = new Map<string, number[]>(
      batchResults.map((r) => [r.custom_id, r.vector]),
    );

    for (const meta of toEmbed) {
      const vec = vectorByTask.get(meta.id);
      if (!vec) continue;

      await pool.query(
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
        [tenant_id, meta.id, meta.plan_id, meta.source, meta.hash, `[${vec.join(',')}]`, modelId],
      );
    }

    if (page.length < PAGE_SIZE) break;
  }
}
