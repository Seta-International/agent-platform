import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('hiring schema', () => {
  it('migrates all nine hiring tables', async () => {
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
          'jd_template',
          'jd_template_section',
          'opening',
          'opening_close_reason',
          'requisition',
          'requisition_jd_section',
          'requisition_skill',
        ]);
      } finally {
        await closePools();
      }
    });
  });
});
