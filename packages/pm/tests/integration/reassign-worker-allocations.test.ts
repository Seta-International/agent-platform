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
  previewReassignWorkerAllocations,
  reassignWorkerAllocations,
  submitCharter,
} from '../../src/index.ts';
import { approveCharterTwoStage, buildSession, readEvents, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

async function seedProject(
  session: import('@seta/core').SessionScope,
  name: string,
  bounds?: { date_from?: string; date_to?: string },
): Promise<string> {
  const { account_id } = await createAccount({ name: `A-${name}`, session });
  const { project_id: charterId } = await submitCharter({
    account_id,
    name,
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

describe('reassignWorkerAllocations', () => {
  it("ends every one of the worker's active allocations on the same date and creates the new target", async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const watchtower = await seedProject(t.adminSession, 'Watchtower');
        const projectX = await seedProject(t.adminSession, 'ProjectX');
        const newProj = await seedProject(t.adminSession, 'NewProj');
        const worker = crypto.randomUUID();

        const a1 = await createAllocation({
          project_id: watchtower,
          worker_id: worker,
          date_from: '2026-01-01',
          date_to: '2026-12-31',
          bucket: 'billable',
          planned_pct: 30,
          status: 'committed',
          session: t.adminSession,
        });
        const a2 = await createAllocation({
          project_id: projectX,
          worker_id: worker,
          date_from: '2026-01-01',
          date_to: '2026-12-31',
          bucket: 'billable',
          planned_pct: 70,
          status: 'committed',
          session: t.adminSession,
        });

        const result = await reassignWorkerAllocations({
          worker_id: worker,
          allocation_ids: [a1.allocation_id, a2.allocation_id],
          source: { date_to: '2026-06-30' },
          targets: [
            {
              project_id: newProj,
              date_from: '2026-07-01',
              planned_pct: 100,
              bucket: 'billable',
              date_to: null,
            },
          ],
          session: t.adminSession,
        });

        expect(result.updated).toHaveLength(2);
        expect(result.target_ids).toHaveLength(1);
        expect(result.warnings).toEqual([]);

        const rows = await pmDb().select().from(allocation).where(eq(allocation.person_id, worker));
        expect(rows).toHaveLength(3);
        const w1 = rows.find((r) => r.id === a1.allocation_id);
        const w2 = rows.find((r) => r.id === a2.allocation_id);
        expect(w1?.date_to).toBe('2026-06-30');
        expect(w1?.planned_pct).toBe('30.0000'); // history preserved, untouched
        expect(w2?.date_to).toBe('2026-06-30');
        expect(w2?.planned_pct).toBe('70.0000');
        const created = rows.find((r) => r.project_id === newProj);
        expect(created?.date_from).toBe('2026-07-01');
        expect(created?.planned_pct).toBe('100.0000');

        const updatedEvents = await readEvents(pool, t.tenant_id, 'pm.allocation.updated');
        expect(updatedEvents).toHaveLength(2);
        const createdEvents = await readEvents(pool, t.tenant_id, 'pm.allocation.created');
        expect(createdEvents).toHaveLength(3); // a1 + a2 (setup) + the new target
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('leaves an unselected allocation completely untouched', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const watchtower = await seedProject(t.adminSession, 'Watchtower');
        const projectX = await seedProject(t.adminSession, 'ProjectX');
        const newProj = await seedProject(t.adminSession, 'NewProj');
        const worker = crypto.randomUUID();

        const kept = await createAllocation({
          project_id: watchtower,
          worker_id: worker,
          date_from: '2026-01-01',
          date_to: '2026-12-31',
          bucket: 'billable',
          planned_pct: 30,
          status: 'committed',
          session: t.adminSession,
        });
        const reassigned = await createAllocation({
          project_id: projectX,
          worker_id: worker,
          date_from: '2026-01-01',
          date_to: '2026-12-31',
          bucket: 'billable',
          planned_pct: 70,
          status: 'committed',
          session: t.adminSession,
        });

        await reassignWorkerAllocations({
          worker_id: worker,
          allocation_ids: [reassigned.allocation_id], // Watchtower NOT selected
          source: { date_to: '2026-06-30' },
          targets: [
            {
              project_id: newProj,
              date_from: '2026-07-01',
              planned_pct: 70,
              bucket: 'billable',
              date_to: null,
            },
          ],
          session: t.adminSession,
        });

        const [keptRow] = await pmDb()
          .select()
          .from(allocation)
          .where(eq(allocation.id, kept.allocation_id));
        expect(keptRow?.date_to).toBe('2026-12-31'); // untouched
        expect(keptRow?.version).toBe(1);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('rejects when the shared end date falls before one of the active allocations even starts', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const watchtower = await seedProject(t.adminSession, 'Watchtower');
        const projectX = await seedProject(t.adminSession, 'ProjectX');
        const newProj = await seedProject(t.adminSession, 'NewProj');
        const worker = crypto.randomUUID();

        const w1 = await createAllocation({
          project_id: watchtower,
          worker_id: worker,
          date_from: '2026-01-01',
          date_to: '2026-12-31', // covers the shared end date below, so only ProjectX fails
          bucket: 'billable',
          planned_pct: 30,
          status: 'committed',
          session: t.adminSession,
        });
        const w2 = await createAllocation({
          project_id: projectX,
          worker_id: worker,
          date_from: '2026-08-01', // starts after the shared end date below
          date_to: '2026-12-31',
          bucket: 'billable',
          planned_pct: 70,
          status: 'committed',
          session: t.adminSession,
        });

        await expect(
          reassignWorkerAllocations({
            worker_id: worker,
            allocation_ids: [w1.allocation_id, w2.allocation_id],
            source: { date_to: '2026-07-01' },
            targets: [
              {
                project_id: newProj,
                date_from: '2026-07-02',
                planned_pct: 100,
                bucket: 'billable',
                date_to: null,
              },
            ],
            session: t.adminSession,
          }),
        ).rejects.toThrow(/before the allocation start/i);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('creates new allocations without ending any existing one when allocation_ids is empty', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const watchtower = await seedProject(t.adminSession, 'Watchtower');
        const newProj = await seedProject(t.adminSession, 'NewProj');
        const worker = crypto.randomUUID();

        const kept = await createAllocation({
          project_id: watchtower,
          worker_id: worker,
          date_from: '2026-01-01',
          date_to: '2026-12-31',
          bucket: 'billable',
          planned_pct: 30,
          status: 'committed',
          session: t.adminSession,
        });

        const result = await reassignWorkerAllocations({
          worker_id: worker,
          allocation_ids: [],
          source: { date_to: '2026-01-01' }, // unused when nothing is being ended
          targets: [
            {
              project_id: newProj,
              date_from: '2026-07-01',
              planned_pct: 50,
              bucket: 'billable',
              date_to: null,
            },
          ],
          session: t.adminSession,
        });

        expect(result.updated).toEqual([]);
        expect(result.target_ids).toHaveLength(1);

        const rows = await pmDb().select().from(allocation).where(eq(allocation.person_id, worker));
        expect(rows).toHaveLength(2);
        const keptRow = rows.find((r) => r.id === kept.allocation_id);
        expect(keptRow?.date_to).toBe('2026-12-31'); // untouched, still version 1
        expect(keptRow?.version).toBe(1);
        const created = rows.find((r) => r.project_id === newProj);
        expect(created?.date_from).toBe('2026-07-01');
        expect(created?.planned_pct).toBe('50.0000');
        expect(created?.status).toBe('committed'); // sensible default, no source row to copy from
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('flags over-allocation from an open-ended new target when no source bounds the peak window', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const watchtower = await seedProject(t.adminSession, 'Watchtower');
        const commerceCanal = await seedProject(t.adminSession, 'CommerceCanal');
        const newProj = await seedProject(t.adminSession, 'NewProj');
        const worker = crypto.randomUUID();

        await createAllocation({
          project_id: watchtower,
          worker_id: worker,
          date_from: '2026-04-09',
          date_to: '2026-08-06',
          bucket: 'billable',
          planned_pct: 30,
          status: 'committed',
          session: t.adminSession,
        });
        await createAllocation({
          project_id: commerceCanal,
          worker_id: worker,
          date_from: '2026-06-12',
          date_to: '2026-07-12',
          bucket: 'billable',
          planned_pct: 50,
          status: 'committed',
          session: t.adminSession,
        });

        // No allocation_ids selected (nothing being ended) and the new target
        // has no end date — so no candidate provides a finite bound, forcing
        // the peak sweep to fall back to its far-future sentinel.
        const preview = await previewReassignWorkerAllocations({
          worker_id: worker,
          allocation_ids: [],
          source: { date_to: '2026-01-01' },
          targets: [
            {
              project_id: newProj,
              date_from: '2026-07-09',
              planned_pct: 100,
              bucket: 'billable',
              date_to: null,
            },
          ],
          session: t.adminSession,
        });

        // 30 (Watchtower) + 50 (CommerceCanal) + 100 (new, open-ended) = 180
        // during the Jul 9–12 overlap.
        expect(preview.peak_pct).toBe(180);
        expect(preview.exceeds).toBe(true);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('flags a pre-existing overlap the previewed change never touches (whole-book peak)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const acme = await seedProject(t.adminSession, 'AcmeBillingRevamp', {
          date_from: '2026-01-01',
          date_to: '2026-12-31',
        });
        const nordic = await seedProject(t.adminSession, 'NordicMobileCheckout', {
          date_from: '2026-01-01',
          date_to: '2026-12-31',
        });
        const later = await seedProject(t.adminSession, 'LaterProj', {
          date_from: '2027-01-01',
          date_to: '2028-12-31',
        });
        const worker = crypto.randomUUID();

        // Two existing allocations that already overlap at 200% in Jul–Aug 2026.
        await createAllocation({
          project_id: acme,
          worker_id: worker,
          date_from: '2026-07-23',
          date_to: '2026-08-23',
          bucket: 'billable',
          planned_pct: 100,
          status: 'committed',
          session: t.adminSession,
        });
        await createAllocation({
          project_id: nordic,
          worker_id: worker,
          date_from: '2026-07-23',
          date_to: '2026-09-16',
          bucket: 'billable',
          planned_pct: 100,
          status: 'committed',
          session: t.adminSession,
        });

        // Add a target far in the future that overlaps neither existing row and
        // ends nothing. The peak must still reflect the worker's whole book — the
        // pre-existing 200% conflict in mid-2026 — not just this change's window.
        const preview = await previewReassignWorkerAllocations({
          worker_id: worker,
          allocation_ids: [],
          source: { date_to: '2026-01-01' },
          targets: [
            {
              project_id: later,
              date_from: '2027-11-30',
              date_to: '2028-01-28',
              planned_pct: 100,
              bucket: 'billable',
            },
          ],
          session: t.adminSession,
        });

        expect(preview.peak_pct).toBe(200);
        expect(preview.exceeds).toBe(true);
        expect(preview.peak_from).toBe('2026-07-23');
        expect(preview.peak_to).toBe('2026-08-23');
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('flags over-allocation via previewReassignWorkerAllocations when the new target overlaps a kept allocation', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const watchtower = await seedProject(t.adminSession, 'Watchtower');
        const newProj = await seedProject(t.adminSession, 'NewProj');
        const worker = crypto.randomUUID();

        const source = await createAllocation({
          project_id: watchtower,
          worker_id: worker,
          date_from: '2026-01-01',
          date_to: '2026-12-31',
          bucket: 'billable',
          planned_pct: 100,
          status: 'committed',
          session: t.adminSession,
        });

        const preview = await previewReassignWorkerAllocations({
          worker_id: worker,
          allocation_ids: [source.allocation_id],
          source: { date_to: '2026-12-31' }, // kept unchanged
          targets: [
            {
              project_id: newProj,
              date_from: '2026-07-01',
              planned_pct: 50,
              bucket: 'billable',
              date_to: '2026-12-31',
            },
          ],
          session: t.adminSession,
        });

        expect(preview.sources).toHaveLength(1);
        expect(preview.sources[0]).toMatchObject({ project_name: 'Watchtower', planned_pct: 100 });
        expect(preview.targets[0]).toMatchObject({ project_name: 'NewProj', planned_pct: 50 });
        expect(preview.peak_pct).toBe(150);
        expect(preview.exceeds).toBe(true);
        expect(preview.peak_from).toBe('2026-07-01');
        expect(preview.peak_to).toBe('2026-12-31');
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('flags restricted allocations when the worker has allocations outside the caller permission scope', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const amProject = await seedProject(t.adminSession, 'AM-Project');
        const restrictedProject = await seedProject(t.adminSession, 'Restricted-Project');
        const worker = crypto.randomUUID();

        // 100% on restricted project
        await createAllocation({
          project_id: restrictedProject,
          worker_id: worker,
          date_from: '2026-01-01',
          date_to: '2026-12-31',
          bucket: 'billable',
          planned_pct: 100,
          status: 'committed',
          session: t.adminSession,
        });

        // AM session with project.read / project.manage restricted to amProject
        const amSession = buildSession({
          user_id: crypto.randomUUID(),
          tenant_id: t.tenant_id,
          worker_id: crypto.randomUUID(),
          roles: ['pm.manager'],
          assignments: [
            {
              role_slug: 'pm.manager',
              scope_kind: 'relationship' as const,
              scope_id: amProject,
            },
          ],
        });

        const preview = await previewReassignWorkerAllocations({
          worker_id: worker,
          allocation_ids: [],
          source: { date_to: '2026-01-01' },
          targets: [
            {
              project_id: amProject,
              date_from: '2026-06-01',
              date_to: '2026-12-31',
              planned_pct: 100,
              bucket: 'billable',
            },
          ],
          session: amSession,
        });

        expect(preview.peak_pct).toBe(200);
        expect(preview.exceeds).toBe(true);
        expect(preview.has_restricted_allocations).toBe(true);
        expect(preview.restricted_segments).toHaveLength(1);
        expect(preview.restricted_segments[0]).toMatchObject({
          date_from: '2026-01-01',
          date_to: '2026-12-31',
          planned_pct: 100,
        });
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
