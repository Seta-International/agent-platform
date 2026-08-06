// packages/hiring/tests/integration/open-requisitions-board.test.ts
// FUT-326: BOD/PMO view every board requisition (open, on_hold, filled or cancelled — FUT-878)
// company-wide on a board.
import { resetCoreDb } from '@seta/core/testing';
import { createAccount } from '@seta/pm';
import { resetPmDb } from '@seta/pm/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { hiringDb, resetHiringDb } from '../../src/backend/db/client.ts';
import { accountProjection, projectProjection, requisition } from '../../src/backend/db/schema.ts';
import { listOpenRequisitions, openRequisition } from '../../src/index.ts';
import { buildSession, seedOwnedProject, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('open requisitions board (FUT-326)', () => {
  it('BOD sees requisitions across accounts, including filled ones', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const accountA = crypto.randomUUID();
        const accountB = crypto.randomUUID();

        const { requisition_id: openInA } = await openRequisition({
          title: 'Req in account A',
          kind: 'new',
          account_id: accountA,
          session: t.adminSession,
        });
        const { requisition_id: openInB } = await openRequisition({
          title: 'Req in account B',
          kind: 'new',
          account_id: accountB,
          session: t.adminSession,
        });
        const { requisition_id: filledReq } = await openRequisition({
          title: 'Already filled',
          kind: 'new',
          account_id: accountA,
          session: t.adminSession,
        });
        // A filled requisition stays on the board (recruiters still need to find it) — only
        // cancelled drops off. It's told apart from live ones by its status pill.
        await hiringDb()
          .update(requisition)
          .set({ status: 'filled' })
          .where(eq(requisition.id, filledReq));

        // A BOD/PMO user is granted a read-only hiring role for board oversight.
        const bod = buildSession({
          tenant_id: t.tenant_id,
          user_id: crypto.randomUUID(),
          roles: ['pm.bod', 'hiring.viewer_all'],
        });

        const ids = (await listOpenRequisitions(bod)).requisitions.map((r) => r.id);

        expect(ids).toContain(openInA);
        expect(ids).toContain(openInB);
        expect(ids).toContain(filledReq);
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('PMO can read the board; on_hold is shown, cancelled is hidden', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { requisition_id: onHold } = await openRequisition({
          title: 'On hold',
          kind: 'new',
          session: t.adminSession,
        });
        const { requisition_id: cancelled } = await openRequisition({
          title: 'Cancelled',
          kind: 'new',
          session: t.adminSession,
        });
        await hiringDb()
          .update(requisition)
          .set({ status: 'on_hold' })
          .where(eq(requisition.id, onHold));
        await hiringDb()
          .update(requisition)
          .set({ status: 'cancelled' })
          .where(eq(requisition.id, cancelled));

        const pmo = buildSession({
          tenant_id: t.tenant_id,
          user_id: crypto.randomUUID(),
          roles: ['pm.pmo', 'hiring.viewer_all'],
        });

        // FUT-878: the board carries the same dataset as the list view — including cancelled —
        // so switching views preserves the requisitions and dashboard stats.
        const ids = (await listOpenRequisitions(pmo)).requisitions.map((r) => r.id);
        expect(ids).toContain(onHold);
        expect(ids).toContain(cancelled);
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('a user without board access is forbidden', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const outsider = buildSession({
          tenant_id: t.tenant_id,
          user_id: crypto.randomUUID(),
          roles: ['planner.viewer'],
        });
        await expect(listOpenRequisitions(outsider)).rejects.toThrow(/hiring\.requisition\.read/i);
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});

describe('account-scoped requisitions board (FUT-327)', () => {
  it('a recruiter sees only requisitions for accounts they’re assigned to, with a scope note', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const recruiterUserId = crypto.randomUUID();
        const recruiterWorkerId = crypto.randomUUID();

        const manager = buildSession({
          tenant_id: t.tenant_id,
          user_id: crypto.randomUUID(),
          roles: ['hiring.manager', 'pm.manager'],
        });

        const { account_id: myAccount } = await createAccount({
          name: 'My Account',
          recruiter_worker_ids: [recruiterWorkerId],
          session: manager,
        });
        const { account_id: otherAccount } = await createAccount({
          name: 'Other Account',
          session: manager,
        });
        // account_projection is normally synced from pm's account events by a subscriber;
        // seed it directly here so the join has a name to surface without a live dispatcher.
        await hiringDb()
          .insert(accountProjection)
          .values([
            { account_id: myAccount, tenant_id: t.tenant_id, name: 'My Account' },
            { account_id: otherAccount, tenant_id: t.tenant_id, name: 'Other Account' },
          ]);

        const { requisition_id: mine } = await openRequisition({
          title: 'Req on my account',
          kind: 'new',
          account_id: myAccount,
          session: manager,
        });
        await openRequisition({
          title: 'Req on another account',
          kind: 'new',
          account_id: otherAccount,
          session: manager,
        });

        const recruiter = buildSession({
          tenant_id: t.tenant_id,
          user_id: recruiterUserId,
          roles: ['hiring.recruiter'],
          assignments: [{ role_slug: 'hiring.recruiter', scope_kind: 'self', scope_id: null }],
          worker_id: recruiterWorkerId,
        });

        const result = await listOpenRequisitions(recruiter);
        expect(result.scope).toBe('scoped');
        expect(result.scoped_account_names).toEqual(['My Account']);
        expect(result.scoped_project_names).toEqual([]);
        expect(result.requisitions.map((r) => r.id)).toEqual([mine]);
      } finally {
        resetPmDb();
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('a recruiter with no worker link sees an empty board', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const manager = buildSession({
          tenant_id: t.tenant_id,
          user_id: crypto.randomUUID(),
          roles: ['hiring.manager', 'pm.manager'],
        });
        await openRequisition({
          title: 'Someone else’s req',
          kind: 'new',
          session: manager,
        });

        const unlinked = buildSession({
          tenant_id: t.tenant_id,
          user_id: crypto.randomUUID(),
          roles: ['hiring.recruiter'],
          assignments: [{ role_slug: 'hiring.recruiter', scope_kind: 'self', scope_id: null }],
          worker_id: null,
        });

        const result = await listOpenRequisitions(unlinked);
        expect(result.scope).toBe('scoped');
        expect(result.scoped_account_names).toEqual([]);
        expect(result.scoped_project_names).toEqual([]);
        expect(result.requisitions).toEqual([]);
      } finally {
        resetPmDb();
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('hiring.recruiter stays unscoped (full hiring access, not an AM/PM persona)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const accountA = crypto.randomUUID();
        const { requisition_id: reqInA } = await openRequisition({
          title: 'Req in A',
          kind: 'new',
          account_id: accountA,
          session: t.adminSession,
        });

        const recruiter = buildSession({
          tenant_id: t.tenant_id,
          user_id: crypto.randomUUID(),
          roles: ['hiring.recruiter'],
        });

        const result = await listOpenRequisitions(recruiter);
        expect(result.scope).toBe('all');
        expect(result.requisitions.map((r) => r.id)).toContain(reqInA);
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});

describe('AM account-scoped requisitions board (FUT-330)', () => {
  it('an AM sees only requisitions for accounts they manage, with a scope note', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const amUserId = crypto.randomUUID();
        const amWorkerId = crypto.randomUUID();

        const manager = buildSession({
          tenant_id: t.tenant_id,
          user_id: crypto.randomUUID(),
          roles: ['pm.manager'],
        });
        // AM scope now resolves via @seta/pm (listAccountIdsManagedBy → pm.account.am_person_id).
        const { account_id: myAccount } = await createAccount({
          name: 'My Account',
          am_worker_id: amWorkerId,
          session: manager,
        });
        const { account_id: otherAccount } = await createAccount({
          name: 'Other Account',
          session: manager,
        });
        // hiring.account_projection still supplies the display name for the scope note (leftJoin).
        await hiringDb()
          .insert(accountProjection)
          .values([
            { account_id: myAccount, tenant_id: t.tenant_id, name: 'My Account' },
            { account_id: otherAccount, tenant_id: t.tenant_id, name: 'Other Account' },
          ]);

        const { requisition_id: mine } = await openRequisition({
          title: 'Req on my account',
          kind: 'new',
          account_id: myAccount,
          session: t.adminSession,
        });
        await openRequisition({
          title: 'Req on another account',
          kind: 'new',
          account_id: otherAccount,
          session: t.adminSession,
        });

        const am = buildSession({
          tenant_id: t.tenant_id,
          user_id: amUserId,
          roles: ['hiring.viewer'],
          assignments: [{ role_slug: 'hiring.viewer', scope_kind: 'self', scope_id: null }],
          worker_id: amWorkerId,
        });

        const result = await listOpenRequisitions(am);
        expect(result.scope).toBe('scoped');
        expect(result.scoped_account_names).toEqual(['My Account']);
        expect(result.scoped_project_names).toEqual([]);
        expect(result.requisitions.map((r) => r.id)).toEqual([mine]);
      } finally {
        resetPmDb();
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});

describe('project-scoped requisitions board (FUT-328)', () => {
  it('EM/TL/PM sees only requisitions for projects they own, with a scope note', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const leaderUserId = crypto.randomUUID();
        const workerId = crypto.randomUUID();
        const otherProject = crypto.randomUUID();

        const manager = buildSession({
          tenant_id: t.tenant_id,
          user_id: crypto.randomUUID(),
          roles: ['pm.manager'],
        });
        // Owner scope now resolves via @seta/pm (listProjectIdsOwnedBy → pm.project_access).
        const { project_id: myProject, account_id } = await seedOwnedProject({
          tenant_id: t.tenant_id,
          session: manager,
          ownerWorkerId: workerId,
        });
        // hiring.project_projection still supplies the display name for the scope note (leftJoin).
        await hiringDb().insert(projectProjection).values({
          project_id: myProject,
          tenant_id: t.tenant_id,
          account_id,
          name: 'My Project',
        });

        const { requisition_id: mine } = await openRequisition({
          title: 'Req on my project',
          kind: 'new',
          project_id: myProject,
          session: t.adminSession,
        });
        await openRequisition({
          title: 'Req on another project',
          kind: 'new',
          project_id: otherProject,
          session: t.adminSession,
        });

        const leader = buildSession({
          tenant_id: t.tenant_id,
          user_id: leaderUserId,
          roles: ['hiring.viewer'],
          assignments: [{ role_slug: 'hiring.viewer', scope_kind: 'self', scope_id: null }],
          worker_id: workerId,
        });

        const result = await listOpenRequisitions(leader);
        expect(result.scope).toBe('scoped');
        expect(result.scoped_account_names).toEqual([]);
        expect(result.scoped_project_names).toEqual(['My Project']);
        expect(result.requisitions.map((r) => r.id)).toEqual([mine]);
      } finally {
        resetPmDb();
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('a user who is both a recruiter on an account and owner of another project sees the union', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const userId = crypto.randomUUID();
        const workerId = crypto.randomUUID();

        const manager = buildSession({
          tenant_id: t.tenant_id,
          user_id: crypto.randomUUID(),
          roles: ['hiring.manager', 'pm.manager'],
        });
        const { account_id: myAccount } = await createAccount({
          name: 'My Account',
          recruiter_worker_ids: [workerId],
          session: manager,
        });
        await hiringDb()
          .insert(accountProjection)
          .values({ account_id: myAccount, tenant_id: t.tenant_id, name: 'My Account' });
        // Owner scope now resolves via @seta/pm (listProjectIdsOwnedBy → pm.project_access).
        const { project_id: myProject } = await seedOwnedProject({
          tenant_id: t.tenant_id,
          session: manager,
          ownerWorkerId: workerId,
        });

        const { requisition_id: viaAccount } = await openRequisition({
          title: 'Req via account',
          kind: 'new',
          account_id: myAccount,
          session: manager,
        });
        const { requisition_id: viaProject } = await openRequisition({
          title: 'Req via project',
          kind: 'new',
          project_id: myProject,
          session: manager,
        });

        const user = buildSession({
          tenant_id: t.tenant_id,
          user_id: userId,
          roles: ['hiring.viewer'],
          assignments: [{ role_slug: 'hiring.viewer', scope_kind: 'self', scope_id: null }],
          worker_id: workerId,
        });

        const result = await listOpenRequisitions(user);
        expect(result.requisitions.map((r) => r.id).sort()).toEqual(
          [viaAccount, viaProject].sort(),
        );
      } finally {
        resetPmDb();
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('a requisition matching both a recruiter-account and an owned project is not duplicated', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const userId = crypto.randomUUID();
        const workerId = crypto.randomUUID();

        const manager = buildSession({
          tenant_id: t.tenant_id,
          user_id: crypto.randomUUID(),
          roles: ['hiring.manager', 'pm.manager'],
        });
        const { account_id: myAccount } = await createAccount({
          name: 'My Account',
          recruiter_worker_ids: [workerId],
          session: manager,
        });
        // Owner scope now resolves via @seta/pm (listProjectIdsOwnedBy → pm.project_access).
        const { project_id: myProject } = await seedOwnedProject({
          tenant_id: t.tenant_id,
          session: manager,
          ownerWorkerId: workerId,
        });

        const { requisition_id: both } = await openRequisition({
          title: 'Req on both my account and my project',
          kind: 'new',
          account_id: myAccount,
          project_id: myProject,
          session: manager,
        });

        const user = buildSession({
          tenant_id: t.tenant_id,
          user_id: userId,
          roles: ['hiring.viewer'],
          assignments: [{ role_slug: 'hiring.viewer', scope_kind: 'self', scope_id: null }],
          worker_id: workerId,
        });

        const result = await listOpenRequisitions(user);
        expect(result.requisitions.map((r) => r.id)).toEqual([both]);
      } finally {
        resetPmDb();
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
