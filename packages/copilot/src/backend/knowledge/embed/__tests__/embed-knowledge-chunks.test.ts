import { randomUUID } from 'node:crypto';
import { resetCoreDb } from '@seta/core/internal/test-support';
import { closePools, initPools } from '@seta/shared-db';
import { FakeEmbeddingProvider, withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { embedKnowledgeChunks } from '../embed-knowledge-chunks.ts';

const withDb = <T>(fn: (ctx: { pool: import('pg').Pool }) => Promise<T>) =>
  withTestDb(
    {
      templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
      baseUrl: process.env.SETA_TEST_PG_BASE as string,
    },
    async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        return await fn({ pool });
      } finally {
        resetCoreDb();
        await closePools();
      }
    },
  );

describe('embedKnowledgeChunks worker', () => {
  it('embeds all chunks for a file → flips to ready → emits processed event', async () => {
    await withDb(async ({ pool }) => {
      const tenant_id = randomUUID();
      const provider = new FakeEmbeddingProvider({ dimensions: 1536 });

      const file_id = await seedFileWithChunks(pool, tenant_id, [
        { text: 'first chunk', page_hint: 'p.1' },
        { text: 'second chunk', page_hint: 'p.2' },
      ]);

      await embedKnowledgeChunks(
        { tenant_id, file_id, event_id: randomUUID() },
        { pool, provider },
      );

      const embeddings = await pool.query(
        `SELECT chunk_ordinal FROM copilot.tenant_knowledge_embeddings
          WHERE tenant_id = $1 AND file_id = $2 ORDER BY chunk_ordinal`,
        [tenant_id, file_id],
      );
      expect(embeddings.rows.map((r: { chunk_ordinal: number }) => r.chunk_ordinal)).toEqual([
        0, 1,
      ]);

      const status = await pool.query<{ status: string }>(
        `SELECT status FROM copilot.tenant_knowledge_files WHERE id = $1`,
        [file_id],
      );
      expect(status.rows[0]?.status).toBe('ready');

      const events = await pool.query<{ event_type: string }>(
        `SELECT event_type FROM core.events
          WHERE tenant_id = $1 AND event_type = 'copilot.tenant_knowledge.processed'`,
        [tenant_id],
      );
      expect(events.rows).toHaveLength(1);
    });
  });

  it('flips to failed and emits processed-failed event on provider error', async () => {
    await withDb(async ({ pool }) => {
      const tenant_id = randomUUID();
      const file_id = await seedFileWithChunks(pool, tenant_id, [{ text: 'x', page_hint: null }]);
      const failingProvider = {
        modelId: 'fake:fail',
        dimensions: 1536,
        embed: async () => {
          throw new Error('provider down');
        },
      };
      await embedKnowledgeChunks(
        { tenant_id, file_id, event_id: randomUUID() },
        { pool, provider: failingProvider as never },
      );

      const status = await pool.query<{ status: string; error_reason: string | null }>(
        `SELECT status, error_reason FROM copilot.tenant_knowledge_files WHERE id = $1`,
        [file_id],
      );
      expect(status.rows[0]?.status).toBe('failed');
      expect(status.rows[0]?.error_reason).toContain('provider down');
    });
  });
});

async function seedFileWithChunks(
  pool: import('pg').Pool,
  tenant_id: string,
  chunks: { text: string; page_hint: string | null }[],
): Promise<string> {
  const slug = tenant_id.replaceAll('-', '_');
  const childName = `tenant_knowledge_chunks_${slug}`;
  const { rows: existing } = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = $1 AND n.nspname = 'copilot'
     ) AS exists`,
    [childName],
  );
  if (!existing[0]?.exists) {
    await pool.query(
      `CREATE TABLE copilot.${childName}
         PARTITION OF copilot.tenant_knowledge_chunks
         FOR VALUES IN ('${tenant_id}'::uuid)`,
    );
  }

  const fileId = (
    await pool.query<{ id: string }>(
      `INSERT INTO copilot.tenant_knowledge_files
         (tenant_id, uploaded_by, filename, mime_type, size_bytes, s3_key, status)
       VALUES ($1, $2, 't.txt', 'text/plain', 1, $3, 'embedding')
       RETURNING id`,
      [tenant_id, randomUUID(), `tenants/${tenant_id}/knowledge/${randomUUID()}/t.txt`],
    )
  ).rows[0]!.id;
  for (let i = 0; i < chunks.length; i += 1) {
    await pool.query(
      `INSERT INTO copilot.tenant_knowledge_chunks (tenant_id, file_id, chunk_ordinal, chunk_text, page_hint)
       VALUES ($1, $2, $3, $4, $5)`,
      [tenant_id, fileId, i, chunks[i]!.text, chunks[i]!.page_hint],
    );
  }
  return fileId;
}
