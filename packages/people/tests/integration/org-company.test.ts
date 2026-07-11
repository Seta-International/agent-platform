import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import { accountProjection, person, projectProjection } from '../../src/backend/db/schema.ts';
import { createWorker } from '../../src/backend/domain/create-worker.ts';
import { getOrgCompany } from '../../src/backend/domain/org-structure.ts';
import { seedOrgUnit, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('getOrgCompany', () => {
  it('assembles the spine from org_unit.parent_id and grafts Delivery → AM → account', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);

        const exec = await seedOrgUnit({
          tenant_id: t.tenant_id,
          name: 'Executive',
          kind: 'executive',
        });
        const ops = await seedOrgUnit({
          tenant_id: t.tenant_id,
          name: 'Operation',
          kind: 'operation',
          parent_id: exec,
        });
        const backOffice = await seedOrgUnit({
          tenant_id: t.tenant_id,
          name: 'Back Office',
          kind: 'function',
          parent_id: ops,
        });
        const delivery = await seedOrgUnit({
          tenant_id: t.tenant_id,
          name: 'Delivery',
          kind: 'delivery',
          parent_id: exec,
        });
        await seedOrgUnit({ tenant_id: t.tenant_id, name: 'PMO', kind: 'pmo', parent_id: exec });

        const { worker_id: boMember } = await createWorker({
          session: t.adminSession,
          full_name: 'BO One',
          org_unit_id: backOffice,
        } as never);
        expect(boMember).toBeTruthy();
        const { worker_id: am } = await createWorker({
          session: t.adminSession,
          full_name: 'AM One',
        } as never);

        const accountA = crypto.randomUUID();
        const projectId = crypto.randomUUID();
        await peopleDb().insert(accountProjection).values({
          account_id: accountA,
          tenant_id: t.tenant_id,
          name: 'Account A',
          am_worker_id: am,
        });
        await peopleDb().insert(projectProjection).values({
          project_id: projectId,
          tenant_id: t.tenant_id,
          account_id: accountA,
          name: 'Project P',
        });

        const { nodes } = await getOrgCompany(t.adminSession);

        // spine from stored parent_id
        const execNode = nodes.find((n) => n.id === `unit:${exec}`)!;
        expect(execNode.parent_id).toBeNull();
        expect(execNode.kind).toBe('executive');
        expect(nodes.find((n) => n.id === `unit:${ops}`)!.parent_id).toBe(`unit:${exec}`);
        expect(nodes.find((n) => n.id === `unit:${delivery}`)!.parent_id).toBe(`unit:${exec}`);
        expect(nodes.find((n) => n.id === `unit:${backOffice}`)!.count).toBe(1);

        // delivery subtree: AM under Delivery unit, account under AM
        const amNode = nodes.find((n) => n.id === `am:${am}`)!;
        expect(amNode.kind).toBe('am');
        expect(amNode.parent_id).toBe(`unit:${delivery}`);
        expect(amNode.person_id).toBe(am);
        const acctNode = nodes.find((n) => n.id === `account:${accountA}`)!;
        expect(acctNode.kind).toBe('account');
        expect(acctNode.parent_id).toBe(`am:${am}`);
        expect(acctNode.account_id).toBe(accountA);
        expect(acctNode.count).toBe(1); // one project

        // no member/person leaves on the company tree
        expect(nodes.some((n) => n.id.startsWith('person:'))).toBe(false);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('hangs an account with no AM directly under the Delivery unit', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const exec = await seedOrgUnit({
          tenant_id: t.tenant_id,
          name: 'Executive',
          kind: 'executive',
        });
        const delivery = await seedOrgUnit({
          tenant_id: t.tenant_id,
          name: 'Delivery',
          kind: 'delivery',
          parent_id: exec,
        });
        // a worker allocated to the account so a manager viewer sees it
        const { worker_id: m } = await createWorker({
          session: t.adminSession,
          full_name: 'Solo',
        } as never);
        const accountA = crypto.randomUUID();
        const projectId = crypto.randomUUID();
        await peopleDb().insert(accountProjection).values({
          account_id: accountA,
          tenant_id: t.tenant_id,
          name: 'No AM Co',
          am_worker_id: null,
        });
        await peopleDb().insert(projectProjection).values({
          project_id: projectId,
          tenant_id: t.tenant_id,
          account_id: accountA,
          name: 'P1',
        });
        await peopleDb().update(person).set({ org_unit_id: delivery }).where(eq(person.id, m));

        const { nodes } = await getOrgCompany(t.adminSession);
        const acctNode = nodes.find((n) => n.id === `account:${accountA}`)!;
        expect(acctNode.parent_id).toBe(`unit:${delivery}`);
        expect(nodes.some((n) => n.kind === 'am')).toBe(false);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
