import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import { employmentPeriod, person } from '../../src/backend/db/schema.ts';
import { seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('people.person biographical columns', () => {
  it('round-trips biographical columns on person and job_title on employment_period', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const personId = crypto.randomUUID();

        await peopleDb().insert(person).values({
          id: personId,
          tenant_id: t.tenant_id,
          full_name: 'Ada Lovelace',
          work_email: 'ada@example.test',
          availability_status: 'available',
          org_unit_id: null,
        });

        const [row] = await peopleDb().select().from(person).where(eq(person.id, personId));

        expect(row?.full_name).toBe('Ada Lovelace');
        expect(row?.work_email).toBe('ada@example.test');
        expect(row?.availability_status).toBe('available');
        expect(row?.org_unit_id).toBeNull();

        await peopleDb().insert(employmentPeriod).values({
          tenant_id: t.tenant_id,
          person_id: personId,
          seq: 1,
          job_title: 'Software Engineer',
        });

        const [period] = await peopleDb()
          .select()
          .from(employmentPeriod)
          .where(eq(employmentPeriod.person_id, personId));

        expect(period?.job_title).toBe('Software Engineer');
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('rejects a second live person with the same (tenant_id, work_email)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);

        await peopleDb().insert(person).values({
          tenant_id: t.tenant_id,
          full_name: 'First Person',
          work_email: 'dupe@example.test',
        });

        await expect(
          peopleDb().insert(person).values({
            tenant_id: t.tenant_id,
            full_name: 'Second Person',
            work_email: 'dupe@example.test',
          }),
        ).rejects.toThrow();
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
