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
  name = 'P',
): Promise<string> {
  const { account_id } = await createAccount({ name: `A-${name}`, session });
  const { charter_id } = await submitCharter({
    account_id,
    name,
    pm_worker_id: session.user_id,
    methodology: 'scrum',
    pricing_model: 'fixed_price',
    budget_bmm: 100,
    session,
  });
  const { project_id } = await approveCharterTwoStage(charter_id, session.tenant_id);
  return project_id;
}

const book = (
  session: import('@seta/core').SessionScope,
  project_id: string,
  worker_id: string,
  date_from: string,
  date_to: string,
) =>
  createAllocation({
    project_id,
    worker_id,
    date_from,
    date_to,
    bucket: 'billable',
    planned_pct: 100,
    status: 'committed',
    session,
  });

describe('allocation overlap guard', () => {
  it('rejects a second booking overlapping the same worker+project', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const project = await seedProject(t.adminSession);
        const worker = crypto.randomUUID();

        await book(t.adminSession, project, worker, '2026-01-01', '2026-06-30');

        await expect(
          book(t.adminSession, project, worker, '2026-06-01', '2026-12-31'),
        ).rejects.toThrow(/overlapping/i);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('allows sequential bookings on the same project (no date overlap)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const project = await seedProject(t.adminSession);
        const worker = crypto.randomUUID();

        await book(t.adminSession, project, worker, '2026-01-01', '2026-06-30');
        const second = await book(t.adminSession, project, worker, '2026-07-01', '2026-12-31');
        expect(second.allocation_id).toBeTruthy();
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('allows overlapping bookings on different projects', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectA = await seedProject(t.adminSession, 'A');
        const projectB = await seedProject(t.adminSession, 'B');
        const worker = crypto.randomUUID();

        await book(t.adminSession, projectA, worker, '2026-01-01', '2026-12-31');
        const onB = await book(t.adminSession, projectB, worker, '2026-01-01', '2026-12-31');
        expect(onB.allocation_id).toBeTruthy();
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('rejects an update that moves a booking into overlap', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const project = await seedProject(t.adminSession);
        const worker = crypto.randomUUID();

        await book(t.adminSession, project, worker, '2026-01-01', '2026-06-30');
        const second = await book(t.adminSession, project, worker, '2026-07-01', '2026-12-31');

        await expect(
          updateAllocation({
            allocation_id: second.allocation_id,
            date_from: '2026-06-01',
            session: t.adminSession,
          }),
        ).rejects.toThrow(/overlapping/i);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('allows updating a row that only touches itself', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const project = await seedProject(t.adminSession);
        const worker = crypto.randomUUID();

        const only = await book(t.adminSession, project, worker, '2026-01-01', '2026-06-30');
        const { version } = await updateAllocation({
          allocation_id: only.allocation_id,
          date_to: '2026-08-31',
          session: t.adminSession,
        });
        expect(version).toBe(2);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
