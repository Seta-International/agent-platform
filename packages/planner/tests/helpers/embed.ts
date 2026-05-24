import { ensureTenantPartition } from '@seta/shared-db';
import type { EmbeddingProvider } from '@seta/shared-embeddings';
import { embedMany, sourceHash } from '@seta/shared-embeddings';
import type { Pool } from 'pg';
import { buildTaskSource } from '../../src/backend/embeddings/source.ts';

export interface EmbedTaskForTestOptions {
  tenant_id: string;
  task_id: string;
  plan_id: string;
  title: string;
  description: string | null;
  skill_tags: string[];
  provider: EmbeddingProvider;
}

export async function embedTaskForTest(pool: Pool, opts: EmbedTaskForTestOptions): Promise<void> {
  const { tenant_id, task_id, plan_id, title, description, skill_tags, provider } = opts;

  const source = buildTaskSource({ title, description, skill_tags });
  const hash = sourceHash(source);

  await ensureTenantPartition(pool, {
    parent: 'planner.task_embeddings',
    embeddingColumn: 'embedding',
    tenantId: tenant_id,
    opclass: 'halfvec_cosine_ops',
    hnsw: { m: 16, efConstruction: 200 },
  });

  const [vector] = await embedMany(provider, [source]);
  if (!vector) throw new Error('embedMany returned no vector');

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
    [tenant_id, task_id, plan_id, source, hash, `[${vector.join(',')}]`, provider.modelId],
  );
}
