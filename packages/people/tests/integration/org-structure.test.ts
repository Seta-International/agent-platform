import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import { worker } from '../../src/backend/db/schema.ts';
import { createOrgUnit } from '../../src/backend/domain/create-org-unit.ts';
import { createWorker } from '../../src/backend/domain/create-worker.ts';
import { getOrgStructure } from '../../src/backend/domain/org-structure.ts';
import { inScope, seedOrgUnit, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('getOrgStructure', () => {
  it('returns the unit tree with heads for a manager viewer', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        await inScope(t.adminSession, async () => {
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
          await peopleDb()
            .update(worker)
            .set({ org_unit_id: exec })
            .where(eq(worker.person_id, ceo));
          const ops = await seedOrgUnit({
            tenant_id: t.tenant_id,
            name: 'Operation',
            kind: 'operation',
            parent_id: exec,
          });
          await createWorker({
            session: t.adminSession,
            full_name: 'Ops Member',
            org_unit_id: ops,
          } as never);

          const { units } = await getOrgStructure(t.adminSession);
          const execNode = units.find((u) => u.id === exec)!;
          const opsNode = units.find((u) => u.id === ops)!;
          expect(execNode.head?.full_name).toBe('CEO');
          expect(execNode.members.map((m) => m.full_name)).toContain('CEO');
          expect(opsNode.parent_id).toBe(exec);
          expect(opsNode.members.map((m) => m.full_name)).toContain('Ops Member');
        });
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('createOrgUnit persists a unit with kind/parent/head via the public surface', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        await inScope(t.adminSession, async () => {
          const { worker_id: head } = await createWorker({
            session: t.adminSession,
            full_name: 'Head',
          } as never);
          const { org_unit_id: root } = await createOrgUnit({
            session: t.adminSession,
            name: 'Executive',
            kind: 'executive',
            head_worker_id: head,
          });
          const { org_unit_id: child } = await createOrgUnit({
            session: t.adminSession,
            name: 'PMO',
            kind: 'pmo',
            parent_id: root,
          });

          const { units } = await getOrgStructure(t.adminSession);
          expect(units.find((u) => u.id === root)!.kind).toBe('executive');
          expect(units.find((u) => u.id === child)!.parent_id).toBe(root);
        });
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
