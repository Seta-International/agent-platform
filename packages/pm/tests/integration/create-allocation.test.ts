import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { pmDb, resetPmDb } from '../../src/backend/db/client.ts';
import { allocation, personProjection } from '../../src/backend/db/schema.ts';
import { createAccount, createAllocation, submitCharter } from '../../src/index.ts';
import { approveCharterTwoStage, readEvents, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

async function seedProject(session: import('@seta/core').SessionScope): Promise<string> {
  const { account_id } = await createAccount({ name: 'A', session });
  const { project_id: charterId } = await submitCharter({
    account_id,
    name: 'P',
    pm_worker_id: session.user_id,
    methodology: 'scrum',
    pricing_model: 'fixed_price',
    budget_bmm: 100,
    session,
  });
  const { project_id } = await approveCharterTwoStage(charterId, session.tenant_id);
  return project_id;
}

describe('createAllocation', () => {
  it('creates a committed named booking and emits pm.allocation.created', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = await seedProject(t.adminSession);
        const workerId = crypto.randomUUID();

        const { allocation_id } = await createAllocation({
          project_id: projectId,
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

        expect(allocation_id).toBeTruthy();

        const [row] = await pmDb()
          .select()
          .from(allocation)
          .where(eq(allocation.id, allocation_id));
        expect(row?.project_id).toBe(projectId);
        expect(row?.person_id).toBe(workerId);
        expect(row?.status).toBe('committed');

        const events = await readEvents(pool, t.tenant_id, 'pm.allocation.created');
        expect(events).toHaveLength(1);
        expect(events[0]?.payload.allocation_id).toBe(allocation_id);
        expect(events[0]?.payload.account_name).toBe('A');
        expect(events[0]?.payload.lead_worker_id).toBe(t.adminSession.user_id);
        expect(typeof events[0]?.payload.account_id).toBe('string');
        // span fields now flow on the event for People's read-model
        expect(events[0]?.payload).toMatchObject({
          date_from: '2026-05-01',
          date_to: '2026-05-31',
          planned_pct: 100,
          bucket: 'billable',
        });
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('rejects a placeholder that names a worker (CHECK)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = await seedProject(t.adminSession);
        const workerId = crypto.randomUUID();

        await expect(
          createAllocation({
            project_id: projectId,
            worker_id: workerId,
            status: 'placeholder',
            session: t.adminSession,
          }),
        ).rejects.toThrow();
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('FUT-953: rejects a worker whose projection is flagged alumni', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = await seedProject(t.adminSession);
        const workerId = crypto.randomUUID();
        await pmDb().insert(personProjection).values({
          person_id: workerId,
          tenant_id: t.tenant_id,
          full_name: 'Former Employee',
          is_alumni: true,
        });

        await expect(
          createAllocation({
            project_id: projectId,
            worker_id: workerId,
            date_from: '2026-05-01',
            date_to: '2026-05-31',
            bucket: 'billable',
            planned_pct: 100,
            status: 'committed',
            session: t.adminSession,
          }),
        ).rejects.toMatchObject({ code: 'VALIDATION' });
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('FUT-953: a placeholder allocation (no worker_id) is unaffected by alumni data', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = await seedProject(t.adminSession);

        const { allocation_id } = await createAllocation({
          project_id: projectId,
          status: 'placeholder',
          bucket: 'billable',
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

  it('rejects committed without date_from (CHECK)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = await seedProject(t.adminSession);
        const workerId = crypto.randomUUID();

        await expect(
          createAllocation({
            project_id: projectId,
            worker_id: workerId,
            status: 'committed',
            planned_pct: 50,
            session: t.adminSession,
          }),
        ).rejects.toThrow();
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
