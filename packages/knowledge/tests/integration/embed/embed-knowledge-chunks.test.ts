import { randomUUID } from 'node:crypto';
import { PgVector } from '@mastra/pg';
import { resetCoreDb } from '@seta/core/testing';
import {
  KNOWLEDGE_VECTOR_INDEX,
  KNOWLEDGE_VECTOR_NAMESPACE,
  type KnowledgeChunkVectorMetadata,
} from '@seta/knowledge';
import { resetKnowledgeDb } from '@seta/knowledge/testing';
import { closePools, initPools } from '@seta/shared-db';
import { FakeEmbeddingProvider, withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { embedKnowledgeChunks } from '../../../src/backend/embeddings/embed-knowledge-chunks.ts';

const withDb = <T>(fn: (ctx: { pool: import('pg').Pool; pgVector: PgVector }) => Promise<T>) =>
  withTestDb(
    {
      templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
      baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
    },
    async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetKnowledgeDb();
      initPools({ databaseUrl });
      const pgVector = new PgVector({
        id: 'knowledge-chunks-test',
        connectionString: databaseUrl,
        schemaName: KNOWLEDGE_VECTOR_NAMESPACE,
      });
      try {
        return await fn({ pool, pgVector });
      } finally {
        await pgVector.disconnect().catch(() => {});
        resetCoreDb();
        resetKnowledgeDb();
        await closePools();
      }
    },
  );

describe('embedKnowledgeChunks worker', () => {
  it('embeds all chunks for a file, flips to ready, emits processed event', async () => {
    await withDb(async ({ pool, pgVector }) => {
      const tenant_id = randomUUID();
      const provider = new FakeEmbeddingProvider({ dimensions: 1536 });

      const file_id = await seedFileWithChunks(pool, tenant_id, [
        { text: 'first chunk', page_hint: 'p.1' },
        { text: 'second chunk', page_hint: 'p.2' },
      ]);

      await embedKnowledgeChunks(
        { tenant_id, file_id, event_id: randomUUID() },
        { pool, pgVector, provider },
      );

      const rows = await pgVector.query({
        indexName: KNOWLEDGE_VECTOR_INDEX,
        filter: { tenant_id: { $eq: tenant_id }, file_id: { $eq: file_id } },
        topK: 100,
      });
      const ordinals = rows
        .map((r) => (r.metadata as Partial<KnowledgeChunkVectorMetadata>).chunk_ordinal)
        .sort();
      expect(ordinals).toEqual([0, 1]);

      const status = await pool.query<{ status: string }>(
        `SELECT status FROM knowledge.files WHERE id = $1`,
        [file_id],
      );
      expect(status.rows[0]?.status).toBe('ready');

      const events = await pool.query<{ event_type: string }>(
        `SELECT event_type FROM core.events
          WHERE tenant_id = $1 AND event_type = 'knowledge.file.processed'`,
        [tenant_id],
      );
      expect(events.rows).toHaveLength(1);
    });
  });

  it('flips to failed and emits processed-failed event on provider error', async () => {
    await withDb(async ({ pool, pgVector }) => {
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
        { pool, pgVector, provider: failingProvider as never },
      );

      const status = await pool.query<{ status: string; error_reason: string | null }>(
        `SELECT status, error_reason FROM knowledge.files WHERE id = $1`,
        [file_id],
      );
      expect(status.rows[0]?.status).toBe('failed');
      expect(status.rows[0]?.error_reason).toContain('provider down');
    });
  });

  it('stamps thread_id and origin from the file row onto chunk metadata', async () => {
    await withDb(async ({ pool, pgVector }) => {
      const tenant_id = randomUUID();
      const thread_id = randomUUID();
      const provider = new FakeEmbeddingProvider({ dimensions: 1536 });

      const file_id = await seedChatFileWithChunks(pool, tenant_id, thread_id, [
        { text: 'attached chat doc chunk', page_hint: 'p.1' },
      ]);

      await embedKnowledgeChunks(
        { tenant_id, file_id, event_id: randomUUID() },
        { pool, pgVector, provider },
      );

      const rows = await pgVector.query({
        indexName: KNOWLEDGE_VECTOR_INDEX,
        filter: { tenant_id: { $eq: tenant_id }, file_id: { $eq: file_id } },
        topK: 10,
      });
      const md = rows[0]?.metadata as Partial<KnowledgeChunkVectorMetadata> | undefined;
      expect(md?.thread_id).toBe(thread_id);
      expect(md?.origin).toBe('chat');
    });
  });
});

async function seedFileWithChunks(
  pool: import('pg').Pool,
  tenant_id: string,
  chunks: { text: string; page_hint: string | null }[],
): Promise<string> {
  const slug = tenant_id.replaceAll('-', '_');
  const childName = `chunks_${slug}`;
  const { rows: existing } = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = $1 AND n.nspname = 'knowledge'
     ) AS exists`,
    [childName],
  );
  if (!existing[0]?.exists) {
    await pool.query(
      `CREATE TABLE knowledge.${childName}
         PARTITION OF knowledge.chunks
         FOR VALUES IN ('${tenant_id}'::uuid)`,
    );
  }

  const fileId = (
    await pool.query<{ id: string }>(
      `INSERT INTO knowledge.files
         (tenant_id, uploaded_by, filename, mime_type, size_bytes, s3_key, status)
       VALUES ($1, $2, 't.txt', 'text/plain', 1, $3, 'embedding')
       RETURNING id`,
      [tenant_id, randomUUID(), `tenants/${tenant_id}/knowledge/${randomUUID()}/t.txt`],
    )
  ).rows[0]!.id;
  for (let i = 0; i < chunks.length; i += 1) {
    await pool.query(
      `INSERT INTO knowledge.chunks (tenant_id, file_id, chunk_ordinal, chunk_text, page_hint)
       VALUES ($1, $2, $3, $4, $5)`,
      [tenant_id, fileId, i, chunks[i]!.text, chunks[i]!.page_hint],
    );
  }
  return fileId;
}

async function seedChatFileWithChunks(
  pool: import('pg').Pool,
  tenant_id: string,
  thread_id: string,
  chunks: { text: string; page_hint: string | null }[],
): Promise<string> {
  const slug = tenant_id.replaceAll('-', '_');
  const childName = `chunks_${slug}`;
  const { rows: existing } = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = $1 AND n.nspname = 'knowledge'
     ) AS exists`,
    [childName],
  );
  if (!existing[0]?.exists) {
    await pool.query(
      `CREATE TABLE knowledge.${childName}
         PARTITION OF knowledge.chunks
         FOR VALUES IN ('${tenant_id}'::uuid)`,
    );
  }
  const fileId = (
    await pool.query<{ id: string }>(
      `INSERT INTO knowledge.files
         (tenant_id, uploaded_by, filename, mime_type, size_bytes, s3_key, status, thread_id, origin)
       VALUES ($1, $2, 'c.txt', 'text/plain', 1, $3, 'embedding', $4, 'chat')
       RETURNING id`,
      [tenant_id, randomUUID(), `tenants/${tenant_id}/chat/${randomUUID()}/c.txt`, thread_id],
    )
  ).rows[0]!.id;
  for (let i = 0; i < chunks.length; i += 1) {
    await pool.query(
      `INSERT INTO knowledge.chunks (tenant_id, file_id, chunk_ordinal, chunk_text, page_hint)
       VALUES ($1, $2, $3, $4, $5)`,
      [tenant_id, fileId, i, chunks[i]!.text, chunks[i]!.page_hint],
    );
  }
  return fileId;
}
