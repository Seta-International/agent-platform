// packages/hiring/tests/integration/open-requisitions-board.test.ts
// FUT-326: BOD/PMO view every open (non-filled) requisition company-wide on a board.
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { hiringDb, resetHiringDb } from '../../src/backend/db/client.ts';
import {
  accountProjection,
  requisition,
  workerUserProjection,
} from '../../src/backend/db/schema.ts';
import { listOpenRequisitions, openRequisition } from '../../src/index.ts';
import { buildSession, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('open requisitions board (FUT-326)', () => {
  it('BOD sees all non-filled requisitions across accounts; filled is excluded', async () => {
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
        // A filled requisition must not appear on the open board.
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
        expect(ids).not.toContain(filledReq);
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

        const ids = (await listOpenRequisitions(pmo)).requisitions.map((r) => r.id);
        expect(ids).toContain(onHold);
        expect(ids).not.toContain(cancelled);
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
  it('AM sees only requisitions for accounts they manage, with a scope note', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const amUserId = crypto.randomUUID();
        const workerId = crypto.randomUUID();
        const myAccount = crypto.randomUUID();
        const otherAccount = crypto.randomUUID();

        await hiringDb()
          .insert(accountProjection)
          .values([
            {
              account_id: myAccount,
              tenant_id: t.tenant_id,
              name: 'My Account',
              am_worker_id: workerId,
            },
            {
              account_id: otherAccount,
              tenant_id: t.tenant_id,
              name: 'Other Account',
              am_worker_id: null,
            },
          ]);
        await hiringDb()
          .insert(workerUserProjection)
          .values({ worker_id: workerId, tenant_id: t.tenant_id, user_id: amUserId });

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
        });

        const result = await listOpenRequisitions(am);
        expect(result.scope).toBe('account');
        expect(result.scoped_account_names).toEqual(['My Account']);
        expect(result.requisitions.map((r) => r.id)).toEqual([mine]);
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('a hiring.viewer with no linked worker sees an empty board', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        await openRequisition({
          title: 'Someone else’s req',
          kind: 'new',
          session: t.adminSession,
        });

        const unlinked = buildSession({
          tenant_id: t.tenant_id,
          user_id: crypto.randomUUID(),
          roles: ['hiring.viewer'],
        });

        const result = await listOpenRequisitions(unlinked);
        expect(result.scope).toBe('account');
        expect(result.scoped_account_names).toEqual([]);
        expect(result.requisitions).toEqual([]);
      } finally {
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
