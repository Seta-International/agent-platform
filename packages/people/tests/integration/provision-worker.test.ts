import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import { employmentPeriod, person, worker, workerHistory } from '../../src/backend/db/schema.ts';
import { provisionWorker } from '../../src/index.ts';
import { countEvents, readEvents, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('provisionWorker', () => {
  it('creates person + open period + worker + history and emits worker.created in one tx', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);

        const { worker_id } = await provisionWorker({
          full_name: 'Alice Example',
          start_date: '2026-06-19',
          employment_type: 'full_time',
          session: t.adminSession,
        });

        const [p] = await peopleDb().select().from(person).where(eq(person.id, worker_id));
        expect(p?.tenant_id).toBe(t.tenant_id);

        const periods = await peopleDb()
          .select()
          .from(employmentPeriod)
          .where(eq(employmentPeriod.person_id, worker_id));
        expect(periods).toHaveLength(1);
        expect(periods[0]?.seq).toBe(1);
        expect(periods[0]?.lifecycle_stage).toBe('preboarding');
        expect(periods[0]?.end_date).toBeNull();

        const [w] = await peopleDb().select().from(worker).where(eq(worker.person_id, worker_id));
        expect(w?.full_name).toBe('Alice Example');

        const history = await peopleDb()
          .select()
          .from(workerHistory)
          .where(eq(workerHistory.person_id, worker_id));
        expect(history.map((h) => h.action)).toContain('provisioned');

        const events = await readEvents(pool, t.tenant_id, 'people.worker.created');
        expect(events).toHaveLength(1);
        expect(events[0]?.aggregate_id).toBe(worker_id);
        expect(events[0]?.payload.worker_id).toBe(worker_id);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('is atomic: a failure after the person insert persists nothing', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);

        // start_date 'not-a-date' fails the Postgres date cast inside the tx → full rollback.
        await expect(
          provisionWorker({
            full_name: 'Atomic Rollback',
            start_date: 'not-a-date',
            employment_type: 'full_time',
            session: t.adminSession,
          }),
        ).rejects.toThrow();

        const persons = await pool.query(
          `SELECT count(*)::int n FROM people.person WHERE tenant_id=$1`,
          [t.tenant_id],
        );
        expect(persons.rows[0].n).toBe(0);
        expect(await countEvents(pool, t.tenant_id, 'people.worker.created')).toBe(0);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
