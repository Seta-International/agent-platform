// packages/pm/tests/integration/list-allocations.test.ts
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { pmDb, resetPmDb } from '../../src/backend/db/client.ts';
import { workerProjection } from '../../src/backend/db/schema.ts';
import {
  createAccount,
  createAllocation,
  listAllocations,
  submitCharter,
} from '../../src/index.ts';
import { approveCharterTwoStage, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

async function seedProject(
  session: import('@seta/core').SessionScope,
  accName: string,
): Promise<{ projectId: string; accountId: string }> {
  const { account_id } = await createAccount({ name: accName, session });
  const { charter_id } = await submitCharter({
    account_id,
    name: `P-${accName}`,
    pm_worker_id: session.user_id,
    methodology: 'scrum',
    pricing_model: 'fixed_price',
    budget_bmm: 100,
    session,
  });
  const { project_id } = await approveCharterTwoStage(charter_id, session.tenant_id);
  return { projectId: project_id, accountId: account_id };
}

describe('listAllocations', () => {
  it('returns rows with project/account names, filters and overlap window', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const a = await seedProject(t.adminSession, 'Acme');
        const b = await seedProject(t.adminSession, 'Globex');
        const mk = (projectId: string, from: string, to: string) =>
          createAllocation({
            project_id: projectId,
            worker_id: crypto.randomUUID(),
            role: 'DEV',
            date_from: from,
            date_to: to,
            bucket: 'billable',
            planned_pct: 50,
            status: 'committed',
            session: t.adminSession,
          });
        await mk(a.projectId, '2026-01-01', '2026-03-31'); // inside H1
        await mk(a.projectId, '2026-09-01', '2026-12-31'); // outside H1
        await mk(b.projectId, '2026-02-01', '2026-02-28'); // Globex, inside H1

        const all = await listAllocations({ session: t.adminSession });
        expect(all).toHaveLength(3);
        expect(all[0]?.account_name).toBeTruthy();
        expect(all[0]?.project_name).toBeTruthy();

        const acme = await listAllocations({ account_id: a.accountId, session: t.adminSession });
        expect(acme).toHaveLength(2);

        const oneProject = await listAllocations({
          project_id: b.projectId,
          session: t.adminSession,
        });
        expect(oneProject).toHaveLength(1);

        const h1 = await listAllocations({
          active_from: '2026-01-01',
          active_to: '2026-06-30',
          session: t.adminSession,
        });
        expect(h1).toHaveLength(2); // the Sep–Dec row is excluded
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('returns worker_name from projection and supports q search', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const proj = await seedProject(t.adminSession, 'SearchCo');

        const workerIdAlice = crypto.randomUUID();
        const workerIdBob = crypto.randomUUID();

        // seed worker projections
        await pmDb()
          .insert(workerProjection)
          .values([
            {
              worker_id: workerIdAlice,
              tenant_id: t.tenant_id,
              full_name: 'Alice Finder',
              job_title: 'Engineer',
            },
            {
              worker_id: workerIdBob,
              tenant_id: t.tenant_id,
              full_name: 'Bob Other',
              job_title: null,
            },
          ]);

        await createAllocation({
          project_id: proj.projectId,
          worker_id: workerIdAlice,
          role: 'DEV',
          date_from: '2026-01-01',
          date_to: '2026-06-30',
          bucket: 'billable',
          planned_pct: 100,
          status: 'committed',
          session: t.adminSession,
        });
        await createAllocation({
          project_id: proj.projectId,
          worker_id: workerIdBob,
          role: 'QA',
          date_from: '2026-01-01',
          date_to: '2026-06-30',
          bucket: 'billable',
          planned_pct: 50,
          status: 'committed',
          session: t.adminSession,
        });

        const all = await listAllocations({ session: t.adminSession });
        const alice = all.find((r) => r.worker_id === workerIdAlice);
        expect(alice?.worker_name).toBe('Alice Finder');
        expect(alice?.worker_title).toBe('Engineer');

        const bob = all.find((r) => r.worker_id === workerIdBob);
        expect(bob?.worker_name).toBe('Bob Other');
        expect(bob?.worker_title).toBeNull();

        // q search matches partial name
        const found = await listAllocations({ q: 'Finder', session: t.adminSession });
        expect(found).toHaveLength(1);
        expect(found[0]?.worker_name).toBe('Alice Finder');

        // q search on project name
        const byProject = await listAllocations({ q: 'SearchCo', session: t.adminSession });
        expect(byProject).toHaveLength(2);

        // q search with no match
        const empty = await listAllocations({ q: 'NoMatch_XYZ_42', session: t.adminSession });
        expect(empty).toHaveLength(0);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
