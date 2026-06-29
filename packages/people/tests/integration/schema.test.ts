import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import { worker } from '../../src/backend/db/schema.ts';
import { provisionWorker } from '../../src/index.ts';
import { seedTenant } from '../helpers.ts';

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
        'org_unit',
        'person',
        'person_skill',
        'project_projection',
        'worker',
        'worker_allocation_projection',
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
