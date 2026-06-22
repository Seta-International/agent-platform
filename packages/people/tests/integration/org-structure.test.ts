import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import { worker } from '../../src/backend/db/schema.ts';
import { createWorker } from '../../src/backend/domain/create-worker.ts';
import { getOrgStructure } from '../../src/backend/domain/org-structure.ts';
import { seedOrgUnit, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('getOrgStructure', () => {
  it('returns the unit tree with heads and members for a strategic viewer', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { worker_id: ceo } = await createWorker({
          session: t.adminSession,
          full_name: 'CEO',
        } as never);
        const exec = await seedOrgUnit({
          tenant_id: t.tenant_id,
          name: 'Executive',
          kind: 'executive',
          head_worker_id: ceo,
        });
        await peopleDb().update(worker).set({ org_unit_id: exec }).where(eq(worker.person_id, ceo));
        const ops = await seedOrgUnit({
          tenant_id: t.tenant_id,
          name: 'Operation',
          kind: 'operation',
          parent_id: exec,
        });
        const { worker_id: m } = await createWorker({
          session: t.adminSession,
          full_name: 'Ops Member',
          org_unit_id: ops,
        } as never);

        const { units } = await getOrgStructure(t.adminSession);
        const opsNode = units.find((u) => u.id === ops)!;
        expect(units.find((u) => u.id === exec)!.head?.full_name).toBe('CEO');
        expect(opsNode.parent_id).toBe(exec);
        expect(opsNode.members.map((x) => x.person_id)).toContain(m);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
