import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { resetPmDb } from '../../src/backend/db/client.ts';
import {
  createAccount,
  listAccountIdsManagedBy,
  listAccountManagers,
  listProjectIdsOwnedBy,
  setProjectAccess,
  submitCharter,
} from '../../src/index.ts';
import { approveCharterTwoStage, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('scope lookups', () => {
  it('resolves accounts managed by and projects owned by a person (owner-level only)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const managerId = crypto.randomUUID();
        const otherId = crypto.randomUUID();

        const { account_id } = await createAccount({
          name: 'Acme',
          am_worker_id: managerId,
          session: t.adminSession,
        });

        const { project_id: charterId } = await submitCharter({
          account_id,
          name: 'Project A',
          pm_worker_id: t.adminSession.user_id,
          methodology: 'scrum',
          pricing_model: 'fixed_price',
          budget_bmm: 100,
          session: t.adminSession,
        });
        const { project_id } = await approveCharterTwoStage(charterId, t.tenant_id);

        await setProjectAccess({
          project_id,
          grants: [
            { worker_id: managerId, level: 'owner' },
            { worker_id: otherId, level: 'view' },
          ],
          session: t.adminSession,
        });

        expect(await listAccountIdsManagedBy(managerId, t.tenant_id)).toEqual([account_id]);
        expect(await listProjectIdsOwnedBy(managerId, t.tenant_id)).toEqual([project_id]);
        expect(await listProjectIdsOwnedBy(otherId, t.tenant_id)).toEqual([]);

        const managers = await listAccountManagers(t.tenant_id);
        expect(managers).toContainEqual({ account_id, am_person_id: managerId });
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('is tenant-scoped: a matching person/account in another tenant is not returned', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t1 = await seedTenant(pool);
        const t2 = await seedTenant(pool);
        const managerId = crypto.randomUUID();

        const { account_id } = await createAccount({
          name: 'Acme',
          am_worker_id: managerId,
          session: t1.adminSession,
        });
        const { project_id: charterId } = await submitCharter({
          account_id,
          name: 'Project A',
          pm_worker_id: t1.adminSession.user_id,
          methodology: 'scrum',
          pricing_model: 'fixed_price',
          budget_bmm: 100,
          session: t1.adminSession,
        });
        const { project_id } = await approveCharterTwoStage(charterId, t1.tenant_id);
        await setProjectAccess({
          project_id,
          grants: [{ worker_id: managerId, level: 'owner' }],
          session: t1.adminSession,
        });

        expect(await listAccountIdsManagedBy(managerId, t2.tenant_id)).toEqual([]);
        expect(await listProjectIdsOwnedBy(managerId, t2.tenant_id)).toEqual([]);
        expect(await listAccountManagers(t2.tenant_id)).toEqual([]);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
