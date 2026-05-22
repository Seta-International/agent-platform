import { randomUUID } from 'node:crypto';
import { resetCoreDb } from '@seta/core/internal/test-support';
import { closePools, initPools } from '@seta/shared-db';
import { FakeEmbeddingProvider, withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { embedKnowledgeChunks } from '../../embed/embed-knowledge-chunks.ts';
import { searchTenantKnowledge } from '../search-tenant-knowledge.ts';

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

async function seedFileWithChunks(
  pool: import('pg').Pool,
  tenant_id: string,
  filename: string,
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
       VALUES ($1, $2, $3, 'text/plain', 1, $4, 'embedding')
       RETURNING id`,
      [
        tenant_id,
        randomUUID(),
        filename,
        `tenants/${tenant_id}/knowledge/${randomUUID()}/${filename}`,
      ],
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

describe('searchTenantKnowledge retriever', () => {
  it('returns chunk hits with file citation metadata', async () => {
    await withDb(async ({ pool }) => {
      const tenant_id = randomUUID();
      const provider = new FakeEmbeddingProvider({ dimensions: 1536 });

      const file_id = await seedFileWithChunks(pool, tenant_id, 'handbook.pdf', [
        { text: 'our terraform infrastructure is managed via atlantis', page_hint: 'p.1' },
        { text: 'all deployments use kubernetes clusters', page_hint: 'p.2' },
      ]);

      await embedKnowledgeChunks(
        { tenant_id, file_id, event_id: randomUUID() },
        { pool, provider },
      );

      const hits = await searchTenantKnowledge(
        { query: 'terraform infrastructure', tenant_id, limit: 10 },
        { provider, pool },
      );

      expect(hits.length).toBeGreaterThanOrEqual(1);

      const hit = hits.find((h) => h.item.chunk_text.includes('terraform'));
      expect(hit).toBeDefined();
      expect(hit!.item.filename).toBe('handbook.pdf');
      expect(hit!.item.page_hint).toBe('p.1');
      expect(hit!.item.chunk_text).toContain('terraform');
      expect(hit!.source).toBe('vector');
    });
  });

  it('respects tenant isolation', async () => {
    await withDb(async ({ pool }) => {
      const tenant_a = randomUUID();
      const tenant_b = randomUUID();
      const provider = new FakeEmbeddingProvider({ dimensions: 1536 });

      const file_a = await seedFileWithChunks(pool, tenant_a, 'policies-a.pdf', [
        { text: 'tenant A security policy details', page_hint: null },
      ]);
      const file_b = await seedFileWithChunks(pool, tenant_b, 'policies-b.pdf', [
        { text: 'tenant B onboarding document', page_hint: null },
      ]);

      await embedKnowledgeChunks(
        { tenant_id: tenant_a, file_id: file_a, event_id: randomUUID() },
        { pool, provider },
      );
      await embedKnowledgeChunks(
        { tenant_id: tenant_b, file_id: file_b, event_id: randomUUID() },
        { pool, provider },
      );

      const hitsA = await searchTenantKnowledge(
        { query: 'security policy', tenant_id: tenant_a, limit: 10 },
        { provider, pool },
      );
      const hitsB = await searchTenantKnowledge(
        { query: 'onboarding document', tenant_id: tenant_b, limit: 10 },
        { provider, pool },
      );

      expect(hitsA.every((h) => h.item.filename === 'policies-a.pdf')).toBe(true);
      expect(hitsB.every((h) => h.item.filename === 'policies-b.pdf')).toBe(true);
    });
  });
});
