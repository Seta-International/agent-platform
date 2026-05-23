import { randomUUID } from 'node:crypto';
import { resetCoreDb } from '@seta/core/testing';
import { resetKnowledgeDb } from '@seta/knowledge/testing';
import { closePools, initPools } from '@seta/shared-db';
import { FakeEmbeddingProvider, withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { embedKnowledgeChunks } from '../../src/backend/embed/embed-knowledge-chunks.ts';
import { parseKnowledgeFile } from '../../src/backend/parse/parse-knowledge-file.ts';
import { searchTenantKnowledge } from '../../src/backend/retrieval/search-tenant-knowledge.ts';

const withDb = <T>(fn: (ctx: { pool: import('pg').Pool }) => Promise<T>) =>
  withTestDb(
    {
      templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
      baseUrl: process.env.SETA_TEST_PG_BASE as string,
    },
    async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetKnowledgeDb();
      initPools({ databaseUrl });
      try {
        return await fn({ pool });
      } finally {
        resetCoreDb();
        resetKnowledgeDb();
        await closePools();
      }
    },
  );

describe('Knowledge end-to-end', () => {
  it('upload → parse → embed → search returns the chunk', async () => {
    await withDb(async ({ pool }) => {
      const tenant_id = randomUUID();
      const provider = new FakeEmbeddingProvider({ dimensions: 1536 });

      // Seed a file row at status='parsing' so parseKnowledgeFile will process it.
      // The s3_key value is arbitrary — fetchObject is stubbed below.
      const s3_key = `tenants/${tenant_id}/knowledge/${randomUUID()}/handbook.txt`;
      const file_id = (
        await pool.query<{ id: string }>(
          `INSERT INTO knowledge.files
             (tenant_id, uploaded_by, filename, mime_type, size_bytes, s3_key, status)
           VALUES ($1, $2, 'handbook.txt', 'text/plain', 100, $3, 'parsing')
           RETURNING id`,
          [tenant_id, randomUUID(), s3_key],
        )
      ).rows[0]!.id;

      // Stub S3 fetch — return text with clear semantic clusters so the fake
      // embedder can produce a hit on 'EKS|terraform'.
      const fetchObject = async (_key: string): Promise<Buffer> =>
        Buffer.from('How to provision EKS: 1) install terraform. 2) run terraform apply.', 'utf-8');

      // Parse: chunking writes rows to tenant_knowledge_chunks, flips status → 'embedding'.
      await parseKnowledgeFile(
        { tenant_id, file_id, event_id: randomUUID() },
        { pool, fetchObject, enqueueEmbedJob: async () => {} },
      );

      // Embed: generates vectors, writes to tenant_knowledge_embeddings, flips status → 'ready'.
      await embedKnowledgeChunks(
        { tenant_id, file_id, event_id: randomUUID() },
        { pool, provider },
      );

      // Search requires status='ready' on the file row; the two steps above must both complete.
      const hits = await searchTenantKnowledge(
        { query: 'how do I provision EKS', tenant_id, limit: 5 },
        { provider, pool },
      );

      expect(hits.length).toBeGreaterThanOrEqual(1);
      expect(hits[0]!.item.filename).toBe('handbook.txt');
      expect(hits[0]!.item.chunk_text).toMatch(/EKS|terraform/);
    });
  });
});
