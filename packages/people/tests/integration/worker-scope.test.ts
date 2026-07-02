import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { and, eq } from 'drizzle-orm';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import {
  accountProjection,
  person,
  worker,
  workerAllocationProjection,
} from '../../src/backend/db/schema.ts';
import { tenantScoped } from '../../src/backend/db/scope.ts';
import { createWorker } from '../../src/backend/domain/create-worker.ts';
import { buildWorkerScope } from '../../src/backend/domain/worker-scope.ts';
import { buildSession, type SeededTenant, seedOrgUnit, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

/** Create a worker via the public path, then bind its person.user_id to a known session user_id. */
async function makePersona(
  t: SeededTenant,
  name: string,
  userId: string,
  orgUnitId: string | null,
): Promise<string> {
  const { worker_id } = await createWorker({
    session: t.adminSession,
    full_name: name,
    org_unit_id: orgUnitId,
  } as never);
  await peopleDb().update(person).set({ user_id: userId }).where(eq(person.id, worker_id));
  return worker_id;
}

/** Resolve the set of person_ids visible to a persona session under the scope predicate. */
async function visible(session: ReturnType<typeof buildSession>): Promise<Set<string>> {
  const predicate = buildWorkerScope(session);
  const where = predicate
    ? and(tenantScoped(worker.tenant_id, session), predicate)
    : tenantScoped(worker.tenant_id, session);
  const rows = await peopleDb().select({ id: worker.person_id }).from(worker).where(where);
  return new Set(rows.map((r) => r.id));
}

interface Graph {
  t: SeededTenant;
  M: string;
  R1: string;
  R2: string;
  AM: string;
  W_am: string;
  L: string;
  W_lead: string;
  U: string;
  accountA: string;
  projectAcct: string;
  projectP: string;
}

/**
 * Build the deliberate visibility graph in one tenant:
 *  - M manages R1; R1 manages R2 (R2 transitive under M).
 *  - AM is account manager of account A; W_am allocated to a project under A.
 *  - L leads project P; W_lead allocated to P.
 *  - U unrelated.
 */
async function buildGraph(pool: Pool): Promise<Graph> {
  const t = await seedTenant(pool);
  const userM = crypto.randomUUID();
  const userAM = crypto.randomUUID();
  const userL = crypto.randomUUID();
  const userU = crypto.randomUUID();

  // Unit chain: U1(head M) ⊃ U2(head R1) ⊃ U3(head R2)
  const M = await makePersona(t, 'Manager M', userM, null);
  const u1 = await seedOrgUnit({
    tenant_id: t.tenant_id,
    name: 'U1',
    kind: 'operation',
    head_worker_id: M,
  });
  await peopleDb().update(worker).set({ org_unit_id: u1 }).where(eq(worker.person_id, M));

  const R1 = await makePersona(t, 'Report R1', crypto.randomUUID(), null);
  const u2 = await seedOrgUnit({
    tenant_id: t.tenant_id,
    name: 'U2',
    kind: 'function',
    parent_id: u1,
    head_worker_id: R1,
  });
  await peopleDb().update(worker).set({ org_unit_id: u2 }).where(eq(worker.person_id, R1));

  const R2 = await makePersona(t, 'Report R2', crypto.randomUUID(), u2);
  const AM = await makePersona(t, 'Account Mgr AM', userAM, null);
  const W_am = await makePersona(t, 'Worker on Account', crypto.randomUUID(), null);
  const L = await makePersona(t, 'Lead L', userL, null);
  const W_lead = await makePersona(t, 'Worker on Lead Project', crypto.randomUUID(), null);
  const U = await makePersona(t, 'Unrelated U', userU, null);

  const accountA = crypto.randomUUID();
  const projectAcct = crypto.randomUUID();
  const projectP = crypto.randomUUID();

  await peopleDb().insert(accountProjection).values({
    account_id: accountA,
    tenant_id: t.tenant_id,
    name: 'Account A',
    am_worker_id: AM,
  });

  // W_am allocated to a project under account A (active)
  await peopleDb().insert(workerAllocationProjection).values({
    allocation_id: crypto.randomUUID(),
    tenant_id: t.tenant_id,
    worker_id: W_am,
    project_id: projectAcct,
    account_id: accountA,
    account_name: 'Account A',
    lead_worker_id: null,
    active: true,
  });

  // W_lead allocated to project P led by L (active)
  await peopleDb().insert(workerAllocationProjection).values({
    allocation_id: crypto.randomUUID(),
    tenant_id: t.tenant_id,
    worker_id: W_lead,
    project_id: projectP,
    account_id: crypto.randomUUID(),
    account_name: 'Other Account',
    lead_worker_id: L,
    active: true,
  });

  return { t, M, R1, R2, AM, W_am, L, W_lead, U, accountA, projectAcct, projectP };
}

function viewer(t: SeededTenant, userId: string): ReturnType<typeof buildSession> {
  return buildSession({ tenant_id: t.tenant_id, user_id: userId, roles: ['people.viewer'] });
}

describe('buildWorkerScope', () => {
  it('manager sees self + direct + transitive reports only', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const g = await buildGraph(pool);
        const userM = (
          await peopleDb().select({ u: person.user_id }).from(person).where(eq(person.id, g.M))
        )[0]!.u!;
        const seen = await visible(viewer(g.t, userM));
        expect(seen).toEqual(new Set([g.M, g.R1, g.R2]));
        expect(seen.has(g.U)).toBe(false);
        expect(seen.has(g.W_am)).toBe(false);
        expect(seen.has(g.W_lead)).toBe(false);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('account manager sees self + workers allocated under their account only', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const g = await buildGraph(pool);
        const userAM = (
          await peopleDb().select({ u: person.user_id }).from(person).where(eq(person.id, g.AM))
        )[0]!.u!;
        const seen = await visible(viewer(g.t, userAM));
        expect(seen).toEqual(new Set([g.AM, g.W_am]));
        expect(seen.has(g.U)).toBe(false);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('project lead sees self + workers allocated to their project only', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const g = await buildGraph(pool);
        const userL = (
          await peopleDb().select({ u: person.user_id }).from(person).where(eq(person.id, g.L))
        )[0]!.u!;
        const seen = await visible(viewer(g.t, userL));
        expect(seen).toEqual(new Set([g.L, g.W_lead]));
        expect(seen.has(g.U)).toBe(false);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('unrelated worker sees only self', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const g = await buildGraph(pool);
        const userU = (
          await peopleDb().select({ u: person.user_id }).from(person).where(eq(person.id, g.U))
        )[0]!.u!;
        const seen = await visible(viewer(g.t, userU));
        expect(seen).toEqual(new Set([g.U]));
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('read.all session returns null predicate and sees everyone in tenant', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const g = await buildGraph(pool);
        const adminUser = g.t.admin_user_id;
        const session = buildSession({
          tenant_id: g.t.tenant_id,
          user_id: adminUser,
          roles: ['people.manager'],
        });
        expect(buildWorkerScope(session)).toBeNull();
        const seen = await visible(session);
        expect(seen).toEqual(new Set([g.M, g.R1, g.R2, g.AM, g.W_am, g.L, g.W_lead, g.U]));
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('cross-tenant chained/allocated rows are excluded', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const tA = await seedTenant(pool);
        const tB = await seedTenant(pool);

        // Tenant A: manager M_A heads unit U_A; R_A is a member (reports to M_A).
        const userMA = crypto.randomUUID();
        const M_A = await makePersona(tA, 'Manager M_A', userMA, null);
        const uA = await seedOrgUnit({
          tenant_id: tA.tenant_id,
          name: 'U_A',
          kind: 'operation',
          head_worker_id: M_A,
        });
        await peopleDb().update(worker).set({ org_unit_id: uA }).where(eq(worker.person_id, M_A));
        const R_A = await makePersona(tA, 'Report R_A', crypto.randomUUID(), uA);

        // Tenant B: unit U_B headed by M_A's person_id with member X_B (cross-tenant chaining vector).
        const X_B = await makePersona(tB, 'Cross Worker X_B', crypto.randomUUID(), null);
        const uB = await seedOrgUnit({
          tenant_id: tB.tenant_id,
          name: 'U_B',
          kind: 'operation',
          head_worker_id: M_A,
        });
        await peopleDb().update(worker).set({ org_unit_id: uB }).where(eq(worker.person_id, X_B));

        // Tenant B: an allocation referencing M_A as both AM and lead, plus a B-tenant account
        // managed by M_A — exercises tenant scoping of the AM/lead subqueries.
        const accountB = crypto.randomUUID();
        await peopleDb().insert(accountProjection).values({
          account_id: accountB,
          tenant_id: tB.tenant_id,
          name: 'Account B',
          am_worker_id: M_A,
        });
        await peopleDb().insert(workerAllocationProjection).values({
          allocation_id: crypto.randomUUID(),
          tenant_id: tB.tenant_id,
          worker_id: X_B,
          project_id: crypto.randomUUID(),
          account_id: accountB,
          account_name: 'Account B',
          lead_worker_id: M_A,
          active: true,
        });

        const seen = await visible(viewer(tA, userMA));
        expect(seen).toEqual(new Set([M_A, R_A]));
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('inactive allocation grants no AM or lead visibility', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const userAM = crypto.randomUUID();
        const userL = crypto.randomUUID();
        const AM = await makePersona(t, 'AM2', userAM, null);
        const L = await makePersona(t, 'L2', userL, null);
        const W = await makePersona(t, 'Inactive Worker', crypto.randomUUID(), null);

        const accountA = crypto.randomUUID();
        await peopleDb().insert(accountProjection).values({
          account_id: accountA,
          tenant_id: t.tenant_id,
          name: 'Acct',
          am_worker_id: AM,
        });
        // inactive allocation under AM's account AND led by L
        await peopleDb().insert(workerAllocationProjection).values({
          allocation_id: crypto.randomUUID(),
          tenant_id: t.tenant_id,
          worker_id: W,
          project_id: crypto.randomUUID(),
          account_id: accountA,
          account_name: 'Acct',
          lead_worker_id: L,
          active: false,
        });

        const amSeen = await visible(viewer(t, userAM));
        expect(amSeen).toEqual(new Set([AM]));
        expect(amSeen.has(W)).toBe(false);

        const lSeen = await visible(viewer(t, userL));
        expect(lSeen).toEqual(new Set([L]));
        expect(lSeen.has(W)).toBe(false);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
