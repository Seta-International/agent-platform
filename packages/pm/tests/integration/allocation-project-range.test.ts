import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { resetPmDb } from '../../src/backend/db/client.ts';
import {
  createAccount,
  createAllocation,
  submitCharter,
  updateAllocation,
} from '../../src/index.ts';
import { approveCharterTwoStage, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

async function seedProject(
  session: import('@seta/core').SessionScope,
  bounds?: { date_from?: string; date_to?: string },
): Promise<string> {
  const { account_id } = await createAccount({ name: 'A', session });
  const { project_id: charterId } = await submitCharter({
    account_id,
    name: 'P',
    pm_worker_id: session.user_id,
    methodology: 'scrum',
    pricing_model: 'fixed_price',
    budget_bmm: 100,
    date_from: bounds?.date_from,
    date_to: bounds?.date_to,
    session,
  });
  const { project_id } = await approveCharterTwoStage(charterId, session.tenant_id);
  return project_id;
}

describe('allocation date range must fall within its project', () => {
  it('rejects a create starting before the project start date', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const project = await seedProject(t.adminSession, {
          date_from: '2026-03-01',
          date_to: '2026-10-31',
        });

        await expect(
          createAllocation({
            project_id: project,
            worker_id: crypto.randomUUID(),
            date_from: '2026-01-01',
            date_to: '2026-06-30',
            bucket: 'billable',
            planned_pct: 100,
            status: 'committed',
            session: t.adminSession,
          }),
        ).rejects.toThrow(/project/i);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('rejects a create ending after the project end date', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const project = await seedProject(t.adminSession, {
          date_from: '2026-01-01',
          date_to: '2026-06-30',
        });

        await expect(
          createAllocation({
            project_id: project,
            worker_id: crypto.randomUUID(),
            date_from: '2026-05-01',
            date_to: '2026-10-31',
            bucket: 'billable',
            planned_pct: 100,
            status: 'committed',
            session: t.adminSession,
          }),
        ).rejects.toThrow(/project/i);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('allows a create fully inside the project range', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const project = await seedProject(t.adminSession, {
          date_from: '2026-01-01',
          date_to: '2026-12-31',
        });

        const { allocation_id } = await createAllocation({
          project_id: project,
          worker_id: crypto.randomUUID(),
          date_from: '2026-03-01',
          date_to: '2026-06-30',
          bucket: 'billable',
          planned_pct: 100,
          status: 'committed',
          session: t.adminSession,
        });
        expect(allocation_id).toBeTruthy();
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('allows any dates when the project has no date bounds', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const project = await seedProject(t.adminSession);

        const { allocation_id } = await createAllocation({
          project_id: project,
          worker_id: crypto.randomUUID(),
          date_from: '2026-03-01',
          date_to: '2026-06-30',
          bucket: 'billable',
          planned_pct: 100,
          status: 'committed',
          session: t.adminSession,
        });
        expect(allocation_id).toBeTruthy();
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('rejects an update that moves the end date past the project end', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const project = await seedProject(t.adminSession, {
          date_from: '2026-01-01',
          date_to: '2026-06-30',
        });
        const { allocation_id } = await createAllocation({
          project_id: project,
          worker_id: crypto.randomUUID(),
          date_from: '2026-01-01',
          date_to: '2026-03-31',
          bucket: 'billable',
          planned_pct: 100,
          status: 'committed',
          session: t.adminSession,
        });

        await expect(
          updateAllocation({
            allocation_id,
            date_to: '2026-09-30',
            session: t.adminSession,
          }),
        ).rejects.toThrow(/project/i);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
