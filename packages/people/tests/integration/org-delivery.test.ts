import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import {
  accountProjection,
  projectProjection,
  workerAllocationProjection,
} from '../../src/backend/db/schema.ts';
import { createWorker } from '../../src/backend/domain/create-worker.ts';
import { getOrgDelivery } from '../../src/backend/domain/org-structure.ts';
import { buildSession, linkUserToPerson, type SeededTenant, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

async function personaUserId(tenantId: string, personId: string): Promise<string> {
  const userId = crypto.randomUUID();
  await linkUserToPerson(tenantId, personId, userId);
  return userId;
}

function viewer(t: SeededTenant, userId: string) {
  return buildSession({ tenant_id: t.tenant_id, user_id: userId, roles: ['people.viewer'] });
}

interface DeliveryGraph {
  t: SeededTenant;
  accountA: string;
  projectId: string;
  am: string;
  amUser: string;
  lead: string;
  member: string;
}

async function buildDelivery(pool: import('pg').Pool): Promise<DeliveryGraph> {
  const t = await seedTenant(pool);
  const { worker_id: am } = await createWorker({
    session: t.adminSession,
    full_name: 'AM Name',
  } as never);
  const { worker_id: lead } = await createWorker({
    session: t.adminSession,
    full_name: 'Lead Name',
  } as never);
  const { worker_id: member } = await createWorker({
    session: t.adminSession,
    full_name: 'Member Name',
  } as never);
  const amUser = await personaUserId(t.tenant_id, am);

  const accountA = crypto.randomUUID();
  const projectId = crypto.randomUUID();
  await peopleDb()
    .insert(accountProjection)
    .values({ account_id: accountA, tenant_id: t.tenant_id, name: 'Account A', am_worker_id: am });
  await peopleDb().insert(projectProjection).values({
    project_id: projectId,
    tenant_id: t.tenant_id,
    account_id: accountA,
    name: 'Project P',
  });
  await peopleDb().insert(workerAllocationProjection).values({
    allocation_id: crypto.randomUUID(),
    tenant_id: t.tenant_id,
    worker_id: lead,
    project_id: projectId,
    account_id: accountA,
    account_name: 'Account A',
    lead_worker_id: lead,
    active: true,
  });
  await peopleDb().insert(workerAllocationProjection).values({
    allocation_id: crypto.randomUUID(),
    tenant_id: t.tenant_id,
    worker_id: member,
    project_id: projectId,
    account_id: accountA,
    account_name: 'Account A',
    lead_worker_id: lead,
    active: true,
  });

  return { t, accountA, projectId, am, amUser, lead, member };
}

describe('getOrgDelivery', () => {
  it('assembles account → project → members with AM and lead for a manager viewer', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const g = await buildDelivery(pool);
        const { accounts } = await getOrgDelivery(g.t.adminSession);
        const acct = accounts.find((a) => a.account_id === g.accountA)!;
        expect(acct.am?.full_name).toBe('AM Name');
        const proj = acct.projects.find((p) => p.project_id === g.projectId)!;
        expect(proj.members.some((m) => m.is_lead)).toBe(true);
        expect(proj.members.map((m) => m.person_id).sort()).toEqual([g.lead, g.member].sort());
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('FUT-542: an unrelated viewer still sees all delivery accounts', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const g = await buildDelivery(pool);
        const { worker_id: stranger } = await createWorker({
          session: g.t.adminSession,
          full_name: 'Stranger',
        } as never);
        const strangerUser = await personaUserId(g.t.tenant_id, stranger);

        const { accounts } = await getOrgDelivery(viewer(g.t, strangerUser));
        expect(accounts.find((a) => a.account_id === g.accountA)).toBeDefined();
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('an AM viewer sees their own account', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const g = await buildDelivery(pool);
        const { accounts } = await getOrgDelivery(viewer(g.t, g.amUser));
        const acct = accounts.find((a) => a.account_id === g.accountA);
        expect(acct).toBeDefined();
        expect(acct!.am?.full_name).toBe('AM Name');
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
