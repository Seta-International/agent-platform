import type { PgVector } from '@mastra/pg';
import type { EmbeddingProvider } from '@seta/shared-embeddings';
import { embedMany, sourceHash } from '@seta/shared-embeddings';
import { buildTaskSource } from '../../src/backend/embeddings/source.ts';
import {
  ensurePlannerVectorIndex,
  PLANNER_VECTOR_INDEX,
  type TaskVectorMetadata,
  taskVectorId,
} from '../../src/backend/embeddings/vector-store.ts';

export interface EmbedTaskForTestOptions {
  tenant_id: string;
  task_id: string;
  plan_id: string;
  title: string;
  description: string | null;
  labels: string[];
  provider: EmbeddingProvider;
  pgVector: PgVector;
}

export async function embedTaskForTest(opts: EmbedTaskForTestOptions): Promise<void> {
  const { tenant_id, task_id, plan_id, title, description, labels, provider, pgVector } = opts;

  const source = buildTaskSource({ title, description, labels });
  const hash = sourceHash(source);

  await ensurePlannerVectorIndex(pgVector);

  const [vector] = await embedMany(provider, [source]);
  if (!vector) throw new Error('embedMany returned no vector');

  const metadata: TaskVectorMetadata = {
    tenant_id,
    task_id,
    plan_id,
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
