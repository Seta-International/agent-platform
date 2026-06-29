import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { identityDb, resetIdentityDb } from '../../src/backend/db/index.ts';
import { user } from '../../src/backend/db/schema.ts';
import { autoSuspendSubscribers } from '../../src/backend/subscribers/auto-suspend.ts';
import { dispatch } from '../helpers/bus.ts';
import { seedDirectoryAccount } from '../helpers/seed.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('autoSuspendSubscribers', () => {
  it('suspends the account on terminate and reactivates on reinstate', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetIdentityDb();
      initPools({ databaseUrl });
      try {
        const { person_id, user_id, tenant_id } = await seedDirectoryAccount(pool, {
          email: 'sus@acme.test',
          admin: false,
        });

        await dispatch(autoSuspendSubscribers, {
          eventType: 'people.worker.terminated',
          tenantId: tenant_id,
          payload: { person_id, tenant_id },
        });

        let [u] = await identityDb().select().from(user).where(eq(user.id, user_id));
        expect(u.deactivated_at).not.toBeNull();

        await dispatch(autoSuspendSubscribers, {
          eventType: 'people.worker.reinstated',
          tenantId: tenant_id,
          payload: { person_id, tenant_id },
        });

        [u] = await identityDb().select().from(user).where(eq(user.id, user_id));
        expect(u.deactivated_at).toBeNull();
      } finally {
        resetIdentityDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('skips (does not throw) when terminating would drop the last admin', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetIdentityDb();
      initPools({ databaseUrl });
      try {
        const { person_id, user_id, tenant_id } = await seedDirectoryAccount(pool, {
          email: 'lastadmin@acme.test',
          admin: true,
        });

        await expect(
          dispatch(autoSuspendSubscribers, {
            eventType: 'people.worker.terminated',
            tenantId: tenant_id,
            payload: { person_id, tenant_id },
          }),
        ).resolves.not.toThrow();

        const [u] = await identityDb().select().from(user).where(eq(user.id, user_id));
        expect(u.deactivated_at).toBeNull();
      } finally {
        resetIdentityDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
