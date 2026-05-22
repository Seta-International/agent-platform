import { resetCoreDb } from '@seta/core/internal/test-support';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';

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

describe('copilot.tenant_knowledge_files', () => {
  it('has expected columns', () =>
    withDb(async ({ pool }) => {
      const cols = await pool.query<{ column_name: string }>(`
        SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'copilot' AND table_name = 'tenant_knowledge_files'
         ORDER BY ordinal_position
      `);
      expect(cols.rows.map((r) => r.column_name)).toEqual([
        'id',
        'tenant_id',
        'uploaded_by',
        'filename',
        'mime_type',
        'size_bytes',
        's3_key',
        'status',
        'error_reason',
        'created_at',
        'processed_at',
      ]);
    }));
});

it('creates copilot.tenant_knowledge_chunks (LIST partitioned)', async () => {
  await withDb(async ({ pool }) => {
    const part = await pool.query<{ partstrat: string }>(`
      SELECT partstrat::text FROM pg_partitioned_table
       WHERE partrelid = 'copilot.tenant_knowledge_chunks'::regclass
    `);
    expect(part.rows[0]?.partstrat).toBe('l');

    const cols = await pool.query<{ column_name: string }>(`
      SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'copilot' AND table_name = 'tenant_knowledge_chunks'
       ORDER BY ordinal_position
    `);
    expect(cols.rows.map((r) => r.column_name)).toEqual([
      'tenant_id',
      'file_id',
      'chunk_ordinal',
      'chunk_text',
      'page_hint',
    ]);
  });
});

it('creates copilot.tenant_knowledge_embeddings (LIST partitioned, halfvec)', async () => {
  await withDb(async ({ pool }) => {
    const part = await pool.query<{ partstrat: string }>(`
      SELECT partstrat::text FROM pg_partitioned_table
       WHERE partrelid = 'copilot.tenant_knowledge_embeddings'::regclass
    `);
    expect(part.rows[0]?.partstrat).toBe('l');

    const halfvec = await pool.query<{ data_type: string }>(`
      SELECT data_type FROM information_schema.columns
       WHERE table_schema = 'copilot' AND table_name = 'tenant_knowledge_embeddings'
         AND column_name = 'embedding'
    `);
    // The reported type for halfvec via information_schema is 'USER-DEFINED'.
    expect(halfvec.rows[0]?.data_type).toBe('USER-DEFINED');
  });
});
