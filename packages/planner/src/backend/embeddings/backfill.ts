import type { PgVector } from '@mastra/pg';
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
import {
  ensurePlannerVectorIndex,
  PLANNER_VECTOR_INDEX,
  type TaskVectorMetadata,
  taskVectorId,
} from './vector-store.ts';

export type { BatchInputRow, BatchResultRow };

const PAGE_SIZE = 1000;

export interface BackfillTasksOptions {
  tenant_id: string;
  pool: Pool;
  pgVector: PgVector;
  apiKey: string;
  model: 'text-embedding-3-small' | 'text-embedding-3-large';
  submitBatch?: typeof defaultSubmit;
  pollUntilDone?: typeof defaultPoll;
}

interface TaskRow {
  id: string;
  plan_id: string;
  title: string;
  description: string | null;
  skill_tags: string[];
}

export async function backfillTasks(opts: BackfillTasksOptions): Promise<void> {
  const {
    tenant_id,
    pool,
    pgVector,
    apiKey,
    model,
    submitBatch: submit = defaultSubmit,
    pollUntilDone: poll = defaultPoll,
  } = opts;

  const modelId = `openai:${model}`;
  const embeddedAt = new Date().toISOString();

  await ensurePlannerVectorIndex(pgVector);

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

    const pageIds = sourced.map((s) => s.id);
    const existing = pageIds.length
      ? await pgVector.query({
          indexName: PLANNER_VECTOR_INDEX,
          filter: {
            tenant_id: { $eq: tenant_id },
            task_id: { $in: pageIds },
          },
          topK: pageIds.length,
        })
      : [];
    const existingByTask = new Map<string, string>();
    for (const row of existing) {
      const md = row.metadata as Partial<TaskVectorMetadata> | undefined;
      if (md?.task_id && md.source_hash) existingByTask.set(md.task_id, md.source_hash);
    }

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

    const vectorsToUpsert: number[][] = [];
    const metadataToUpsert: TaskVectorMetadata[] = [];
    const idsToUpsert: string[] = [];

    for (const meta of toEmbed) {
      const vec = vectorByTask.get(meta.id);
      if (!vec) continue;
      vectorsToUpsert.push(vec);
      metadataToUpsert.push({
        tenant_id,
        task_id: meta.id,
        plan_id: meta.plan_id,
        chunk_text: meta.source,
        source_hash: meta.hash,
        model_id: modelId,
        embedded_at: embeddedAt,
      });
      idsToUpsert.push(taskVectorId(tenant_id, meta.id));
    }

    if (vectorsToUpsert.length > 0) {
      await pgVector.upsert({
        indexName: PLANNER_VECTOR_INDEX,
        vectors: vectorsToUpsert,
        metadata: metadataToUpsert,
        ids: idsToUpsert,
      });
    }

    if (page.length < PAGE_SIZE) break;
  }
}
