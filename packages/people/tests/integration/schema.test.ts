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
  it('creates the five foundation tables', async () => {
    await withTestDb(ctx, async ({ pool }) => {
      const r = await pool.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema='people' ORDER BY 1`,
      );
      expect(r.rows.map((x) => x.table_name)).toEqual([
        'employment_period',
        'person',
        'person_skill',
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

  it('worker.portal_access defaults to false', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { worker_id } = await provisionWorker({
          full_name: 'Portal Default',
          start_date: '2026-06-19',
          employment_type: 'full_time',
          session: t.adminSession,
        });
        const [w] = await peopleDb().select().from(worker).where(eq(worker.person_id, worker_id));
        expect(w?.portal_access).toBe(false);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
