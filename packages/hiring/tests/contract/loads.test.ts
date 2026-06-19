import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('hiring schema', () => {
  it('migrates the three foundation tables', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      initPools({ databaseUrl });
      try {
        const r = await pool.query(
          `SELECT table_name FROM information_schema.tables
             WHERE table_schema = 'hiring' ORDER BY table_name`,
        );
        expect(r.rows.map((x) => x.table_name)).toEqual([
          'application',
          'candidate',
          'requisition',
        ]);
      } finally {
        await closePools();
      }
    });
  });
});
