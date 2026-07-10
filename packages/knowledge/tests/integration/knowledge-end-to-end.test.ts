import { randomUUID } from 'node:crypto';
import { PgVector } from '@mastra/pg';
import { resetCoreDb } from '@seta/core/testing';
import { KNOWLEDGE_VECTOR_NAMESPACE } from '@seta/knowledge';
import { resetKnowledgeDb } from '@seta/knowledge/testing';
import { closePools, executorPool, initPools, scoped } from '@seta/shared-db';
import { FakeEmbeddingProvider, withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { embedKnowledgeChunks } from '../../src/backend/embeddings/embed-knowledge-chunks.ts';
import { parseKnowledgeFile } from '../../src/backend/parse/parse-knowledge-file.ts';
import { searchTenantKnowledge } from '../../src/backend/retrieval/search-tenant-knowledge.ts';

/** The seta_app-role variant of a pooled test database's admin databaseUrl. */
function appRoleUrl(databaseUrl: string): string {
  return databaseUrl.replace(/\/\/[^@]+@/, '//seta_app:seta_app@');
}

const withDb = <T>(fn: (ctx: { pool: import('pg').Pool; pgVector: PgVector }) => Promise<T>) =>
  withTestDb(
    {
      templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
      baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
    },
    async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetKnowledgeDb();

      // seta_app is cluster-scoped and outlives the per-run database on a reused
      // container, with grants on other still-live test databases depending on it —
      // DROP ROLE fails there. Create-if-missing then re-assert attributes instead.
      await pool.query(`
        DO $do$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'seta_app') THEN
            CREATE ROLE seta_app LOGIN PASSWORD 'seta_app' NOSUPERUSER NOBYPASSRLS;
          END IF;
        END
        $do$;
      `);
      await pool.query(`ALTER ROLE seta_app LOGIN PASSWORD 'seta_app' NOSUPERUSER NOBYPASSRLS`);
      // Ordinary CRUD grants only — deliberately no CREATE on the knowledge schema.
      // ensureChunksPartition's CREATE TABLE ... PARTITION OF must fail as seta_app;
      // that failure is what proves the maintenance() fix is load-bearing.
      await pool.query(`GRANT USAGE ON SCHEMA knowledge TO seta_app`);
      await pool.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON knowledge.files, knowledge.chunks TO seta_app`,
      );
      await pool.query(`GRANT USAGE ON SCHEMA core TO seta_app`);
      await pool.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON core.events TO seta_app`);

      const appUrl = appRoleUrl(databaseUrl);
      initPools({ databaseUrl, appDatabaseUrl: appUrl });
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

      // Drives parse_knowledge_file the way wrapJob does in production: inside
      // scoped(tenant_id, ...), resolving the job's pool via executorPool() from
      // inside that context — the app pool, no CREATE. This is what proves
      // ensureChunksPartition's CREATE TABLE ... PARTITION OF only succeeds because
      // its call site runs under maintenance(), not because the test cheated the
      // privilege boundary away.
      await scoped(tenant_id, () =>
        parseKnowledgeFile(
          { tenant_id, file_id, event_id: randomUUID() },
          { pool: executorPool(), fetchObject, enqueueEmbedJob: async () => {} },
        ),
      );

      // parseKnowledgeFile swallows ensureChunksPartition's error into the file row
      // instead of rethrowing (by design — see the comment at its catch block), so a
      // failure here surfaces as status=failed with the raw Postgres error in
      // error_reason rather than a thrown exception.
      const fileStatus = await pool.query<{ status: string; error_reason: string | null }>(
        `SELECT status, error_reason FROM knowledge.files WHERE id = $1`,
        [file_id],
      );
      expect(fileStatus.rows[0]?.status, `error_reason: ${fileStatus.rows[0]?.error_reason}`).toBe(
        'embedding',
      );

      const partition = await pool.query<{ exists: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE c.relname = $1 AND n.nspname = 'knowledge'
         ) AS exists`,
        [`chunks_${tenant_id.replaceAll('-', '_')}`],
      );
      expect(partition.rows[0]?.exists).toBe(true);

      await scoped(tenant_id, () =>
        embedKnowledgeChunks(
          { tenant_id, file_id, event_id: randomUUID() },
          { pool: executorPool(), pgVector, provider },
        ),
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
