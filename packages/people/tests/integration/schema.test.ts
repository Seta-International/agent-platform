import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('people schema migration', () => {
  it('creates the people schema tables', async () => {
    await withTestDb(ctx, async ({ pool }) => {
      const r = await pool.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema='people' ORDER BY 1`,
      );
      expect(r.rows.map((x) => x.table_name)).toEqual([
        'account_projection',
        'employment_period',
        'morale_note',
        'morale_note_recipient',
        'morale_rating_aggregate',
        'org_unit',
        'performance_config_criterion',
        'performance_config_group_weight',
        'performance_config_month_pin',
        'performance_config_revision',
        'performance_evaluation_group',
        'person',
        'person_history',
        'person_skill',
        'project_projection',
        'user_projection',
        'worker_allocation_projection',
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
