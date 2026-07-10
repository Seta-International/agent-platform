import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools, scoped } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import type { DomainEvent } from '@seta/shared-types';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { pmDb, resetPmDb } from '../../src/backend/db/client.ts';
import { workerProjection } from '../../src/backend/db/schema.ts';
import {
  PEOPLE_WORKER_CREATED,
  PEOPLE_WORKER_UPDATED,
  type PeopleWorkerProjected,
  workerProjectionCreated,
  workerProjectionUpdated,
} from '../../src/backend/subscribers/worker-projection.ts';
import { seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

function workerEvent(
  eventType: string,
  payload: PeopleWorkerProjected,
): DomainEvent<PeopleWorkerProjected> {
  return {
    id: crypto.randomUUID(),
    tenantId: payload.tenant_id,
    aggregateType: 'people.worker',
    aggregateId: payload.worker_id,
    eventType,
    eventVersion: 1,
    payload,
  } as never;
}

const createdEvent = (payload: PeopleWorkerProjected) =>
  workerEvent(PEOPLE_WORKER_CREATED, payload);
const updatedEvent = (payload: PeopleWorkerProjected) =>
  workerEvent(PEOPLE_WORKER_UPDATED, payload);

describe('workerProjectionCreated', () => {
  it('inserts a worker_projection row with name and title', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const workerId = crypto.randomUUID();

        const payload: PeopleWorkerProjected = {
          worker_id: workerId,
          tenant_id: t.tenant_id,
          full_name: 'Alice Example',
          job_title: 'Senior Engineer',
        };

        await scoped(t.tenant_id, () =>
          pmDb().transaction(async (tx) => {
            await workerProjectionCreated.handler(createdEvent(payload), { tx } as never);
          }),
        );

        const rows = await scoped(t.tenant_id, () =>
          pmDb().select().from(workerProjection).where(eq(workerProjection.worker_id, workerId)),
        );

        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          worker_id: workerId,
          tenant_id: t.tenant_id,
          full_name: 'Alice Example',
          job_title: 'Senior Engineer',
        });
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('handles null job_title', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const workerId = crypto.randomUUID();

        const payload: PeopleWorkerProjected = {
          worker_id: workerId,
          tenant_id: t.tenant_id,
          full_name: 'Bob NoTitle',
          job_title: null,
        };

        await scoped(t.tenant_id, () =>
          pmDb().transaction(async (tx) => {
            await workerProjectionCreated.handler(createdEvent(payload), { tx } as never);
          }),
        );

        const rows = await scoped(t.tenant_id, () =>
          pmDb().select().from(workerProjection).where(eq(workerProjection.worker_id, workerId)),
        );

        expect(rows).toHaveLength(1);
        expect(rows[0]?.job_title).toBeNull();
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});

describe('workerProjectionUpdated', () => {
  it('upserts the projection row with the new name', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const workerId = crypto.randomUUID();

        // seed an initial row via created event
        await scoped(t.tenant_id, () =>
          pmDb().transaction(async (tx) => {
            await workerProjectionCreated.handler(
              createdEvent({
                worker_id: workerId,
                tenant_id: t.tenant_id,
                full_name: 'Carol Original',
                job_title: 'Developer',
              }),
              { tx } as never,
            );
          }),
        );

        // then fire updated event with new name
        const updatePayload: PeopleWorkerProjected = {
          worker_id: workerId,
          tenant_id: t.tenant_id,
          full_name: 'Carol Renamed',
          job_title: 'Developer',
        };

        await scoped(t.tenant_id, () =>
          pmDb().transaction(async (tx) => {
            await workerProjectionUpdated.handler(updatedEvent(updatePayload), { tx } as never);
          }),
        );

        const rows = await scoped(t.tenant_id, () =>
          pmDb().select().from(workerProjection).where(eq(workerProjection.worker_id, workerId)),
        );

        expect(rows).toHaveLength(1);
        expect(rows[0]?.full_name).toBe('Carol Renamed');
        expect(rows[0]?.job_title).toBe('Developer');
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
