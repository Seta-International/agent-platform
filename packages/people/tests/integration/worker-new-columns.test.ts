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

describe('worker.job_title + worker.manager_id', () => {
  it('round-trips job_title and manager_id (self-FK) on the worker table', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);

        // Insert manager first so the FK is satisfied
        const { worker_id: managerId } = await provisionWorker({
          full_name: 'Manager Person',
          start_date: '2026-01-01',
          employment_type: 'full_time',
          session: t.adminSession,
        });

        // Insert report with job_title + manager_id pointing at the manager
        const { worker_id: reportId } = await provisionWorker({
          full_name: 'Report Person',
          start_date: '2026-01-02',
          employment_type: 'full_time',
          session: t.adminSession,
        });

        // Set job_title + manager_id via direct DB update (domain fns added in Task 1.8)
        await peopleDb()
          .update(worker)
          .set({ job_title: 'Software Engineer', manager_id: managerId })
          .where(eq(worker.person_id, reportId));

        const [w] = await peopleDb().select().from(worker).where(eq(worker.person_id, reportId));

        expect(w?.job_title).toBe('Software Engineer');
        expect(w?.manager_id).toBe(managerId);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('worker_by_manager index exists', async () => {
    await withTestDb(ctx, async ({ pool }) => {
      const idx = await pool.query(
        `SELECT indexname FROM pg_indexes WHERE schemaname='people' AND indexname='worker_by_manager'`,
      );
      expect(idx.rowCount).toBe(1);
    });
  });

  it('worker_manager_fk constraint exists', async () => {
    await withTestDb(ctx, async ({ pool }) => {
      const c = await pool.query(
        `SELECT conname FROM pg_constraint WHERE conname='worker_manager_fk'`,
      );
      expect(c.rowCount).toBe(1);
    });
  });
});
