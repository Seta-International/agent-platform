import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import { orgUnit, person } from '../../src/backend/db/schema.ts';
import { createOrgUnit } from '../../src/backend/domain/create-org-unit.ts';
import { createWorker } from '../../src/backend/domain/create-worker.ts';
import { deleteOrgUnit } from '../../src/backend/domain/delete-org-unit.ts';
import { getOrgStructure } from '../../src/backend/domain/org-structure.ts';
import { updateOrgUnit } from '../../src/backend/domain/update-org-unit.ts';
import { readEvents, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('org unit write path', () => {
  it('renames a unit and bumps version', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { org_unit_id } = await createOrgUnit({
          name: 'Eng',
          kind: 'function',
          session: t.adminSession,
        } as never);

        const res = await updateOrgUnit({
          org_unit_id,
          patch: { name: 'Engineering' },
          session: t.adminSession,
        });
        expect(res.version).toBe(2);

        const [row] = await peopleDb().select().from(orgUnit).where(eq(orgUnit.id, org_unit_id));
        expect(row?.name).toBe('Engineering');
        expect(row?.version).toBe(2);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('re-parents a unit', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { org_unit_id: parentId } = await createOrgUnit({
          name: 'Operation',
          kind: 'operation',
          session: t.adminSession,
        } as never);
        const { org_unit_id: childId } = await createOrgUnit({
          name: 'Eng',
          kind: 'function',
          session: t.adminSession,
        } as never);

        await updateOrgUnit({
          org_unit_id: childId,
          patch: { parent_id: parentId },
          session: t.adminSession,
        });

        const { units } = await getOrgStructure(t.adminSession);
        const child = units.find((u) => u.id === childId);
        expect(child?.parent_id).toBe(parentId);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('refuses a re-parent that would create a cycle', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { org_unit_id: parentId } = await createOrgUnit({
          name: 'Operation',
          kind: 'operation',
          session: t.adminSession,
        } as never);
        const { org_unit_id: childId } = await createOrgUnit({
          name: 'Eng',
          kind: 'function',
          parent_id: parentId,
          session: t.adminSession,
        } as never);

        // parent -> child already; making parent report to child would be a cycle.
        await expect(
          updateOrgUnit({
            org_unit_id: parentId,
            patch: { parent_id: childId },
            session: t.adminSession,
          }),
        ).rejects.toMatchObject({ code: 'CONFLICT' });

        // self-parent is a degenerate cycle too.
        await expect(
          updateOrgUnit({
            org_unit_id: parentId,
            patch: { parent_id: parentId },
            session: t.adminSession,
          }),
        ).rejects.toMatchObject({ code: 'CONFLICT' });
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('refuses to delete a unit that still has children', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { org_unit_id: parentId } = await createOrgUnit({
          name: 'Ops',
          kind: 'function',
          session: t.adminSession,
        } as never);
        await createOrgUnit({
          name: 'Sub',
          kind: 'function',
          parent_id: parentId,
          session: t.adminSession,
        } as never);

        const res = await deleteOrgUnit({ org_unit_id: parentId, session: t.adminSession });
        expect(res).toEqual({ deleted: false, reason: 'has_children' });
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('refuses to delete a unit that still has members', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { org_unit_id } = await createOrgUnit({
          name: 'Ops',
          kind: 'function',
          session: t.adminSession,
        } as never);
        const { worker_id } = await createWorker({
          session: t.adminSession,
          full_name: 'Member One',
        } as never);
        await peopleDb().update(person).set({ org_unit_id }).where(eq(person.id, worker_id));

        const res = await deleteOrgUnit({ org_unit_id, session: t.adminSession });
        expect(res).toEqual({ deleted: false, reason: 'has_members' });
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('deletes an empty unit', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { org_unit_id } = await createOrgUnit({
          name: 'Temp',
          kind: 'function',
          session: t.adminSession,
        } as never);

        expect(await deleteOrgUnit({ org_unit_id, session: t.adminSession })).toEqual({
          deleted: true,
        });

        const rows = await peopleDb().select().from(orgUnit).where(eq(orgUnit.id, org_unit_id));
        expect(rows).toHaveLength(0);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('emits people.org_unit.updated on rename', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { org_unit_id } = await createOrgUnit({
          name: 'Eng',
          kind: 'function',
          session: t.adminSession,
        } as never);

        await updateOrgUnit({
          org_unit_id,
          patch: { name: 'Engineering' },
          session: t.adminSession,
        });

        const events = await readEvents(pool, t.tenant_id, 'people.org_unit.updated');
        expect(events).toHaveLength(1);
        expect(events[0]?.aggregate_id).toBe(org_unit_id);
        expect(events[0]?.payload).toMatchObject({
          org_unit_id,
          tenant_id: t.tenant_id,
          name: 'Engineering',
          parent_id: null,
          head_worker_id: null,
        });
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('emits people.org_unit.deleted on delete', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { org_unit_id } = await createOrgUnit({
          name: 'Temp',
          kind: 'function',
          session: t.adminSession,
        } as never);

        await deleteOrgUnit({ org_unit_id, session: t.adminSession });

        const events = await readEvents(pool, t.tenant_id, 'people.org_unit.deleted');
        expect(events).toHaveLength(1);
        expect(events[0]?.aggregate_id).toBe(org_unit_id);
        expect(events[0]?.payload).toMatchObject({ org_unit_id, tenant_id: t.tenant_id });
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
