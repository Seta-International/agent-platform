// packages/hiring/tests/integration/hiring-scope.test.ts
import { resetCoreDb } from '@seta/core/testing';
import { createAccount, listRecruiterAccountIds } from '@seta/pm';
import { resetPmDb } from '@seta/pm/testing';
import { closePools, initPools, scoped } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { resetHiringDb } from '../../src/backend/db/client.ts';
import {
  addCandidate,
  getRequisition,
  listCandidates,
  listRequisitions,
  openRequisition,
} from '../../src/index.ts';
import { buildSession, type SeededTenant, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

interface Graph {
  t: SeededTenant;
  R_user: string;
  R_worker: string;
  A1: string;
  A2: string;
  Q1: string;
  Q2: string;
  Q3: string;
}

/**
 * Q1 on A1 (R's managed account), Q2 on A2 (unmanaged by R), Q3 owned by R directly
 * (no account). Mirrors the brief's fixture for the recruiter scope arms.
 */
async function buildGraph(pool: Pool): Promise<Graph> {
  const t = await seedTenant(pool);
  return scoped(t.tenant_id, async () => {
    const R_user = crypto.randomUUID();
    const R_worker = crypto.randomUUID();
    const managerSession = buildSession({
      tenant_id: t.tenant_id,
      user_id: crypto.randomUUID(),
      roles: ['hiring.manager', 'pm.manager'],
    });
    const recruiterSession = buildSession({
      tenant_id: t.tenant_id,
      user_id: R_user,
      roles: ['hiring.recruiter'],
      assignments: [{ role_slug: 'hiring.recruiter', scope_kind: 'self', scope_id: null }],
      worker_id: R_worker,
    });

    const { account_id: A1 } = await createAccount({
      name: 'A1 (R-managed)',
      recruiter_worker_ids: [R_worker],
      session: managerSession,
    });
    const { account_id: A2 } = await createAccount({
      name: 'A2 (unmanaged)',
      session: managerSession,
    });

    const { requisition_id: Q1 } = await openRequisition({
      title: 'Q1',
      kind: 'new',
      account_id: A1,
      session: managerSession,
    });
    const { requisition_id: Q2 } = await openRequisition({
      title: 'Q2',
      kind: 'new',
      account_id: A2,
      session: managerSession,
    });
    const { requisition_id: Q3 } = await openRequisition({
      title: 'Q3',
      kind: 'new',
      session: recruiterSession,
    });

    return { t, R_user, R_worker, A1, A2, Q1, Q2, Q3 };
  });
}

function recruiterSessionFor(g: Graph, worker_id: string | null): ReturnType<typeof buildSession> {
  return buildSession({
    tenant_id: g.t.tenant_id,
    user_id: g.R_user,
    roles: ['hiring.recruiter'],
    assignments: [{ role_slug: 'hiring.recruiter', scope_kind: 'self', scope_id: null }],
    worker_id,
  });
}

function managerSessionFor(g: Graph): ReturnType<typeof buildSession> {
  return buildSession({
    tenant_id: g.t.tenant_id,
    user_id: crypto.randomUUID(),
    roles: ['hiring.manager'],
    assignments: [{ role_slug: 'hiring.manager', scope_kind: 'tenant', scope_id: null }],
  });
}

describe('hiring recruiter scope', () => {
  it('recruiter sees owned + account-recruiter requisitions, not others', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const g = await buildGraph(pool);
        const recruiter = recruiterSessionFor(g, g.R_worker);

        const seen = await scoped(
          g.t.tenant_id,
          async () => new Set((await listRequisitions(recruiter)).map((r) => r.id)),
        );
        expect(seen).toEqual(new Set([g.Q1, g.Q3]));
        expect(seen.has(g.Q2)).toBe(false);
      } finally {
        resetPmDb();
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('manager (tenant scope) sees all requisitions', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const g = await buildGraph(pool);
        const manager = managerSessionFor(g);

        const seen = await scoped(
          g.t.tenant_id,
          async () => new Set((await listRequisitions(manager)).map((r) => r.id)),
        );
        expect(seen).toEqual(new Set([g.Q1, g.Q2, g.Q3]));
      } finally {
        resetPmDb();
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('getRequisition 404s an invisible requisition, 200s a visible one', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const g = await buildGraph(pool);
        const recruiter = recruiterSessionFor(g, g.R_worker);

        await scoped(g.t.tenant_id, async () => {
          await expect(
            getRequisition({ requisition_id: g.Q2, session: recruiter }),
          ).rejects.toMatchObject({ code: 'NOT_FOUND' });

          const detail = await getRequisition({ requisition_id: g.Q1, session: recruiter });
          expect(detail.requisition.id).toBe(g.Q1);
        });
      } finally {
        resetPmDb();
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('listCandidates returns only applications on visible requisitions', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const g = await buildGraph(pool);
        const manager = managerSessionFor(g);
        const recruiter = recruiterSessionFor(g, g.R_worker);

        await scoped(g.t.tenant_id, async () => {
          const { application_id: app1 } = await addCandidate({
            requisition_id: g.Q1,
            name: 'Q1 Candidate',
            session: manager,
          });
          const { application_id: app2 } = await addCandidate({
            requisition_id: g.Q2,
            name: 'Q2 Candidate',
            session: manager,
          });
          const { application_id: app3 } = await addCandidate({
            requisition_id: g.Q3,
            name: 'Q3 Candidate',
            session: manager,
          });

          const seen = new Set((await listCandidates(recruiter)).map((r) => r.application_id));
          expect(seen).toEqual(new Set([app1, app3]));
          expect(seen.has(app2)).toBe(false);
        });
      } finally {
        resetPmDb();
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('recruiter with no worker link sees only owned requisitions', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const g = await buildGraph(pool);
        const noWorker = recruiterSessionFor(g, null);

        const seen = await scoped(
          g.t.tenant_id,
          async () => new Set((await listRequisitions(noWorker)).map((r) => r.id)),
        );
        expect(seen).toEqual(new Set([g.Q3]));
      } finally {
        resetPmDb();
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('cross-tenant account-recruiter rows never leak', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const g = await buildGraph(pool);
        const t2 = await seedTenant(pool);
        const t2Manager = buildSession({
          tenant_id: t2.tenant_id,
          user_id: crypto.randomUUID(),
          roles: ['hiring.manager', 'pm.manager'],
        });
        // Tenant B: lookalike account_recruiter row reusing tenant A's recruiter worker id.
        await scoped(t2.tenant_id, () =>
          createAccount({
            name: 'B-Acct',
            recruiter_worker_ids: [g.R_worker],
            session: t2Manager,
          }),
        );

        const idsInA = await scoped(g.t.tenant_id, () =>
          listRecruiterAccountIds(g.R_worker, g.t.tenant_id),
        );
        expect(idsInA).toEqual([g.A1]);

        const recruiter = recruiterSessionFor(g, g.R_worker);
        const seen = await scoped(
          g.t.tenant_id,
          async () => new Set((await listRequisitions(recruiter)).map((r) => r.id)),
        );
        expect(seen).toEqual(new Set([g.Q1, g.Q3]));
      } finally {
        resetPmDb();
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
