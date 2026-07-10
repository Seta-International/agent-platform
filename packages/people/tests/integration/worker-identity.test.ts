import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { resetPeopleDb } from '../../src/backend/db/client.ts';
import { createWorker } from '../../src/backend/domain/create-worker.ts';
import { getWorkerIdForUser } from '../../src/backend/domain/worker-identity.ts';
import { linkUserToPerson, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

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
        await linkUserToPerson(t.tenant_id, worker_id, userId);

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
