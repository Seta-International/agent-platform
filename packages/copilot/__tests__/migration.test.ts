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
