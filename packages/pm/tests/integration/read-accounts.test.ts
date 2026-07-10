import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { resetPmDb } from '../../src/backend/db/client.ts';
import { createAccount, getAccount, listAccounts } from '../../src/index.ts';
import { inScope, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('read accounts', () => {
  it('listAccounts returns tenant rows with recruiter_count and project_count, tenant-scoped only', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t1 = await seedTenant(pool);
        const t2 = await seedTenant(pool);
        const r1 = crypto.randomUUID();
        const { account_id } = await inScope(t1.adminSession, () =>
          createAccount({
            name: 'Acme',
            recruiter_worker_ids: [r1],
            session: t1.adminSession,
          }),
        );
        // a project under the account → project_count = 1
        await pool.query(
          `INSERT INTO pm.project (tenant_id, account_id, name) VALUES ($1,$2,'P1')`,
          [t1.tenant_id, account_id],
        );
        // an org-B account must NOT appear for t1
        await inScope(t2.adminSession, () =>
          createAccount({ name: 'OtherOrg', session: t2.adminSession }),
        );

        const rows = await inScope(t1.adminSession, () => listAccounts(t1.adminSession));
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          account_id,
          name: 'Acme',
          recruiter_count: 1,
          project_count: 1,
        });
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('getAccount returns the account with its recruiter id set; unknown id is NOT_FOUND', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const r1 = crypto.randomUUID();
        const r2 = crypto.randomUUID();
        const { account_id } = await inScope(t.adminSession, () =>
          createAccount({
            name: 'Acme',
            recruiter_worker_ids: [r1, r2],
            session: t.adminSession,
          }),
        );

        const detail = await inScope(t.adminSession, () =>
          getAccount({ account_id, session: t.adminSession }),
        );
        expect(detail.name).toBe('Acme');
        expect([...detail.recruiter_worker_ids].sort()).toEqual([r1, r2].sort());

        await expect(
          inScope(t.adminSession, () =>
            getAccount({ account_id: crypto.randomUUID(), session: t.adminSession }),
          ),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
