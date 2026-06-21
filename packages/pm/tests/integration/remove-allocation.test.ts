import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq, isNull } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { pmDb, resetPmDb } from '../../src/backend/db/client.ts';
import { allocation } from '../../src/backend/db/schema.ts';
import {
  approveCharter,
  createAccount,
  createAllocation,
  removeAllocation,
  submitCharter,
} from '../../src/index.ts';
import { readEvents, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

async function seedProject(
  session: import('@seta/core').SessionScope,
): Promise<{ project_id: string; account_id: string }> {
  const { account_id } = await createAccount({ name: 'A', session });
  const { charter_id } = await submitCharter({
    account_id,
    name: 'P',
    pm_worker_id: session.user_id,
    methodology: 'scrum',
    pricing_model: 'fixed_price',
    budget_bmm: 100,
    session,
  });
  const { project_id } = await approveCharter({ charter_id, session });
  return { project_id, account_id };
}

describe('removeAllocation', () => {
  it('soft-deletes the row and emits pm.allocation.removed with correct account_id', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { project_id, account_id } = await seedProject(t.adminSession);
        const workerId = crypto.randomUUID();

        const { allocation_id } = await createAllocation({
          project_id,
          worker_id: workerId,
          role: 'DEV',
          date_from: '2026-05-01',
          date_to: '2026-05-31',
          bucket: 'billable',
          planned_pct: 100,
          minutes_per_day: 480,
          status: 'committed',
          session: t.adminSession,
        });

        await removeAllocation({ allocation_id, session: t.adminSession });

        const [row] = await pmDb()
          .select()
          .from(allocation)
          .where(eq(allocation.id, allocation_id));
        expect(row?.deleted_at).not.toBeNull();

        const events = await readEvents(pool, t.tenant_id, 'pm.allocation.removed');
        expect(events).toHaveLength(1);
        expect(events[0]?.payload.allocation_id).toBe(allocation_id);
        expect(events[0]?.payload.account_id).toBe(account_id);
        expect(events[0]?.payload.worker_id).toBe(workerId);
        expect(events[0]?.payload.project_id).toBe(project_id);
        expect(events[0]?.payload.tenant_id).toBe(t.tenant_id);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('throws NOT_FOUND when allocation does not exist', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const missingId = crypto.randomUUID();
        await expect(
          removeAllocation({ allocation_id: missingId, session: t.adminSession }),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('throws NOT_FOUND when allocation already soft-deleted', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { project_id } = await seedProject(t.adminSession);
        const workerId = crypto.randomUUID();

        const { allocation_id } = await createAllocation({
          project_id,
          worker_id: workerId,
          role: 'DEV',
          date_from: '2026-05-01',
          date_to: '2026-05-31',
          bucket: 'billable',
          planned_pct: 100,
          minutes_per_day: 480,
          status: 'committed',
          session: t.adminSession,
        });

        await removeAllocation({ allocation_id, session: t.adminSession });
        await expect(
          removeAllocation({ allocation_id, session: t.adminSession }),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
