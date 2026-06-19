import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('people schema migration', () => {
  it('creates the four foundation tables', async () => {
    await withTestDb(ctx, async ({ pool }) => {
      const r = await pool.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema='people' ORDER BY 1`,
      );
      expect(r.rows.map((x) => x.table_name)).toEqual([
        'employment_period',
        'person',
        'worker',
        'worker_history',
      ]);
    });
  });

  it('enforces one open employment_period per person', async () => {
    await withTestDb(ctx, async ({ pool }) => {
      const idx = await pool.query(
        `SELECT indexname FROM pg_indexes WHERE schemaname='people' AND indexname='employment_period_one_open'`,
      );
      expect(idx.rowCount).toBe(1);
    });
  });

  it('constrains lifecycle_stage to the known stages', async () => {
    await withTestDb(ctx, async ({ pool }) => {
      const c = await pool.query(
        `SELECT conname FROM pg_constraint WHERE conname='employment_period_lifecycle_stage_check'`,
      );
      expect(c.rowCount).toBe(1);
    });
  });
});
