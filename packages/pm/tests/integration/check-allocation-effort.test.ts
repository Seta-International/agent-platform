import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { resetPmDb } from '../../src/backend/db/client.ts';
import {
  checkAllocationEffort,
  createAccount,
  createAllocation,
  submitCharter,
} from '../../src/index.ts';
import { approveCharterTwoStage, inScope, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

async function seedProject(
  session: import('@seta/core').SessionScope,
  name = 'P',
): Promise<string> {
  const { account_id } = await inScope(session, () =>
    createAccount({ name: `A-${name}`, session }),
  );
  const { charter_id } = await inScope(session, () =>
    submitCharter({
      account_id,
      name,
      pm_worker_id: session.user_id,
      methodology: 'scrum',
      pricing_model: 'fixed_price',
      budget_bmm: 100,
      session,
    }),
  );
  const { project_id } = await approveCharterTwoStage(charter_id, session.tenant_id);
  return project_id;
}

describe('checkAllocationEffort', () => {
  it('reports the candidate alone as peak when the worker has no other allocations', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const worker = crypto.randomUUID();

        const result = await inScope(t.adminSession, () =>
          checkAllocationEffort({
            worker_id: worker,
            date_from: '2026-01-01',
            date_to: '2026-06-30',
            planned_pct: 60,
            session: t.adminSession,
          }),
        );

        expect(result.peak_pct).toBe(60);
        expect(result.exceeds).toBe(false);
        expect(result.conflicts).toEqual([]);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('flags over-allocation across different projects and lists the conflicting one', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectA = await seedProject(t.adminSession, 'A');
        const worker = crypto.randomUUID();

        await inScope(t.adminSession, () =>
          createAllocation({
            project_id: projectA,
            worker_id: worker,
            date_from: '2026-01-01',
            date_to: '2026-12-31',
            bucket: 'billable',
            planned_pct: 60,
            status: 'committed',
            session: t.adminSession,
          }),
        );

        const result = await inScope(t.adminSession, () =>
          checkAllocationEffort({
            worker_id: worker,
            date_from: '2026-03-01',
            date_to: '2026-06-30',
            planned_pct: 50,
            session: t.adminSession,
          }),
        );

        expect(result.peak_pct).toBe(110);
        expect(result.exceeds).toBe(true);
        expect(result.conflicts).toHaveLength(1);
        expect(result.conflicts[0]).toMatchObject({
          project_name: 'A',
          planned_pct: 60,
        });
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('ignores allocations outside the candidate window', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectA = await seedProject(t.adminSession, 'A');
        const worker = crypto.randomUUID();

        await inScope(t.adminSession, () =>
          createAllocation({
            project_id: projectA,
            worker_id: worker,
            date_from: '2025-01-01',
            date_to: '2025-12-31',
            bucket: 'billable',
            planned_pct: 100,
            status: 'committed',
            session: t.adminSession,
          }),
        );

        const result = await inScope(t.adminSession, () =>
          checkAllocationEffort({
            worker_id: worker,
            date_from: '2026-01-01',
            date_to: '2026-06-30',
            planned_pct: 50,
            session: t.adminSession,
          }),
        );

        expect(result.peak_pct).toBe(50);
        expect(result.exceeds).toBe(false);
        expect(result.conflicts).toEqual([]);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('counts an open-ended allocation (no end date) toward the peak instead of ignoring it', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectA = await seedProject(t.adminSession, 'A');
        const worker = crypto.randomUUID();

        // Open-ended: still ongoing, no date_to — mirrors a real "Motion Global"-style booking.
        await inScope(t.adminSession, () =>
          createAllocation({
            project_id: projectA,
            worker_id: worker,
            date_from: '2026-03-01',
            date_to: null,
            bucket: 'billable',
            planned_pct: 100,
            status: 'committed',
            session: t.adminSession,
          }),
        );

        const result = await inScope(t.adminSession, () =>
          checkAllocationEffort({
            worker_id: worker,
            date_from: '2026-04-09',
            date_to: '2026-12-23',
            planned_pct: 30,
            session: t.adminSession,
          }),
        );

        expect(result.peak_pct).toBe(130);
        expect(result.exceeds).toBe(true);
        expect(result.conflicts).toHaveLength(1);
        expect(result.conflicts[0]).toMatchObject({ project_name: 'A', planned_pct: 100 });
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('excludes the allocation being edited via exclude_allocation_id', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectA = await seedProject(t.adminSession, 'A');
        const worker = crypto.randomUUID();

        const { allocation_id } = await inScope(t.adminSession, () =>
          createAllocation({
            project_id: projectA,
            worker_id: worker,
            date_from: '2026-01-01',
            date_to: '2026-12-31',
            bucket: 'billable',
            planned_pct: 100,
            status: 'committed',
            session: t.adminSession,
          }),
        );

        const result = await inScope(t.adminSession, () =>
          checkAllocationEffort({
            worker_id: worker,
            date_from: '2026-01-01',
            date_to: '2026-12-31',
            planned_pct: 40,
            exclude_allocation_id: allocation_id,
            session: t.adminSession,
          }),
        );

        expect(result.peak_pct).toBe(40);
        expect(result.exceeds).toBe(false);
        expect(result.conflicts).toEqual([]);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
