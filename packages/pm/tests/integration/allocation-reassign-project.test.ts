import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { pmDb, resetPmDb } from '../../src/backend/db/client.ts';
import { allocation } from '../../src/backend/db/schema.ts';
import {
  createAccount,
  createAllocation,
  submitCharter,
  updateAllocation,
} from '../../src/index.ts';
import { approveCharterTwoStage, inScope, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

async function seedProject(
  session: import('@seta/core').SessionScope,
  overrides: { account_id?: string; date_from?: string; date_to?: string } = {},
): Promise<{ project_id: string; account_id: string }> {
  const account_id =
    overrides.account_id ??
    (await inScope(session, () => createAccount({ name: 'A', session }))).account_id;
  const { charter_id } = await inScope(session, () =>
    submitCharter({
      account_id,
      name: 'P',
      pm_worker_id: session.user_id,
      methodology: 'scrum',
      pricing_model: 'fixed_price',
      budget_bmm: 100,
      date_from: overrides.date_from,
      date_to: overrides.date_to,
      session,
    }),
  );
  const { project_id } = await approveCharterTwoStage(charter_id, session.tenant_id);
  return { project_id, account_id };
}

describe('allocation project reassignment via updateAllocation', () => {
  it('moves an allocation onto a different project', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectA = await seedProject(t.adminSession);
        const projectB = await seedProject(t.adminSession);
        const { allocation_id } = await inScope(t.adminSession, () =>
          createAllocation({
            project_id: projectA.project_id,
            worker_id: crypto.randomUUID(),
            date_from: '2026-05-01',
            date_to: '2026-05-31',
            bucket: 'billable',
            planned_pct: 50,
            status: 'committed',
            session: t.adminSession,
          }),
        );

        await inScope(t.adminSession, () =>
          updateAllocation({
            allocation_id,
            project_id: projectB.project_id,
            session: t.adminSession,
          }),
        );

        const [updated] = await inScope(t.adminSession, () =>
          pmDb().select().from(allocation).where(eq(allocation.id, allocation_id)),
        );
        expect(updated?.project_id).toBe(projectB.project_id);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('rejects moving to a project whose date range excludes the allocation', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectA = await seedProject(t.adminSession);
        const projectB = await seedProject(t.adminSession, {
          date_from: '2026-06-01',
          date_to: '2026-06-30',
        });
        const { allocation_id } = await inScope(t.adminSession, () =>
          createAllocation({
            project_id: projectA.project_id,
            worker_id: crypto.randomUUID(),
            date_from: '2026-05-01',
            date_to: '2026-05-31',
            bucket: 'billable',
            planned_pct: 50,
            status: 'committed',
            session: t.adminSession,
          }),
        );

        await expect(
          inScope(t.adminSession, () =>
            updateAllocation({
              allocation_id,
              project_id: projectB.project_id,
              session: t.adminSession,
            }),
          ),
        ).rejects.toThrow(/project start/);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('rejects moving to a project where the worker already has an overlapping allocation', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectA = await seedProject(t.adminSession);
        const projectB = await seedProject(t.adminSession);
        const worker_id = crypto.randomUUID();
        const { allocation_id } = await inScope(t.adminSession, () =>
          createAllocation({
            project_id: projectA.project_id,
            worker_id,
            date_from: '2026-05-01',
            date_to: '2026-05-31',
            bucket: 'billable',
            planned_pct: 50,
            status: 'committed',
            session: t.adminSession,
          }),
        );
        await inScope(t.adminSession, () =>
          createAllocation({
            project_id: projectB.project_id,
            worker_id,
            date_from: '2026-05-01',
            date_to: '2026-05-31',
            bucket: 'billable',
            planned_pct: 50,
            status: 'committed',
            session: t.adminSession,
          }),
        );

        await expect(
          inScope(t.adminSession, () =>
            updateAllocation({
              allocation_id,
              project_id: projectB.project_id,
              session: t.adminSession,
            }),
          ),
        ).rejects.toThrow(/already allocated/);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
