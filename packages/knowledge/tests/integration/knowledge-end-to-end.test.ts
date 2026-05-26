import { randomUUID } from 'node:crypto';
import { PgVector } from '@mastra/pg';
import { resetCoreDb } from '@seta/core/testing';
import { KNOWLEDGE_VECTOR_NAMESPACE } from '@seta/knowledge';
import { resetKnowledgeDb } from '@seta/knowledge/testing';
import { closePools, initPools } from '@seta/shared-db';
import { FakeEmbeddingProvider, withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { embedKnowledgeChunks } from '../../src/backend/embeddings/embed-knowledge-chunks.ts';
import { parseKnowledgeFile } from '../../src/backend/parse/parse-knowledge-file.ts';
import { searchTenantKnowledge } from '../../src/backend/retrieval/search-tenant-knowledge.ts';

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

describe('Knowledge end-to-end', () => {
  it('upload, parse, embed, search returns the chunk', async () => {
    await withDb(async ({ pool, pgVector }) => {
      const tenant_id = randomUUID();
      const provider = new FakeEmbeddingProvider({ dimensions: 1536 });

      const s3_key = `tenants/${tenant_id}/knowledge/${randomUUID()}/handbook.txt`;
      const file_id = (
        await pool.query<{ id: string }>(
          `INSERT INTO knowledge.files
             (tenant_id, uploaded_by, filename, mime_type, size_bytes, s3_key, status, scan_status)
           VALUES ($1, $2, 'handbook.txt', 'text/plain', 100, $3, 'parsing', 'clean')
           RETURNING id`,
          [tenant_id, randomUUID(), s3_key],
        )
      ).rows[0]!.id;

      const fetchObject = async (_key: string): Promise<Buffer> =>
        Buffer.from('How to provision EKS: 1) install terraform. 2) run terraform apply.', 'utf-8');

      await parseKnowledgeFile(
        { tenant_id, file_id, event_id: randomUUID() },
        { pool, fetchObject, enqueueEmbedJob: async () => {} },
      );

      await embedKnowledgeChunks(
        { tenant_id, file_id, event_id: randomUUID() },
        { pool, pgVector, provider },
      );

      const hits = await searchTenantKnowledge(
        { query: 'how do I provision EKS', tenant_id, limit: 5 },
        { provider, pgVector, pool },
      );

      expect(hits.length).toBeGreaterThanOrEqual(1);
      expect(hits[0]!.item.filename).toBe('handbook.txt');
      expect(hits[0]!.item.chunk_text).toMatch(/EKS|terraform/);
    });
  });
});
