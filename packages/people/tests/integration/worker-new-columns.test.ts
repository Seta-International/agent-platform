import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { and, eq, isNull } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import { employmentPeriod, person } from '../../src/backend/db/schema.ts';
import { provisionWorker } from '../../src/index.ts';
import { seedOrgUnit, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('job_title (employment_period) + org_unit_id (person)', () => {
  it('round-trips org_unit_id on person and job_title on the open employment_period', async () => {
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

        await peopleDb().update(person).set({ org_unit_id: unit }).where(eq(person.id, reportId));
        await peopleDb()
          .update(employmentPeriod)
          .set({ job_title: 'Software Engineer' })
          .where(and(eq(employmentPeriod.person_id, reportId), isNull(employmentPeriod.end_date)));

        const [p] = await peopleDb().select().from(person).where(eq(person.id, reportId));
        expect(p?.org_unit_id).toBe(unit);

        const [ep] = await peopleDb()
          .select()
          .from(employmentPeriod)
          .where(and(eq(employmentPeriod.person_id, reportId), isNull(employmentPeriod.end_date)));
        expect(ep?.job_title).toBe('Software Engineer');
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
