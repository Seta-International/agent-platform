import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { resetPmDb } from '../../src/backend/db/client.ts';
import {
  deleteStaffingPlanLine,
  listProjectAccess,
  listStaffingPlan,
  setProjectAccess,
  submitCharter,
  upsertStaffingPlanLine,
} from '../../src/index.ts';
import { approveCharterTwoStage, buildSession, readEvents, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

async function seedProject(
  pool: import('pg').Pool,
  session: import('@seta/core').SessionScope,
  tenantId: string,
) {
  const acc = await pool.query(
    `INSERT INTO pm.account (tenant_id, name) VALUES ($1,'A') RETURNING id`,
    [tenantId],
  );
  const { project_id: charterId } = await submitCharter({
    account_id: acc.rows[0].id,
    name: 'P',
    pm_worker_id: session.user_id,
    methodology: 'scrum',
    pricing_model: 'fixed_price',
    budget_bmm: 100,
    session,
  });
  return approveCharterTwoStage(charterId, session.tenant_id);
}

describe('project access + staffing plan', () => {
  it('set-diffs access grants and upserts staffing-plan lines', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { project_id } = await seedProject(pool, t.adminSession, t.tenant_id);

        const w = crypto.randomUUID();
        // Add a new edit-level grant (owner already exists from charter approval)
        const r = await setProjectAccess({
          project_id,
          grants: [
            { worker_id: t.adminSession.user_id, level: 'owner' },
            { worker_id: w, level: 'edit' },
          ],
          session: t.adminSession,
        });
        expect(r.added).toBe(1); // w was added; owner already existed (no change)
        const access = await listProjectAccess({ project_id, session: t.adminSession });
        expect(access.find((a) => a.worker_id === w)?.level).toBe('edit');

        // the access-changed event carries the current owner-level worker ids, so hiring
        // (FUT-328) can project "who owns this project" without a cross-module join
        const accessEvents = await readEvents(pool, t.tenant_id, 'pm.project.access.changed');
        const latest = accessEvents[accessEvents.length - 1];
        expect(latest?.payload.owner_worker_ids).toEqual([t.adminSession.user_id]);

        const line = await upsertStaffingPlanLine({
          project_id,
          role: 'Backend',
          effort_mm: 2,
          skills: [{ skill_id: crypto.randomUUID(), skill_name: 'node' }],
          session: t.adminSession,
        });
        expect(line.version).toBe(1);
        expect((await listStaffingPlan({ project_id, session: t.adminSession })).length).toBe(1);
        expect(
          (await readEvents(pool, t.tenant_id, 'pm.project.staffing_plan.changed')).length,
        ).toBe(1);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('project creation seeds the PM as owner and emits access.changed (FUT-328)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { project_id } = await seedProject(pool, t.adminSession, t.tenant_id);

        const access = await listProjectAccess({ project_id, session: t.adminSession });
        expect(access).toEqual([{ worker_id: t.adminSession.user_id, level: 'owner' }]);

        const accessEvents = await readEvents(pool, t.tenant_id, 'pm.project.access.changed');
        expect(accessEvents.length).toBe(1);
        expect(accessEvents[0]?.payload.owner_worker_ids).toEqual([t.adminSession.user_id]);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('(Δ C) non-empty grants set with no owner throws VALIDATION', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { project_id } = await seedProject(pool, t.adminSession, t.tenant_id);

        await expect(
          setProjectAccess({
            project_id,
            grants: [{ worker_id: crypto.randomUUID(), level: 'view' }],
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

  it('empty grants array against an existing owner throws VALIDATION (does not silently drop access)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { project_id } = await seedProject(pool, t.adminSession, t.tenant_id);
        // project creation already seeded the PM as owner and emitted one access.changed event
        const before = (await readEvents(pool, t.tenant_id, 'pm.project.access.changed')).length;

        await expect(
          setProjectAccess({ project_id, grants: [], session: t.adminSession }),
        ).rejects.toMatchObject({ code: 'VALIDATION' });

        const access = await listProjectAccess({ project_id, session: t.adminSession });
        expect(access).toEqual([{ worker_id: t.adminSession.user_id, level: 'owner' }]);
        expect((await readEvents(pool, t.tenant_id, 'pm.project.access.changed')).length).toBe(
          before,
        );
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('removing the last remaining grant (the owner) via a shrinking set throws VALIDATION', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { project_id } = await seedProject(pool, t.adminSession, t.tenant_id);

        const w = crypto.randomUUID();
        await setProjectAccess({
          project_id,
          grants: [
            { worker_id: t.adminSession.user_id, level: 'owner' },
            { worker_id: w, level: 'edit' },
          ],
          session: t.adminSession,
        });

        await expect(
          setProjectAccess({
            project_id,
            grants: [{ worker_id: w, level: 'edit' }],
            session: t.adminSession,
          }),
        ).rejects.toMatchObject({ code: 'VALIDATION' });

        const access = await listProjectAccess({ project_id, session: t.adminSession });
        expect(access.find((a) => a.worker_id === t.adminSession.user_id)?.level).toBe('owner');
        expect(access.find((a) => a.worker_id === w)?.level).toBe('edit');
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('idempotent re-apply of same grants emits no spurious event', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { project_id } = await seedProject(pool, t.adminSession, t.tenant_id);

        // First call: add a worker
        const w = crypto.randomUUID();
        await setProjectAccess({
          project_id,
          grants: [
            { worker_id: t.adminSession.user_id, level: 'owner' },
            { worker_id: w, level: 'edit' },
          ],
          session: t.adminSession,
        });
        const eventsAfterFirst = (await readEvents(pool, t.tenant_id, 'pm.project.access.changed'))
          .length;

        // Second call with identical grants — should emit nothing
        const r2 = await setProjectAccess({
          project_id,
          grants: [
            { worker_id: t.adminSession.user_id, level: 'owner' },
            { worker_id: w, level: 'edit' },
          ],
          session: t.adminSession,
        });
        expect(r2.added).toBe(0);
        expect(r2.removed).toBe(0);
        expect(r2.changed).toBe(0);
        const eventsAfterSecond = (await readEvents(pool, t.tenant_id, 'pm.project.access.changed'))
          .length;
        expect(eventsAfterSecond).toBe(eventsAfterFirst);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('level change for an existing worker increments changed counter', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { project_id } = await seedProject(pool, t.adminSession, t.tenant_id);

        const w = crypto.randomUUID();
        await setProjectAccess({
          project_id,
          grants: [
            { worker_id: t.adminSession.user_id, level: 'owner' },
            { worker_id: w, level: 'edit' },
          ],
          session: t.adminSession,
        });
        // Now change w from edit → view (still keeping owner)
        const r = await setProjectAccess({
          project_id,
          grants: [
            { worker_id: t.adminSession.user_id, level: 'owner' },
            { worker_id: w, level: 'view' },
          ],
          session: t.adminSession,
        });
        expect(r.changed).toBe(1);
        const access = await listProjectAccess({ project_id, session: t.adminSession });
        expect(access.find((a) => a.worker_id === w)?.level).toBe('view');
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('staffing-plan line update bumps version; delete removes line + emits event', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { project_id } = await seedProject(pool, t.adminSession, t.tenant_id);

        const line = await upsertStaffingPlanLine({
          project_id,
          role: 'FE',
          effort_mm: 1,
          skills: [{ skill_id: crypto.randomUUID(), skill_name: 'react' }],
          session: t.adminSession,
        });
        expect(line.version).toBe(1);

        const updated = await upsertStaffingPlanLine({
          project_id,
          line_id: line.line_id,
          expected_version: 1,
          role: 'FE',
          effort_mm: 3,
          skills: [
            { skill_id: crypto.randomUUID(), skill_name: 'react' },
            { skill_id: crypto.randomUUID(), skill_name: 'ts' },
          ],
          session: t.adminSession,
        });
        expect(updated.version).toBe(2);

        const { deleted } = await deleteStaffingPlanLine({
          project_id,
          line_id: line.line_id,
          session: t.adminSession,
        });
        expect(deleted).toBe(true);
        expect((await listStaffingPlan({ project_id, session: t.adminSession })).length).toBe(0);
        // 2 upserts + 1 delete = 3 staffing events
        expect(
          (await readEvents(pool, t.tenant_id, 'pm.project.staffing_plan.changed')).length,
        ).toBe(3);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('stale expected_version on staffing upsert and delete throws CONFLICT', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { project_id } = await seedProject(pool, t.adminSession, t.tenant_id);

        const line = await upsertStaffingPlanLine({
          project_id,
          role: 'QA',
          effort_mm: 1,
          session: t.adminSession,
        });
        // Stale version on update
        await expect(
          upsertStaffingPlanLine({
            project_id,
            line_id: line.line_id,
            expected_version: 99,
            role: 'QA',
            session: t.adminSession,
          }),
        ).rejects.toMatchObject({ code: 'CONFLICT' });
        // Stale version on delete
        await expect(
          deleteStaffingPlanLine({
            project_id,
            line_id: line.line_id,
            expected_version: 99,
            session: t.adminSession,
          }),
        ).rejects.toMatchObject({ code: 'CONFLICT' });
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('viewer cannot call setProjectAccess or upsertStaffingPlanLine', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { project_id } = await seedProject(pool, t.adminSession, t.tenant_id);

        const viewer = buildSession({
          tenant_id: t.tenant_id,
          user_id: t.admin_user_id,
          roles: ['pm.viewer'],
        });
        await expect(
          setProjectAccess({
            project_id,
            grants: [{ worker_id: crypto.randomUUID(), level: 'owner' }],
            session: viewer,
          }),
        ).rejects.toMatchObject({ code: 'FORBIDDEN' });
        await expect(
          upsertStaffingPlanLine({ project_id, role: 'BE', session: viewer }),
        ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
