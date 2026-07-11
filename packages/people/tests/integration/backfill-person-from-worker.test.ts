import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { and, eq, isNull } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import { employmentPeriod, person, worker } from '../../src/backend/db/schema.ts';
import { seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const BACKFILL_SQL = readFileSync(
  resolve(__dirname, '../../drizzle/migrations/0008_backfill_person_from_worker.sql'),
  'utf-8',
);

describe('person/employment_period backfill from worker (0008)', () => {
  it('copies biographical fields onto person and job_title onto the open period', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);

        // Seed the PRE-fold shape directly: raw worker rows carry biographical data, person rows
        // are bare, and job_title still lives on worker — exactly what migration 0008 backfills.
        const tenant_id = t.tenant_id;

        // liveId: live worker + open period → biographical + job_title get copied.
        const liveId = crypto.randomUUID();
        await peopleDb().insert(person).values({ id: liveId, tenant_id });
        await peopleDb().insert(worker).values({
          tenant_id,
          person_id: liveId,
          full_name: 'Alice Example',
          work_email: 'alice@example.test',
          job_title: 'Senior Engineer',
        });
        await peopleDb()
          .insert(employmentPeriod)
          .values({ tenant_id, person_id: liveId, seq: 1, lifecycle_stage: 'active' });

        // deletedId: soft-deleted worker → deleted_at copied onto person.
        const deletedId = crypto.randomUUID();
        await peopleDb().insert(person).values({ id: deletedId, tenant_id });
        await peopleDb().insert(worker).values({
          tenant_id,
          person_id: deletedId,
          full_name: 'Departed Worker',
          job_title: 'Contractor',
        });
        await peopleDb()
          .insert(employmentPeriod)
          .values({ tenant_id, person_id: deletedId, seq: 1, lifecycle_stage: 'active' });
        await pool.query(`UPDATE people.worker SET deleted_at = now() WHERE person_id = $1`, [
          deletedId,
        ]);

        // noOpenPeriodId: only a CLOSED period → job_title must NOT be copied.
        const noOpenPeriodId = crypto.randomUUID();
        await peopleDb().insert(person).values({ id: noOpenPeriodId, tenant_id });
        await peopleDb().insert(worker).values({
          tenant_id,
          person_id: noOpenPeriodId,
          full_name: 'Closed Period Worker',
          job_title: 'Analyst',
        });
        await peopleDb().insert(employmentPeriod).values({
          tenant_id,
          person_id: noOpenPeriodId,
          seq: 1,
          lifecycle_stage: 'alumni',
          start_date: '2020-01-01',
          end_date: '2021-01-01',
        });

        // RED: before the backfill runs, person.full_name is still null.
        const [beforeLive] = await peopleDb().select().from(person).where(eq(person.id, liveId));
        expect(beforeLive?.full_name).toBeNull();

        await pool.query(BACKFILL_SQL);

        const [liveWorker] = await peopleDb()
          .select()
          .from(worker)
          .where(eq(worker.person_id, liveId));
        const [livePerson] = await peopleDb().select().from(person).where(eq(person.id, liveId));
        expect(livePerson?.full_name).toBe(liveWorker?.full_name);
        expect(livePerson?.work_email).toBe(liveWorker?.work_email);

        const [liveOpenPeriod] = await peopleDb()
          .select()
          .from(employmentPeriod)
          .where(and(eq(employmentPeriod.person_id, liveId), isNull(employmentPeriod.end_date)));
        expect(liveOpenPeriod?.job_title).toBe('Senior Engineer');

        const [deletedWorker] = await peopleDb()
          .select()
          .from(worker)
          .where(eq(worker.person_id, deletedId));
        const [deletedPerson] = await peopleDb()
          .select()
          .from(person)
          .where(eq(person.id, deletedId));
        expect(deletedPerson?.full_name).toBe('Departed Worker');
        expect(deletedPerson?.deleted_at).not.toBeNull();
        expect(deletedWorker?.deleted_at).not.toBeNull();

        const [noOpenPersonRow] = await peopleDb()
          .select()
          .from(person)
          .where(eq(person.id, noOpenPeriodId));
        expect(noOpenPersonRow?.full_name).toBe('Closed Period Worker');

        const closedPeriod = await peopleDb()
          .select()
          .from(employmentPeriod)
          .where(eq(employmentPeriod.person_id, noOpenPeriodId));
        expect(closedPeriod).toHaveLength(1);
        expect(closedPeriod[0]?.job_title).toBeNull();
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
