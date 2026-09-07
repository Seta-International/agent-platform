import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { and, eq, isNull } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import { employmentPeriod } from '../../src/backend/db/schema.ts';
import {
  reinstateWorker,
  terminateWorker,
} from '../../src/backend/domain/set-employment-status.ts';
import { createWorker } from '../../src/index.ts';
import { readEvents, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('employment status transitions', () => {
  it('terminate closes the open period, stamps alumni, and emits people.worker.terminated', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { worker_id } = await createWorker({
          full_name: 'Alice Terminate',
          session: t.adminSession,
        });
        const person_id = worker_id; // worker_id = person.id in this schema

        const res = await terminateWorker({ worker_id, session: t.adminSession });
        expect(res.status).toBe('terminated');

        const [open] = await peopleDb()
          .select()
          .from(employmentPeriod)
          .where(and(eq(employmentPeriod.person_id, person_id), isNull(employmentPeriod.end_date)));
        expect(open).toBeUndefined(); // open period closed

        // The close and the stage stamp land in one UPDATE, so assert both: the admin screen's
        // "End employment" button routes here, and `alumni` is the status it leaves behind.
        const [closed] = await peopleDb()
          .select()
          .from(employmentPeriod)
          .where(eq(employmentPeriod.person_id, person_id));
        expect(closed?.lifecycle_stage).toBe('alumni');
        expect(closed?.end_date).toBe(new Date().toISOString().slice(0, 10));

        const events = await readEvents(pool, t.tenant_id, 'people.worker.terminated');
        expect(events).toHaveLength(1);
        expect(events[0]?.aggregate_id).toBe(worker_id);
        expect(events[0]?.payload).toMatchObject({ worker_id, person_id, tenant_id: t.tenant_id });
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('reinstate opens a new period and emits people.worker.reinstated', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { worker_id } = await createWorker({
          full_name: 'Bob Reinstate',
          session: t.adminSession,
        });
        const person_id = worker_id; // worker_id = person.id in this schema
        await terminateWorker({ worker_id, session: t.adminSession });

        const res = await reinstateWorker({ worker_id, session: t.adminSession });
        expect(res.status).toBe('active');

        const [open] = await peopleDb()
          .select()
          .from(employmentPeriod)
          .where(and(eq(employmentPeriod.person_id, person_id), isNull(employmentPeriod.end_date)));
        expect(open).toBeDefined();
        expect(open?.lifecycle_stage).toBe('active');

        const events = await readEvents(pool, t.tenant_id, 'people.worker.reinstated');
        expect(events).toHaveLength(1);
        expect(events[0]?.aggregate_id).toBe(worker_id);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('terminateWorker throws NOT_FOUND for unknown worker_id', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        await expect(
          terminateWorker({ worker_id: crypto.randomUUID(), session: t.adminSession }),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
