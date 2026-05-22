import { emit, withEmit } from '@seta/core/events';
import { ensureTenantPartition } from '@seta/shared-db';
import { type EmbeddingProvider, embedMany } from '@seta/shared-embeddings';
import type { Pool } from 'pg';

export interface EmbedKnowledgeChunksPayload {
  tenant_id: string;
  file_id: string;
  event_id: string;
}

export interface EmbedKnowledgeChunksDeps {
  pool: Pool;
  provider: EmbeddingProvider;
}

const BATCH_SIZE = 100;

export async function embedKnowledgeChunks(
  payload: EmbedKnowledgeChunksPayload,
  deps: EmbedKnowledgeChunksDeps,
): Promise<void> {
  const { tenant_id, file_id } = payload;

  try {
    const chunks = await deps.pool.query<{ chunk_ordinal: number; chunk_text: string }>(
      `SELECT chunk_ordinal, chunk_text FROM copilot.tenant_knowledge_chunks
        WHERE tenant_id = $1 AND file_id = $2 ORDER BY chunk_ordinal`,
      [tenant_id, file_id],
    );
    if (chunks.rows.length === 0) throw new Error('no chunks found for file');

    // hnswIndexName override: the auto-generated name
    // 'tenant_knowledge_embeddings_${slug}_hnsw_idx' is 69 chars,
    // exceeding Postgres's 63-byte identifier limit. 'tke_${slug}_hnsw_idx' is 49 chars.
    const slug = tenant_id.replaceAll('-', '_');
    // secondaryIndexColumns omitted: ensureTenantPartition has no per-secondary-index name override;
    // 'tenant_knowledge_embeddings_${slug}_file_id_idx' is 76 chars > Postgres 63-byte limit.
    await ensureTenantPartition(deps.pool, {
      parent: 'copilot.tenant_knowledge_embeddings',
      embeddingColumn: 'embedding',
      tenantId: tenant_id,
      hnswIndexName: `tke_${slug}_hnsw_idx`,
      opclass: 'halfvec_cosine_ops',
      hnsw: { m: 16, efConstruction: 200 },
    });

    const vectors = await embedMany(
      deps.provider,
      chunks.rows.map((c) => c.chunk_text),
      { batchSize: BATCH_SIZE },
    );

    const client = await deps.pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `DELETE FROM copilot.tenant_knowledge_embeddings WHERE tenant_id = $1 AND file_id = $2`,
        [tenant_id, file_id],
      );

      const placeholders = chunks.rows
        .map((_, i) => {
          const base = 2 + i * 3;
          return `($1, $2, $${base + 1}, $${base + 2}::halfvec, $${base + 3}, now())`;
        })
        .join(', ');
      const params: unknown[] = [tenant_id, file_id];
      for (let i = 0; i < chunks.rows.length; i += 1) {
        params.push(
          chunks.rows[i]!.chunk_ordinal,
          `[${vectors[i]!.join(',')}]`,
          deps.provider.modelId,
        );
      }
      await client.query(
        `INSERT INTO copilot.tenant_knowledge_embeddings
           (tenant_id, file_id, chunk_ordinal, embedding, model_id, embedded_at)
           VALUES ${placeholders}`,
        params,
      );

      await client.query(
        `UPDATE copilot.tenant_knowledge_files
            SET status = 'ready', processed_at = now(), error_reason = NULL
          WHERE id = $1 AND tenant_id = $2`,
        [file_id, tenant_id],
      );

      await client.query('COMMIT');
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // connection dead — original error in `err` is the actionable one
      }
      throw err;
    } finally {
      client.release();
    }

    await withEmit({ actor: { userId: 'system', tenantId: tenant_id } }, async () => {
      await emit({
        tenantId: tenant_id,
        aggregateType: 'copilot.tenant_knowledge_file',
        aggregateId: file_id,
        eventType: 'copilot.tenant_knowledge.processed',
        eventVersion: 1,
        payload: { tenant_id, file_id },
      });
    });
  } catch (err) {
    const reason = (err as Error).message;

    const client = await deps.pool.connect();
    try {
      await client.query(
        `UPDATE copilot.tenant_knowledge_files
            SET status = 'failed', error_reason = $1
          WHERE id = $2 AND tenant_id = $3`,
        [reason, file_id, tenant_id],
      );
    } finally {
      client.release();
    }

    await withEmit({ actor: { userId: 'system', tenantId: tenant_id } }, async () => {
      await emit({
        tenantId: tenant_id,
        aggregateType: 'copilot.tenant_knowledge_file',
        aggregateId: file_id,
        eventType: 'copilot.tenant_knowledge.failed',
        eventVersion: 1,
        payload: { tenant_id, file_id, error_reason: reason },
      });
    });
  }
}
