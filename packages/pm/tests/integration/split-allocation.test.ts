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
  splitAllocation,
  submitCharter,
} from '../../src/index.ts';
import { approveCharterTwoStage, inScope, readEvents, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

async function seedProject(
  session: import('@seta/core').SessionScope,
  bounds?: { date_from?: string; date_to?: string },
): Promise<string> {
  const { account_id } = await inScope(session, () => createAccount({ name: 'A', session }));
  const { charter_id } = await inScope(session, () =>
    submitCharter({
      account_id,
      name: 'P',
      pm_worker_id: session.user_id,
      methodology: 'scrum',
      pricing_model: 'fixed_price',
      budget_bmm: 100,
      date_from: bounds?.date_from,
      date_to: bounds?.date_to,
      session,
    }),
  );
  const { project_id } = await approveCharterTwoStage(charter_id, session.tenant_id);
  return project_id;
}

describe('splitAllocation', () => {
  it('ends the current allocation early and creates a continuation with new effort', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const project = await seedProject(t.adminSession);
        const worker = crypto.randomUUID();

        const { allocation_id } = await inScope(t.adminSession, () =>
          createAllocation({
            project_id: project,
            worker_id: worker,
            date_from: '2026-01-01',
            date_to: '2026-10-31',
            bucket: 'billable',
            planned_pct: 100,
            status: 'committed',
            session: t.adminSession,
          }),
        );

        const result = await inScope(t.adminSession, () =>
          splitAllocation({
            allocation_id,
            new_end_date: '2026-02-28',
            continuation: { planned_pct: 50 },
            session: t.adminSession,
          }),
        );

        expect(result.continuation_id).toBeTruthy();
        expect(result.updated_version).toBe(2);

        const [original] = await inScope(t.adminSession, () =>
          pmDb().select().from(allocation).where(eq(allocation.id, allocation_id)),
        );
        expect(original?.date_to).toBe('2026-02-28');
        expect(original?.planned_pct).toBe('100.0000');

        const [continuation] = await inScope(t.adminSession, () =>
          pmDb().select().from(allocation).where(eq(allocation.id, result.continuation_id)),
        );
        expect(continuation?.project_id).toBe(project);
        expect(continuation?.worker_id).toBe(worker);
        expect(continuation?.date_from).toBe('2026-03-01');
        expect(continuation?.date_to).toBe('2026-10-31');
        expect(continuation?.planned_pct).toBe('50.0000');
        expect(continuation?.bucket).toBe('billable');
        expect(continuation?.status).toBe('committed');

        const updatedEvents = await readEvents(pool, t.tenant_id, 'pm.allocation.updated');
        expect(updatedEvents).toHaveLength(1);
        const createdEvents = await readEvents(pool, t.tenant_id, 'pm.allocation.created');
        expect(createdEvents).toHaveLength(2); // original create + continuation create
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('rejects splitting a placeholder allocation (no worker)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const project = await seedProject(t.adminSession);

        const { allocation_id } = await inScope(t.adminSession, () =>
          createAllocation({
            project_id: project,
            status: 'placeholder',
            bucket: 'billable',
            session: t.adminSession,
          }),
        );

        await expect(
          inScope(t.adminSession, () =>
            splitAllocation({
              allocation_id,
              new_end_date: '2026-02-28',
              continuation: { planned_pct: 50 },
              session: t.adminSession,
            }),
          ),
        ).rejects.toThrow(/worker/i);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('rejects a new_end_date outside the current allocation range', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const project = await seedProject(t.adminSession);
        const worker = crypto.randomUUID();

        const { allocation_id } = await inScope(t.adminSession, () =>
          createAllocation({
            project_id: project,
            worker_id: worker,
            date_from: '2026-01-01',
            date_to: '2026-10-31',
            bucket: 'billable',
            planned_pct: 100,
            status: 'committed',
            session: t.adminSession,
          }),
        );

        await expect(
          inScope(t.adminSession, () =>
            splitAllocation({
              allocation_id,
              new_end_date: '2026-11-30',
              continuation: { planned_pct: 50 },
              session: t.adminSession,
            }),
          ),
        ).rejects.toThrow(/allocation end/i);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('rejects on version mismatch', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const project = await seedProject(t.adminSession);
        const worker = crypto.randomUUID();

        const { allocation_id } = await inScope(t.adminSession, () =>
          createAllocation({
            project_id: project,
            worker_id: worker,
            date_from: '2026-01-01',
            date_to: '2026-10-31',
            bucket: 'billable',
            planned_pct: 100,
            status: 'committed',
            session: t.adminSession,
          }),
        );

        await expect(
          inScope(t.adminSession, () =>
            splitAllocation({
              allocation_id,
              new_end_date: '2026-02-28',
              continuation: { planned_pct: 50 },
              expected_version: 99,
              session: t.adminSession,
            }),
          ),
        ).rejects.toThrow(/version/i);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('rejects a continuation that falls outside the project date range', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const project = await seedProject(t.adminSession, {
          date_from: '2026-01-01',
          date_to: '2026-10-31',
        });
        const worker = crypto.randomUUID();

        const { allocation_id } = await inScope(t.adminSession, () =>
          createAllocation({
            project_id: project,
            worker_id: worker,
            date_from: '2026-01-01',
            date_to: '2026-10-31',
            bucket: 'billable',
            planned_pct: 100,
            status: 'committed',
            session: t.adminSession,
          }),
        );

        await expect(
          inScope(t.adminSession, () =>
            splitAllocation({
              allocation_id,
              new_end_date: '2026-02-28',
              continuation: { planned_pct: 50, date_to: '2026-12-31' },
              session: t.adminSession,
            }),
          ),
        ).rejects.toThrow(/project/i);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('returns a soft warning when the continuation pushes the worker over 100%, without blocking', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const project = await seedProject(t.adminSession);
        const otherProject = await seedProject(t.adminSession);
        const worker = crypto.randomUUID();

        await inScope(t.adminSession, () =>
          createAllocation({
            project_id: otherProject,
            worker_id: worker,
            date_from: '2026-01-01',
            date_to: '2026-12-31',
            bucket: 'billable',
            planned_pct: 60,
            status: 'committed',
            session: t.adminSession,
          }),
        );

        const { allocation_id } = await inScope(t.adminSession, () =>
          createAllocation({
            project_id: project,
            worker_id: worker,
            date_from: '2026-01-01',
            date_to: '2026-10-31',
            bucket: 'billable',
            planned_pct: 30,
            status: 'committed',
            session: t.adminSession,
          }),
        );

        const result = await inScope(t.adminSession, () =>
          splitAllocation({
            allocation_id,
            new_end_date: '2026-02-28',
            continuation: { planned_pct: 70 },
            session: t.adminSession,
          }),
        );

        expect(result.warning).toBeTruthy();
        expect(result.warning?.peak_pct).toBe(130);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
