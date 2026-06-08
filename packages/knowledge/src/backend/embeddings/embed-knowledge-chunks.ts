import type { PgVector } from '@mastra/pg';
import { emit, withEmit } from '@seta/core/events';
import { type EmbeddingProvider, embedMany } from '@seta/shared-embeddings';
import type { Pool } from 'pg';
import {
  ensureKnowledgeVectorIndex,
  KNOWLEDGE_VECTOR_INDEX,
  type KnowledgeChunkVectorMetadata,
  knowledgeVectorId,
} from './vector-store.ts';

export interface EmbedKnowledgeChunksPayload {
  tenant_id: string;
  file_id: string;
  event_id: string;
}

export interface EmbedKnowledgeChunksDeps {
  pool: Pool;
  pgVector: PgVector;
  provider: EmbeddingProvider;
}

const BATCH_SIZE = 100;

export async function embedKnowledgeChunks(
  payload: EmbedKnowledgeChunksPayload,
  deps: EmbedKnowledgeChunksDeps,
): Promise<void> {
  const { tenant_id, file_id } = payload;

  try {
    const fileRow = await deps.pool.query<{
      filename: string;
      thread_id: string | null;
      origin: 'knowledge_base' | 'chat';
    }>(`SELECT filename, thread_id, origin FROM knowledge.files WHERE id = $1 AND tenant_id = $2`, [
      file_id,
      tenant_id,
    ]);
    const filename = fileRow.rows[0]?.filename;
    if (!filename) throw new Error('file row not found for embed');
    const thread_id = fileRow.rows[0]?.thread_id ?? null;
    const origin = fileRow.rows[0]?.origin ?? 'knowledge_base';

    const chunks = await deps.pool.query<{
      chunk_ordinal: number;
      chunk_text: string;
      page_hint: string | null;
    }>(
      `SELECT chunk_ordinal, chunk_text, page_hint FROM knowledge.chunks
        WHERE tenant_id = $1 AND file_id = $2 ORDER BY chunk_ordinal`,
      [tenant_id, file_id],
    );
    if (chunks.rows.length === 0) throw new Error('no chunks found for file');

    await ensureKnowledgeVectorIndex(deps.pgVector);

    const vectors = await embedMany(
      deps.provider,
      chunks.rows.map((c) => c.chunk_text),
      { batchSize: BATCH_SIZE },
    );

    const embeddedAt = new Date().toISOString();
    const ids = chunks.rows.map((c) => knowledgeVectorId(tenant_id, file_id, c.chunk_ordinal));
    const metadata: KnowledgeChunkVectorMetadata[] = chunks.rows.map((c) => ({
      tenant_id,
      file_id,
      chunk_ordinal: c.chunk_ordinal,
      chunk_text: c.chunk_text,
      filename,
      page_hint: c.page_hint,
      model_id: deps.provider.modelId,
      embedded_at: embeddedAt,
      thread_id,
      origin,
    }));

    await deps.pgVector.upsert({
      indexName: KNOWLEDGE_VECTOR_INDEX,
      vectors,
      metadata,
      ids,
    });

    await deps.pool.query(
      `UPDATE knowledge.files
          SET status = 'ready', processed_at = now(), error_reason = NULL
        WHERE id = $1 AND tenant_id = $2`,
      [file_id, tenant_id],
    );

    await withEmit({ actor: { userId: 'system', tenantId: tenant_id } }, async () => {
      await emit({
        tenantId: tenant_id,
        aggregateType: 'knowledge.file',
        aggregateId: file_id,
        eventType: 'knowledge.file.processed',
        eventVersion: 1,
        payload: { tenant_id, file_id },
      });
    });
  } catch (err) {
    const reason = (err as Error).message;

    const client = await deps.pool.connect();
    try {
      await client.query(
        `UPDATE knowledge.files
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
        aggregateType: 'knowledge.file',
        aggregateId: file_id,
        eventType: 'knowledge.file.failed',
        eventVersion: 1,
        payload: { tenant_id, file_id, error_reason: reason },
      });
    });
  }
}
