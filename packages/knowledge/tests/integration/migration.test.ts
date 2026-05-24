import { resetCoreDb } from '@seta/core/testing';
import { resetKnowledgeDb } from '@seta/knowledge/testing';
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

describe('knowledge.files', () => {
  it('has expected columns', () =>
    withDb(async ({ pool }) => {
      const cols = await pool.query<{ column_name: string }>(`
        SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'knowledge' AND table_name = 'files'
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
        'scan_status',
        'scan_at',
        'scan_detail',
      ]);
    }));
});

it('creates knowledge.chunks (LIST partitioned)', async () => {
  await withDb(async ({ pool }) => {
    const part = await pool.query<{ partstrat: string }>(`
      SELECT partstrat::text FROM pg_partitioned_table
       WHERE partrelid = 'knowledge.chunks'::regclass
    `);
    expect(part.rows[0]?.partstrat).toBe('l');

    const cols = await pool.query<{ column_name: string }>(`
      SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'knowledge' AND table_name = 'chunks'
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

it('creates knowledge.embeddings (LIST partitioned, halfvec)', async () => {
  await withDb(async ({ pool }) => {
    const part = await pool.query<{ partstrat: string }>(`
      SELECT partstrat::text FROM pg_partitioned_table
       WHERE partrelid = 'knowledge.embeddings'::regclass
    `);
    expect(part.rows[0]?.partstrat).toBe('l');

    const halfvec = await pool.query<{ data_type: string }>(`
      SELECT data_type FROM information_schema.columns
       WHERE table_schema = 'knowledge' AND table_name = 'embeddings'
         AND column_name = 'embedding'
    `);
    expect(halfvec.rows[0]?.data_type).toBe('USER-DEFINED');
  });
});
