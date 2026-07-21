// packages/planner/tests/fixtures/golden/embed-tasks.ts
//
// In-process embedding of the seeded golden tasks for the E2E/retrieval lanes.
// The `seed:golden:embed` CLI uses the OpenAI *Batch* API (async, minutes); a
// test/nightly driver needs the embeddings synchronously, so this embeds the
// seeded tasks ONLINE (one `provider.embed(texts)` call per tenant) and upserts
// them into the same `planner_rag.task_embeddings` store the agent queries.

import { resolveEmbeddingProvider } from '@seta/shared-embeddings';
import type { Pool } from 'pg';
import {
  ensurePlannerVectorIndex,
  getPlannerVectorStore,
  PLANNER_VECTOR_INDEX,
  type TaskVectorMetadata,
  taskVectorId,
} from '../../../src/backend/embeddings/vector-store.ts';

// Must equal dataset.json embedding.modelVersion so preflight embedding checks pass.
const MODEL_ID = 'openai:text-embedding-3-small';

interface TaskRow {
  id: string;
  plan_id: string;
  title: string;
  description: string;
}

/** Embeds every non-deleted seeded task for each tenant and upserts the vectors. */
export async function embedGoldenTasks(
  pool: Pool,
  databaseUrl: string,
  tenantIds: string[],
): Promise<void> {
  const provider = resolveEmbeddingProvider();
  const pgVector = getPlannerVectorStore(databaseUrl);
  await ensurePlannerVectorIndex(pgVector);

  for (const tenantId of tenantIds) {
    const { rows } = await pool.query<TaskRow>(
      `SELECT id, plan_id, title, COALESCE(description, '') AS description
         FROM planner.tasks
        WHERE tenant_id = $1 AND deleted_at IS NULL`,
      [tenantId],
    );
    if (rows.length === 0) continue;

    const texts = rows.map((r) => `Title: ${r.title}\n${r.description}`.trim());
    const vectors = await provider.embed(texts);
    const embeddedAt = new Date().toISOString();

    const metadata: TaskVectorMetadata[] = rows.map((r, i) => ({
      tenant_id: tenantId,
      task_id: r.id,
      plan_id: r.plan_id,
      chunk_text: texts[i] ?? '',
      source_hash: '',
      model_id: MODEL_ID,
      embedded_at: embeddedAt,
    }));

    await pgVector.upsert({
      indexName: PLANNER_VECTOR_INDEX,
      vectors,
      metadata,
      ids: rows.map((r) => taskVectorId(tenantId, r.id)),
    });
  }
}
