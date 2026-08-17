import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { pmDb, resetPmDb } from '../../src/backend/db/client.ts';
import { allocation, project } from '../../src/backend/db/schema.ts';
import {
  createAccount,
  createAllocation,
  previewReassignAllocation,
  reassignAllocation,
  reassignWorkerAllocations,
  submitCharter,
} from '../../src/index.ts';
import { approveCharterTwoStage, readEvents, seedTenant } from '../helpers.ts';

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

describe('reassignAllocation', () => {
  it('ends the source at its own end date and creates allocations on new projects with their own dates', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const automate = await seedProject(t.adminSession, 'Automate');
        const xxx = await seedProject(t.adminSession, 'XXX');
        const yyy = await seedProject(t.adminSession, 'YYY');
        const worker = crypto.randomUUID();

        const { allocation_id } = await createAllocation({
          project_id: automate,
          worker_id: worker,
          date_from: '2026-01-01',
          date_to: '2026-12-31',
          bucket: 'billable',
          planned_pct: 100,
          status: 'committed',
          session: t.adminSession,
        });

        const result = await reassignAllocation({
          allocation_id,
          source: { date_to: '2026-06-30' },
          targets: [
            {
              project_id: xxx,
              date_from: '2026-07-01',
              planned_pct: 40,
              bucket: 'billable',
              date_to: null,
            },
            {
              project_id: yyy,
              date_from: '2026-07-01',
              planned_pct: 60,
              bucket: 'billable',
              date_to: '2026-12-31',
            },
          ],
          session: t.adminSession,
        });

        expect(result.source_updated_version).toBe(2);
        expect(result.target_ids).toHaveLength(2);

        const [source] = await pmDb()
          .select()
          .from(allocation)
          .where(eq(allocation.id, allocation_id));
        expect(source?.date_to).toBe('2026-06-30');
        expect(source?.planned_pct).toBe('100.0000'); // history preserved, untouched

        const rows = await pmDb().select().from(allocation).where(eq(allocation.person_id, worker));
        expect(rows).toHaveLength(3);

        const targetXxx = rows.find((r) => r.project_id === xxx);
        expect(targetXxx?.date_from).toBe('2026-07-01');
        expect(targetXxx?.date_to).toBeNull();
        expect(targetXxx?.planned_pct).toBe('40.0000');

        const targetYyy = rows.find((r) => r.project_id === yyy);
        expect(targetYyy?.date_from).toBe('2026-07-01');
        expect(targetYyy?.date_to).toBe('2026-12-31');
        expect(targetYyy?.planned_pct).toBe('60.0000');

        const updatedEvents = await readEvents(pool, t.tenant_id, 'pm.allocation.updated');
        expect(updatedEvents).toHaveLength(1);
        const createdEvents = await readEvents(pool, t.tenant_id, 'pm.allocation.created');
        expect(createdEvents).toHaveLength(3); // original + 2 targets
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('allows a gap between the old and new allocations (targets need not start right after the source ends)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const automate = await seedProject(t.adminSession, 'Automate');
        const xxx = await seedProject(t.adminSession, 'XXX');
        const worker = crypto.randomUUID();

        const { allocation_id } = await createAllocation({
          project_id: automate,
          worker_id: worker,
          date_from: '2026-01-01',
          date_to: '2026-12-31',
          bucket: 'billable',
          planned_pct: 100,
          status: 'committed',
          session: t.adminSession,
        });

        const result = await reassignAllocation({
          allocation_id,
          source: { date_to: '2026-06-30' },
          targets: [
            {
              project_id: xxx,
              date_from: '2026-08-01', // a full month gap (July) with no allocation at all
              planned_pct: 100,
              bucket: 'billable',
            },
          ],
          session: t.adminSession,
        });

        expect(result.target_ids).toHaveLength(1);
        const [target] = await pmDb()
          .select()
          .from(allocation)
          .where(eq(allocation.id, result.target_ids[0] as string));
        expect(target?.date_from).toBe('2026-08-01');
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('supports continuing on the same project at a different % by targeting it again', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const automate = await seedProject(t.adminSession, 'Automate');
        const worker = crypto.randomUUID();

        const { allocation_id } = await createAllocation({
          project_id: automate,
          worker_id: worker,
          date_from: '2026-01-01',
          date_to: '2026-12-31',
          bucket: 'billable',
          planned_pct: 100,
          status: 'committed',
          session: t.adminSession,
        });

        const result = await reassignAllocation({
          allocation_id,
          source: { date_to: '2026-02-28' },
          targets: [
            {
              project_id: automate,
              date_from: '2026-03-01',
              planned_pct: 30,
              bucket: 'billable',
              date_to: '2026-12-31',
            },
          ],
          session: t.adminSession,
        });

        expect(result.target_ids).toHaveLength(1);
        const rows = await pmDb().select().from(allocation).where(eq(allocation.person_id, worker));
        expect(rows).toHaveLength(2);
        const continuation = rows.find((r) => r.id === result.target_ids[0]);
        expect(continuation?.project_id).toBe(automate);
        expect(continuation?.planned_pct).toBe('30.0000');
        expect(continuation?.date_from).toBe('2026-03-01');
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('rejects reassigning an allocation with no worker (placeholder)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const automate = await seedProject(t.adminSession, 'Automate');
        const xxx = await seedProject(t.adminSession, 'XXX');

        const { allocation_id } = await createAllocation({
          project_id: automate,
          status: 'placeholder',
          bucket: 'billable',
          session: t.adminSession,
        });

        await expect(
          reassignAllocation({
            allocation_id,
            source: { date_to: '2026-06-30' },
            targets: [
              { project_id: xxx, date_from: '2026-07-01', planned_pct: 100, bucket: 'billable' },
            ],
            session: t.adminSession,
          }),
        ).rejects.toThrow(/worker/i);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('rejects a source end date outside the current allocation range', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const automate = await seedProject(t.adminSession, 'Automate');
        const xxx = await seedProject(t.adminSession, 'XXX');
        const worker = crypto.randomUUID();

        const { allocation_id } = await createAllocation({
          project_id: automate,
          worker_id: worker,
          date_from: '2026-01-01',
          date_to: '2026-06-30',
          bucket: 'billable',
          planned_pct: 100,
          status: 'committed',
          session: t.adminSession,
        });

        await expect(
          reassignAllocation({
            allocation_id,
            source: { date_to: '2026-09-30' },
            targets: [
              { project_id: xxx, date_from: '2026-10-01', planned_pct: 100, bucket: 'billable' },
            ],
            session: t.adminSession,
          }),
        ).rejects.toThrow(/allocation end/i);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('rejects a target whose date range falls outside its own project range', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const automate = await seedProject(t.adminSession, 'Automate');
        const xxx = await seedProject(t.adminSession, 'XXX', {
          date_from: '2026-01-01',
          date_to: '2026-06-30',
        });
        const worker = crypto.randomUUID();

        const { allocation_id } = await createAllocation({
          project_id: automate,
          worker_id: worker,
          date_from: '2026-01-01',
          date_to: '2026-12-31',
          bucket: 'billable',
          planned_pct: 100,
          status: 'committed',
          session: t.adminSession,
        });

        let caught: unknown;
        try {
          await reassignAllocation({
            allocation_id,
            source: { date_to: '2026-06-30' },
            targets: [
              {
                project_id: xxx,
                date_from: '2026-07-01',
                planned_pct: 100,
                bucket: 'billable',
                date_to: '2026-10-31',
              },
            ],
            session: t.adminSession,
          });
        } catch (e) {
          caught = e;
        }
        expect(caught).toMatchObject({
          // Names the project so a PM reading the message knows where the bound came from.
          message: expect.stringMatching(/^XXX: allocation end/i),
          details: { field: 'target', index: 0 },
        });
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('rejects a new source end date that now falls outside the source project range, tagging the error to the source field', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const automate = await seedProject(t.adminSession, 'Automate');
        const xxx = await seedProject(t.adminSession, 'XXX');
        const worker = crypto.randomUUID();

        const { allocation_id } = await createAllocation({
          project_id: automate,
          worker_id: worker,
          date_from: '2026-01-01',
          date_to: '2026-12-31',
          bucket: 'billable',
          planned_pct: 100,
          status: 'committed',
          session: t.adminSession,
        });

        // Project's own end date is shortened after the allocation was created.
        await pmDb().update(project).set({ date_to: '2026-06-30' }).where(eq(project.id, automate));

        let caught: unknown;
        try {
          await reassignAllocation({
            allocation_id,
            source: { date_to: '2026-08-30' },
            targets: [
              {
                project_id: xxx,
                date_from: '2026-09-01',
                planned_pct: 100,
                bucket: 'billable',
                date_to: null,
              },
            ],
            session: t.adminSession,
          });
        } catch (e) {
          caught = e;
        }
        expect(caught).toMatchObject({
          message: expect.stringMatching(/^Automate: allocation end/i),
          details: { field: 'source' },
        });
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
        const automate = await seedProject(t.adminSession, 'Automate');
        const xxx = await seedProject(t.adminSession, 'XXX');
        const worker = crypto.randomUUID();

        const { allocation_id } = await createAllocation({
          project_id: automate,
          worker_id: worker,
          date_from: '2026-01-01',
          date_to: '2026-12-31',
          bucket: 'billable',
          planned_pct: 100,
          status: 'committed',
          session: t.adminSession,
        });

        await expect(
          reassignAllocation({
            allocation_id,
            source: { date_to: '2026-06-30' },
            targets: [
              { project_id: xxx, date_from: '2026-07-01', planned_pct: 100, bucket: 'billable' },
            ],
            expected_version: 99,
            session: t.adminSession,
          }),
        ).rejects.toThrow(/version/i);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});

describe('previewReassignAllocation', () => {
  it('matches the non-conflicting business example (source shortened, targets start after)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const automotive = await seedProject(t.adminSession, 'Automotive');
        const crm = await seedProject(t.adminSession, 'CRM');
        const mobility = await seedProject(t.adminSession, 'Mobility');
        const worker = crypto.randomUUID();

        const { allocation_id } = await createAllocation({
          project_id: automotive,
          worker_id: worker,
          date_from: '2026-08-09',
          date_to: '2026-12-31',
          bucket: 'billable',
          planned_pct: 100,
          status: 'committed',
          session: t.adminSession,
        });

        const preview = await previewReassignAllocation({
          allocation_id,
          source: { date_to: '2026-09-30' },
          targets: [
            {
              project_id: crm,
              date_from: '2026-10-01',
              planned_pct: 50,
              bucket: 'billable',
              date_to: '2026-12-31',
            },
            {
              project_id: mobility,
              date_from: '2026-10-01',
              planned_pct: 50,
              bucket: 'billable',
              date_to: '2026-12-31',
            },
          ],
          session: t.adminSession,
        });

        expect(preview.worker_name).toBeNull(); // no person_projection row synced for this random worker id
        expect(preview.source).toMatchObject({
          project_name: 'Automotive',
          account_name: 'A-Automotive',
          bucket: 'billable',
          date_from: '2026-08-09',
          date_to: '2026-09-30',
          planned_pct: 100,
        });
        expect(preview.targets).toHaveLength(2);
        expect(preview.targets[0]).toMatchObject({
          project_name: 'CRM',
          account_name: 'A-CRM',
          bucket: 'billable',
          planned_pct: 50,
        });
        expect(preview.targets[1]).toMatchObject({
          project_name: 'Mobility',
          account_name: 'A-Mobility',
          bucket: 'billable',
          planned_pct: 50,
        });
        expect(preview.peak_pct).toBe(100);
        expect(preview.exceeds).toBe(false);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('flags over-allocation when the source is kept unchanged alongside an overlapping target', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const automotive = await seedProject(t.adminSession, 'Automotive');
        const crm = await seedProject(t.adminSession, 'CRM');
        const worker = crypto.randomUUID();

        const { allocation_id } = await createAllocation({
          project_id: automotive,
          worker_id: worker,
          date_from: '2026-08-09',
          date_to: '2026-12-31',
          bucket: 'billable',
          planned_pct: 100,
          status: 'committed',
          session: t.adminSession,
        });

        // "Keep current allocation": new end date == its original end date (unchanged).
        const preview = await previewReassignAllocation({
          allocation_id,
          source: { date_to: '2026-12-31' },
          targets: [
            {
              project_id: crm,
              date_from: '2026-10-01',
              planned_pct: 50,
              bucket: 'billable',
              date_to: '2026-12-31',
            },
          ],
          session: t.adminSession,
        });

        expect(preview.peak_pct).toBe(150);
        expect(preview.exceeds).toBe(true);
        // Overlap window: CRM starts 10-01 (after Automotive's 08-09) and both run through 12-31.
        expect(preview.peak_from).toBe('2026-10-01');
        expect(preview.peak_to).toBe('2026-12-31');
        expect(preview.over_allocation_periods).toEqual([
          { date_from: '2026-10-01', date_to: '2026-12-31', peak_pct: 150 },
        ]);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('reports all separate non-continuous over-allocation periods (FUT-885)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const commerceCanal = await seedProject(t.adminSession, 'Commerce Canal');
        const motionGlobal = await seedProject(t.adminSession, 'Motion Global');
        const teacherZone = await seedProject(t.adminSession, 'Teacher Zone');
        const worker = crypto.randomUUID();

        const { allocation_id } = await createAllocation({
          project_id: commerceCanal,
          worker_id: worker,
          date_from: '2026-08-06',
          date_to: '2026-12-31',
          bucket: 'billable',
          planned_pct: 100,
          status: 'committed',
          session: t.adminSession,
        });

        const preview = await previewReassignAllocation({
          allocation_id,
          source: { date_to: '2026-12-31' },
          targets: [
            {
              project_id: motionGlobal,
              date_from: '2026-09-24',
              date_to: '2026-09-30',
              planned_pct: 100,
              bucket: 'billable',
            },
            {
              project_id: teacherZone,
              date_from: '2026-11-01',
              date_to: '2026-11-30',
              planned_pct: 100,
              bucket: 'billable',
            },
          ],
          session: t.adminSession,
        });

        expect(preview.peak_pct).toBe(200);
        expect(preview.exceeds).toBe(true);
        expect(preview.over_allocation_periods).toEqual([
          { date_from: '2026-09-24', date_to: '2026-09-30', peak_pct: 200 },
          { date_from: '2026-11-01', date_to: '2026-11-30', peak_pct: 200 },
        ]);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('reports the overlap window as open-ended when the overlapping target has no end date', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const automotive = await seedProject(t.adminSession, 'Automotive');
        const crm = await seedProject(t.adminSession, 'CRM');
        const worker = crypto.randomUUID();

        const { allocation_id } = await createAllocation({
          project_id: automotive,
          worker_id: worker,
          date_from: '2026-08-09',
          date_to: '2026-12-31',
          bucket: 'billable',
          planned_pct: 100,
          status: 'committed',
          session: t.adminSession,
        });

        // "Keep current allocation" + an open-ended overlapping target.
        const preview = await previewReassignAllocation({
          allocation_id,
          source: { date_to: '2026-12-31' },
          targets: [
            {
              project_id: crm,
              date_from: '2026-10-01',
              planned_pct: 50,
              bucket: 'billable',
              date_to: null,
            },
          ],
          session: t.adminSession,
        });

        expect(preview.peak_pct).toBe(150);
        expect(preview.peak_from).toBe('2026-10-01');
        // Bounded by Automotive's own end (12-31) since CRM itself never ends.
        expect(preview.peak_to).toBe('2026-12-31');
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('spans the full over-100% window across two overlapping targets, not just the moment they all line up', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const aiData = await seedProject(t.adminSession, 'AI-Data');
        const finchMobile = await seedProject(t.adminSession, 'Finch-Mobile');
        const gridbeyond = await seedProject(t.adminSession, 'Gridbeyond');
        const worker = crypto.randomUUID();

        const { allocation_id } = await createAllocation({
          project_id: aiData,
          worker_id: worker,
          date_from: '2026-04-01',
          date_to: '2026-12-30',
          bucket: 'billable',
          planned_pct: 100,
          status: 'committed',
          session: t.adminSession,
        });

        // "Keep current allocation" + two new targets that both overlap it, at
        // different (staggered) end dates — Finch Mobile runs a month past Gridbeyond.
        const preview = await previewReassignAllocation({
          allocation_id,
          source: { date_to: '2026-12-30' },
          targets: [
            {
              project_id: finchMobile,
              date_from: '2026-07-01',
              planned_pct: 40,
              bucket: 'billable',
              date_to: '2026-10-01',
            },
            {
              project_id: gridbeyond,
              date_from: '2026-07-01',
              planned_pct: 50,
              bucket: 'billable',
              date_to: '2026-08-01',
            },
          ],
          session: t.adminSession,
        });

        expect(preview.peak_pct).toBe(190); // 100 + 40 + 50, while all three run together
        expect(preview.exceeds).toBe(true);
        // The over-100% window spans the whole time EITHER target keeps the worker
        // over capacity — not just the narrower slice where both happen to overlap
        // at once (Jul 1 – Aug 1). It only drops to 100% once Finch Mobile ends.
        expect(preview.peak_from).toBe('2026-07-01');
        expect(preview.peak_to).toBe('2026-10-01');
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('reassignAllocation itself also reports the over-allocation warning for the kept scenario', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const automotive = await seedProject(t.adminSession, 'Automotive');
        const crm = await seedProject(t.adminSession, 'CRM');
        const worker = crypto.randomUUID();

        const { allocation_id } = await createAllocation({
          project_id: automotive,
          worker_id: worker,
          date_from: '2026-08-09',
          date_to: '2026-12-31',
          bucket: 'billable',
          planned_pct: 100,
          status: 'committed',
          session: t.adminSession,
        });

        const result = await reassignAllocation({
          allocation_id,
          source: { date_to: '2026-12-31' },
          targets: [
            {
              project_id: crm,
              date_from: '2026-10-01',
              planned_pct: 50,
              bucket: 'billable',
              date_to: '2026-12-31',
            },
          ],
          session: t.adminSession,
        });

        // FUT-853: warnings now carry the worker's combined peak + over-allocation periods,
        // not a per-project attribution. There is exactly one warning entry for the worker.
        expect(result.warnings).toHaveLength(1);
        expect(result.warnings[0]).toMatchObject({
          peak_pct: 150,
          over_allocation_periods: expect.arrayContaining([
            expect.objectContaining({ peak_pct: 150 }),
          ]),
        });
        // The old project_name field must no longer be present.
        expect(result.warnings[0]).not.toHaveProperty('project_name');
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('FUT-853: reassignWorkerAllocations warning describes the combined peak — not a per-project %', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const existing = await seedProject(t.adminSession, 'ExistingProj');
        const motionGlobal = await seedProject(t.adminSession, 'Motion Global');
        const worker = crypto.randomUUID();

        // Worker already has 100% on ExistingProj.
        await createAllocation({
          project_id: existing,
          worker_id: worker,
          date_from: '2026-08-01',
          date_to: '2026-12-31',
          bucket: 'billable',
          planned_pct: 100,
          status: 'committed',
          session: t.adminSession,
        });

        // Add 100% on Motion Global with overlapping dates via reassignWorkerAllocations.
        const result = await reassignWorkerAllocations({
          worker_id: worker,
          allocation_ids: [],
          source: { date_to: new Date().toISOString().slice(0, 10) }, // unused (no source ending)
          targets: [
            {
              project_id: motionGlobal,
              date_from: '2026-09-01',
              planned_pct: 100,
              bucket: 'billable',
              date_to: '2026-12-31',
            },
          ],
          session: t.adminSession,
        });

        // Combined total = 200% during Sep–Dec overlap.
        expect(result.warnings).toHaveLength(1);
        const w = result.warnings[0];
        expect(w?.peak_pct).toBe(200);
        expect(w?.over_allocation_periods.length).toBeGreaterThan(0);
        // No project_name — the warning is about the worker, not the project.
        expect(w).not.toHaveProperty('project_name');
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
