import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import { worker } from '../../src/backend/db/schema.ts';
import { provisionWorker } from '../../src/index.ts';
import { seedOrgUnit, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('worker.job_title + worker.org_unit_id', () => {
  it('round-trips job_title and org_unit_id on the worker table', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);

        const { worker_id: reportId } = await provisionWorker({
          full_name: 'Report Person',
          start_date: '2026-01-02',
          employment_type: 'full_time',
          session: t.adminSession,
        });

        const unit = await seedOrgUnit({
          tenant_id: t.tenant_id,
          name: 'Engineering',
          kind: 'function',
        });

        await peopleDb()
          .update(worker)
          .set({ job_title: 'Software Engineer', org_unit_id: unit })
          .where(eq(worker.person_id, reportId));

        const [w] = await peopleDb().select().from(worker).where(eq(worker.person_id, reportId));

        expect(w?.job_title).toBe('Software Engineer');
        expect(w?.org_unit_id).toBe(unit);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('worker_by_org_unit index exists', async () => {
    await withTestDb(ctx, async ({ pool }) => {
      const idx = await pool.query(
        `SELECT indexname FROM pg_indexes WHERE schemaname='people' AND indexname='worker_by_org_unit'`,
      );
      expect(idx.rowCount).toBe(1);
    });
  });
});
