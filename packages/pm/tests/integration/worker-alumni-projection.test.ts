import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import type { DomainEvent } from '@seta/shared-types';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { pmDb, resetPmDb } from '../../src/backend/db/client.ts';
import { personProjection } from '../../src/backend/db/schema.ts';
import {
  PEOPLE_WORKER_REINSTATED,
  PEOPLE_WORKER_TERMINATED,
  type PeopleWorkerLifecycle,
  workerProjectionCreated,
  workerProjectionReinstated,
  workerProjectionTerminated,
} from '../../src/backend/subscribers/worker-projection.ts';
import { seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

function lifecycleEvent(
  eventType: string,
  payload: PeopleWorkerLifecycle,
): DomainEvent<PeopleWorkerLifecycle> {
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

const terminatedEvent = (payload: PeopleWorkerLifecycle) =>
  lifecycleEvent(PEOPLE_WORKER_TERMINATED, payload);
const reinstatedEvent = (payload: PeopleWorkerLifecycle) =>
  lifecycleEvent(PEOPLE_WORKER_REINSTATED, payload);

describe('workerProjectionTerminated / workerProjectionReinstated', () => {
  it('sets is_alumni=true on terminate, then false again on reinstate', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const workerId = crypto.randomUUID();

        await pmDb().transaction(async (tx) => {
          await workerProjectionCreated.handler(
            {
              id: crypto.randomUUID(),
              tenantId: t.tenant_id,
              aggregateType: 'people.worker',
              aggregateId: workerId,
              eventType: 'people.worker.created',
              eventVersion: 1,
              payload: {
                worker_id: workerId,
                tenant_id: t.tenant_id,
                full_name: 'Dana Alumni',
                job_title: 'Engineer',
              },
            } as never,
            { tx } as never,
          );
        });

        const payload: PeopleWorkerLifecycle = {
          worker_id: workerId,
          person_id: workerId,
          tenant_id: t.tenant_id,
        };

        await pmDb().transaction(async (tx) => {
          await workerProjectionTerminated.handler(terminatedEvent(payload), { tx } as never);
        });

        let [row] = await pmDb()
          .select()
          .from(personProjection)
          .where(eq(personProjection.person_id, workerId));
        expect(row?.is_alumni).toBe(true);

        await pmDb().transaction(async (tx) => {
          await workerProjectionReinstated.handler(reinstatedEvent(payload), { tx } as never);
        });

        [row] = await pmDb()
          .select()
          .from(personProjection)
          .where(eq(personProjection.person_id, workerId));
        expect(row?.is_alumni).toBe(false);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('is a no-op when no projection row exists yet (never fabricates one)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const workerId = crypto.randomUUID();

        await pmDb().transaction(async (tx) => {
          await workerProjectionTerminated.handler(
            terminatedEvent({ worker_id: workerId, person_id: workerId, tenant_id: t.tenant_id }),
            { tx } as never,
          );
        });

        const rows = await pmDb()
          .select()
          .from(personProjection)
          .where(eq(personProjection.person_id, workerId));
        expect(rows).toHaveLength(0);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
