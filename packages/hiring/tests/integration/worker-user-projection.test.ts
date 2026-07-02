// packages/hiring/tests/integration/worker-user-projection.test.ts
// FUT-327: hiring's local {worker_id -> user_id} read-model, fed by people.worker.user_linked.
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import type { DomainEvent } from '@seta/shared-types';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { hiringDb, resetHiringDb } from '../../src/backend/db/client.ts';
import { workerUserProjection } from '../../src/backend/db/schema.ts';
import { workerUserProjectionLinked } from '../../src/backend/subscribers/worker-user-projection.ts';
import { seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('worker_user_projection subscriber', () => {
  it('upserts worker_id -> user_id, idempotently', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const worker_id = crypto.randomUUID();
        const user_id = crypto.randomUUID();
        const evt = {
          payload: { worker_id, person_id: worker_id, user_id, tenant_id: t.tenant_id },
        } as DomainEvent<unknown>;

        await workerUserProjectionLinked.handler(evt, { tx: hiringDb() });
        await workerUserProjectionLinked.handler(evt, { tx: hiringDb() });

        const rows = await hiringDb()
          .select()
          .from(workerUserProjection)
          .where(eq(workerUserProjection.worker_id, worker_id));
        expect(rows).toHaveLength(1);
        expect(rows[0]?.user_id).toBe(user_id);
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
