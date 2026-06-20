import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('pm schema', () => {
  it('migrates the four pm tables', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      initPools({ databaseUrl });
      try {
        const r = await pool.query(
          `SELECT table_name FROM information_schema.tables
             WHERE table_schema = 'pm' ORDER BY table_name`,
        );
        expect(r.rows.map((x) => x.table_name)).toEqual([
          'account',
          'account_recruiter',
          'allocation',
          'project',
        ]);
      } finally {
        await closePools();
      }
    });
  });
});
