import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import { person } from '../../src/backend/db/schema.ts';
import { createWorker } from '../../src/backend/domain/create-worker.ts';
import { getWorkerIdForUser } from '../../src/backend/domain/worker-identity.ts';
import { seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

/** Rebind a worker's person.user_id to a known session user id, mirroring worker-scope.test.ts:25-38. */
async function rebindPersonUser(workerId: string, userId: string): Promise<void> {
  await peopleDb().update(person).set({ user_id: userId }).where(eq(person.id, workerId));
}

describe('getWorkerIdForUser', () => {
  it('resolves the worker id for a linked user and null otherwise', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const userId = crypto.randomUUID();
        const { worker_id } = await createWorker({
          session: t.adminSession,
          full_name: 'W One',
        } as never);
        await rebindPersonUser(worker_id, userId);

        expect(await getWorkerIdForUser(userId, t.tenant_id)).toBe(worker_id);
        expect(await getWorkerIdForUser(crypto.randomUUID(), t.tenant_id)).toBeNull();
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
