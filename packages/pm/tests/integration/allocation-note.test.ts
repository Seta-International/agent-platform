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
import { approveCharterTwoStage, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

async function seedProject(session: import('@seta/core').SessionScope): Promise<string> {
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
  const { project_id } = await approveCharterTwoStage(charter_id, session.tenant_id);
  return project_id;
}

describe('allocation note', () => {
  it('persists note on create and updates it', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = await seedProject(t.adminSession);
        const { allocation_id } = await createAllocation({
          project_id: projectId,
          worker_id: crypto.randomUUID(),
          role: 'DEV',
          date_from: '2026-05-01',
          date_to: '2026-05-31',
          bucket: 'billable',
          planned_pct: 50,
          status: 'committed',
          note: 'rolls off Aug',
          session: t.adminSession,
        });
        const [created] = await pmDb()
          .select()
          .from(allocation)
          .where(eq(allocation.id, allocation_id));
        expect(created?.note).toBe('rolls off Aug');

        await updateAllocation({ allocation_id, note: 'backfill TBD', session: t.adminSession });
        const [updated] = await pmDb()
          .select()
          .from(allocation)
          .where(eq(allocation.id, allocation_id));
        expect(updated?.note).toBe('backfill TBD');
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('updates bucket from billable to internal', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = await seedProject(t.adminSession);
        const { allocation_id } = await createAllocation({
          project_id: projectId,
          worker_id: crypto.randomUUID(),
          role: 'DEV',
          date_from: '2026-05-01',
          date_to: '2026-05-31',
          bucket: 'billable',
          planned_pct: 100,
          status: 'committed',
          session: t.adminSession,
        });
        const [created] = await pmDb()
          .select()
          .from(allocation)
          .where(eq(allocation.id, allocation_id));
        expect(created?.bucket).toBe('billable');

        await updateAllocation({ allocation_id, bucket: 'internal', session: t.adminSession });
        const [updated] = await pmDb()
          .select()
          .from(allocation)
          .where(eq(allocation.id, allocation_id));
        expect(updated?.bucket).toBe('internal');
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
