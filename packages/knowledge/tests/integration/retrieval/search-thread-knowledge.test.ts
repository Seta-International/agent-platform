import { randomUUID } from 'node:crypto';
import { PgVector } from '@mastra/pg';
import { resetCoreDb } from '@seta/core/testing';
import { KNOWLEDGE_VECTOR_NAMESPACE } from '@seta/knowledge';
import { resetKnowledgeDb } from '@seta/knowledge/testing';
import { closePools, initPools } from '@seta/shared-db';
import { FakeEmbeddingProvider, withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { embedKnowledgeChunks } from '../../../src/backend/embeddings/embed-knowledge-chunks.ts';
import { searchThreadKnowledge } from '../../../src/backend/retrieval/search-thread-knowledge.ts';

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

async function seedChatFile(
  pool: import('pg').Pool,
  tenant_id: string,
  thread_id: string | null,
  origin: 'knowledge_base' | 'chat',
  filename: string,
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
       VALUES ($1, $2, $3, 'text/plain', 1, $4, 'embedding', $5, $6)
       RETURNING id`,
      [
        tenant_id,
        randomUUID(),
        filename,
        `tenants/${tenant_id}/x/${randomUUID()}/${filename}`,
        thread_id,
        origin,
      ],
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

describe('searchThreadKnowledge retriever', () => {
  it('returns only the target thread files; excludes other threads and KB files', async () => {
    await withDb(async ({ pool, pgVector }) => {
      const tenant_id = randomUUID();
      const threadA = randomUUID();
      const threadB = randomUUID();
      const provider = new FakeEmbeddingProvider({ dimensions: 1536 });

      const fileA = await seedChatFile(pool, tenant_id, threadA, 'chat', 'a.pdf', [
        { text: 'project alpha launch checklist', page_hint: 'p.1' },
      ]);
      const fileB = await seedChatFile(pool, tenant_id, threadB, 'chat', 'b.pdf', [
        { text: 'project alpha launch checklist', page_hint: 'p.1' },
      ]);
      const kb = await seedChatFile(pool, tenant_id, null, 'knowledge_base', 'kb.pdf', [
        { text: 'project alpha launch checklist', page_hint: 'p.1' },
      ]);

      for (const file_id of [fileA, fileB, kb]) {
        await embedKnowledgeChunks(
          { tenant_id, file_id, event_id: randomUUID() },
          { pool, pgVector, provider },
        );
      }

      const hits = await searchThreadKnowledge(
        { query: 'alpha launch', tenant_id, thread_id: threadA, limit: 10 },
        { provider, pgVector, pool },
      );

      expect(hits.length).toBeGreaterThanOrEqual(1);
      expect(hits.every((h) => h.item.filename === 'a.pdf')).toBe(true);
    });
  });
});
