import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { pmDb, resetPmDb } from '../../src/backend/db/client.ts';
import { project } from '../../src/backend/db/schema.ts';
import {
  closeProject,
  editProject,
  getProject,
  linkPlannerGroup,
  listProjects,
  reopenProject,
  submitCharter,
} from '../../src/index.ts';
import { approveCharterTwoStage, buildSession, readEvents, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

async function liveProject(
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
  return (await approveCharterTwoStage(charterId, session.tenant_id)).project_id;
}

describe('project run', () => {
  it('edits phase/status, closes, links planner group, emits pm.project.updated', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = await liveProject(pool, t.adminSession, t.tenant_id);

        const e = await editProject({
          project_id: projectId,
          patch: { phase: 'execution', objective: 'Ship' },
          session: t.adminSession,
        });
        // The project accrues version through the governance lifecycle
        // (submit=1, pmo sign-off=2, BoD approve=3), so the first post-approval
        // edit lands on version 4.
        expect(e.version).toBe(4);

        const gid = crypto.randomUUID();
        await linkPlannerGroup({
          project_id: projectId,
          planner_group_id: gid,
          session: t.adminSession,
        });

        await closeProject({ project_id: projectId, session: t.adminSession });
        const [p] = await pmDb().select().from(project).where(eq(project.id, projectId));
        expect(p?.status).toBe('closed');
        expect(p?.planner_group_id).toBe(gid);

        const detail = await getProject({ project_id: projectId, session: t.adminSession });
        expect(detail.phase).toBe('closed');
        expect((await listProjects(t.adminSession)).map((x) => x.project_id)).toContain(projectId);
        const updatedEvents = await readEvents(pool, t.tenant_id, 'pm.project.updated');
        expect(updatedEvents.length).toBeGreaterThanOrEqual(3);
        // each event carries name + account_id (enriched payload)
        for (const ev of updatedEvents) {
          expect(typeof ev.payload.name).toBe('string');
          expect(typeof ev.payload.account_id).toBe('string');
        }
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('(E) editProject on closed project → CONFLICT; reopenProject restores active/execution; reopen on non-closed → CONFLICT', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = await liveProject(pool, t.adminSession, t.tenant_id);

        // Close the project
        await closeProject({ project_id: projectId, session: t.adminSession });

        // editProject on closed project → CONFLICT
        await expect(
          editProject({
            project_id: projectId,
            patch: { objective: 'blocked' },
            session: t.adminSession,
          }),
        ).rejects.toMatchObject({ code: 'CONFLICT' });

        // linkPlannerGroup on closed project → CONFLICT
        await expect(
          linkPlannerGroup({
            project_id: projectId,
            planner_group_id: crypto.randomUUID(),
            session: t.adminSession,
          }),
        ).rejects.toMatchObject({ code: 'CONFLICT' });

        // reopenProject restores status=active, phase=execution
        const r = await reopenProject({ project_id: projectId, session: t.adminSession });
        expect(r.version).toBeGreaterThan(1);

        const detail = await getProject({ project_id: projectId, session: t.adminSession });
        expect(detail.status).toBe('active');
        expect(detail.phase).toBe('execution');

        // subsequent editProject succeeds
        const e2 = await editProject({
          project_id: projectId,
          patch: { objective: 'now editable' },
          session: t.adminSession,
        });
        expect(e2.version).toBeGreaterThan(r.version);

        // reopenProject on non-closed project → CONFLICT
        await expect(
          reopenProject({ project_id: projectId, session: t.adminSession }),
        ).rejects.toMatchObject({ code: 'CONFLICT' });
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('stale version → CONFLICT; viewer cannot manage', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = await liveProject(pool, t.adminSession, t.tenant_id);

        await expect(
          editProject({
            project_id: projectId,
            expected_version: 99,
            patch: { objective: 'stale' },
            session: t.adminSession,
          }),
        ).rejects.toMatchObject({ code: 'CONFLICT' });

        const viewer = buildSession({
          tenant_id: t.tenant_id,
          user_id: t.admin_user_id,
          roles: ['pm.viewer'],
        });
        await expect(
          editProject({ project_id: projectId, patch: { objective: 'x' }, session: viewer }),
        ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('edits org_unit_id and returns it', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = await liveProject(pool, t.adminSession, t.tenant_id);
        const orgUnitId = crypto.randomUUID();

        await editProject({
          project_id: projectId,
          patch: { org_unit_id: orgUnitId },
          session: t.adminSession,
        });

        const p = await getProject({ project_id: projectId, session: t.adminSession });
        expect(p.org_unit_id).toBe(orgUnitId);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('assigns and removes EM/PMO independently via pm_worker_id/pmo_worker_id', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = await liveProject(pool, t.adminSession, t.tenant_id);
        const emId = crypto.randomUUID();
        const pmoId = crypto.randomUUID();

        await editProject({
          project_id: projectId,
          patch: { pm_worker_id: emId, pmo_worker_id: pmoId },
          session: t.adminSession,
        });
        let p = await getProject({ project_id: projectId, session: t.adminSession });
        expect(p.pm_worker_id).toBe(emId);
        expect(p.pmo_worker_id).toBe(pmoId);

        // Removing PMO leaves EM untouched.
        await editProject({
          project_id: projectId,
          patch: { pmo_worker_id: null },
          session: t.adminSession,
        });
        p = await getProject({ project_id: projectId, session: t.adminSession });
        expect(p.pm_worker_id).toBe(emId);
        expect(p.pmo_worker_id).toBeNull();

        // Assigning a new PMO after removal.
        const pmoId2 = crypto.randomUUID();
        await editProject({
          project_id: projectId,
          patch: { pmo_worker_id: pmoId2 },
          session: t.adminSession,
        });
        p = await getProject({ project_id: projectId, session: t.adminSession });
        expect(p.pmo_worker_id).toBe(pmoId2);

        const updatedEvents = await readEvents(pool, t.tenant_id, 'pm.project.updated');
        const emChange = updatedEvents.find((ev) =>
          (ev.payload.fields as string[]).includes('pm_worker_id'),
        );
        expect(emChange).toBeDefined();
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('EM/PMO reassignment requires a tenant-wide or org-unit-matching manage grant, not just self-scope', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = await liveProject(pool, t.adminSession, t.tenant_id);
        const orgUnitId = crypto.randomUUID();
        await editProject({
          project_id: projectId,
          patch: { org_unit_id: orgUnitId },
          session: t.adminSession,
        });
        const emId = crypto.randomUUID();
        await editProject({
          project_id: projectId,
          patch: { pm_worker_id: emId },
          session: t.adminSession,
        });

        // The incumbent EM, holding only a self-scoped pm.manager grant, can manage other
        // fields on their own project (via the pm_person_id relationship arm)...
        const selfScopedEm = buildSession({
          tenant_id: t.tenant_id,
          user_id: crypto.randomUUID(),
          roles: ['pm.manager'],
          assignments: [{ role_slug: 'pm.manager', scope_kind: 'self', scope_id: null }],
          worker_id: emId,
        });
        await expect(
          editProject({
            project_id: projectId,
            patch: { objective: 'EM can edit their own project' },
            session: selfScopedEm,
          }),
        ).resolves.toBeDefined();

        // ...but cannot reassign EM/PMO on it — that requires real org/tenant reach, not just
        // being the incumbent.
        await expect(
          editProject({
            project_id: projectId,
            patch: { pm_worker_id: crypto.randomUUID() },
            session: selfScopedEm,
          }),
        ).rejects.toMatchObject({ code: 'FORBIDDEN' });

        // An org-unit-scoped pm.manager whose grant covers this project's org unit can.
        const orgScopedManager = buildSession({
          tenant_id: t.tenant_id,
          user_id: crypto.randomUUID(),
          roles: ['pm.manager'],
          assignments: [
            {
              role_slug: 'pm.manager',
              scope_kind: 'org_unit',
              scope_id: orgUnitId,
              org_unit_ids: [orgUnitId],
            },
          ],
        });
        const newEmId = crypto.randomUUID();
        await editProject({
          project_id: projectId,
          patch: { pm_worker_id: newEmId },
          session: orgScopedManager,
        });
        const p = await getProject({ project_id: projectId, session: t.adminSession });
        expect(p.pm_worker_id).toBe(newEmId);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('reads are tenant-scoped: listProjects and getProject only return own tenant rows', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t1 = await seedTenant(pool);
        const t2 = await seedTenant(pool);
        const pid1 = await liveProject(pool, t1.adminSession, t1.tenant_id);
        await liveProject(pool, t2.adminSession, t2.tenant_id);

        const rows = await listProjects(t1.adminSession);
        expect(rows.map((r) => r.project_id)).toContain(pid1);
        expect(rows.every((r) => r.project_id !== undefined)).toBe(true);
        // all rows belong to t1
        const details = await getProject({ project_id: pid1, session: t1.adminSession });
        expect(details.project_id).toBe(pid1);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
