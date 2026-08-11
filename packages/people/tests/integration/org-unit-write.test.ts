import type { SessionScope } from '@seta/core';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq, inArray } from 'drizzle-orm';
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

function narrowSession(base: SessionScope, perms: string[]): SessionScope {
  return { ...base, permissions: new Set(perms) };
}

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
        });

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
        });
        const { org_unit_id: childId } = await createOrgUnit({
          name: 'Eng',
          kind: 'function',
          session: t.adminSession,
        });

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
        });
        const { org_unit_id: childId } = await createOrgUnit({
          name: 'Eng',
          kind: 'function',
          parent_id: parentId,
          session: t.adminSession,
        });

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

  it('rejects promptly instead of hanging when a cycle already exists upstream of the new parent', async () => {
    // F1 regression: the cycle guard's own recursive CTE used to walk ancestors with
    // UNION ALL and no depth cap. With a cycle already seeded upstream of the new parent, that
    // walk never terminated. Seed the corrupt state directly (bypassing the application guard,
    // which can never produce it) and assert the call rejects promptly instead of hanging —
    // the test-level timeout below fails fast instead of wedging the suite if it regresses.
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { org_unit_id: a } = await createOrgUnit({
          name: 'A',
          kind: 'function',
          session: t.adminSession,
        });
        const { org_unit_id: b } = await createOrgUnit({
          name: 'B',
          kind: 'function',
          parent_id: a,
          session: t.adminSession,
        });

        // Raw SQL, not the domain function: forms A -> B -> A, a corrupt state the application
        // guard would never allow through updateOrgUnit itself.
        await pool.query('UPDATE people.org_unit SET parent_id = $1 WHERE id = $2', [b, a]);

        await expect(
          updateOrgUnit({
            org_unit_id: a,
            patch: { parent_id: b },
            session: t.adminSession,
          }),
        ).rejects.toMatchObject({ code: 'CONFLICT' });
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  }, 5_000);

  it('serializes concurrent re-parents that would form a cycle — exactly one wins, no cycle results', async () => {
    // F2 regression: the ancestor-walk used to run before withEmit opened its transaction, so
    // two concurrent updateOrgUnit calls (X.parent = Y and Y.parent = X) could both observe a
    // cycle-free tree and both commit. The fix takes a per-tenant pg_advisory_xact_lock as the
    // first statement inside the transaction, serializing the two calls against each other.
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { org_unit_id: x } = await createOrgUnit({
          name: 'X',
          kind: 'function',
          session: t.adminSession,
        });
        const { org_unit_id: y } = await createOrgUnit({
          name: 'Y',
          kind: 'function',
          session: t.adminSession,
        });

        const results = await Promise.allSettled([
          updateOrgUnit({ org_unit_id: x, patch: { parent_id: y }, session: t.adminSession }),
          updateOrgUnit({ org_unit_id: y, patch: { parent_id: x }, session: t.adminSession }),
        ]);

        const fulfilled = results.filter((r) => r.status === 'fulfilled');
        const rejected = results.filter((r) => r.status === 'rejected');
        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ code: 'CONFLICT' });

        // Assert the final tree state directly: no cycle, and exactly one re-parent took effect.
        const rows = await peopleDb()
          .select({ id: orgUnit.id, parent_id: orgUnit.parent_id })
          .from(orgUnit)
          .where(inArray(orgUnit.id, [x, y]));
        const xRow = rows.find((r) => r.id === x);
        const yRow = rows.find((r) => r.id === y);
        const xToY = xRow?.parent_id === y;
        const yToX = yRow?.parent_id === x;
        expect(xToY && yToX).toBe(false); // no 2-node cycle
        expect([xToY, yToX].filter(Boolean)).toHaveLength(1); // exactly one edge landed
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
        });
        await createOrgUnit({
          name: 'Sub',
          kind: 'function',
          parent_id: parentId,
          session: t.adminSession,
        });

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
        });
        const { worker_id } = await createWorker({
          session: t.adminSession,
          full_name: 'Member One',
        });
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

  it('maps a 23503 FK violation the pre-check cannot see to the matching {deleted:false, reason}', async () => {
    // F3 regression: has_children/has_members only see *active* rows (has_members filters
    // deleted_at IS NULL), while org_unit_parent_fk / person_org_unit_id_org_unit_id_fk (both
    // NO ACTION) block on *any* referencing row. A concurrent person write assigning a member
    // isn't covered by the org-unit advisory lock, so the DELETE itself can still trip 23503 —
    // reproduced deterministically here via a soft-deleted member still pointing at the unit,
    // standing in for that race. The catch-and-map path must return the same documented shape
    // as the pre-check.
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
        });
        const { worker_id } = await createWorker({
          session: t.adminSession,
          full_name: 'Departed Member',
        });
        await peopleDb()
          .update(person)
          .set({ org_unit_id, deleted_at: new Date() })
          .where(eq(person.id, worker_id));

        const res = await deleteOrgUnit({ org_unit_id, session: t.adminSession });
        expect(res).toEqual({ deleted: false, reason: 'has_members' });

        const rows = await peopleDb().select().from(orgUnit).where(eq(orgUnit.id, org_unit_id));
        expect(rows).toHaveLength(1);
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
        });

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
        });

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
        });

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

  it('refuses updateOrgUnit/deleteOrgUnit for a session holding only people.worker.create (FUT-842 split)', async () => {
    // people.worker.create used to gate both — the split means a worker-create-only session
    // (e.g. a hypothetical future role, or anyone probing the old slug) must be turned away.
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
        });

        const workerCreateOnlySession = narrowSession(t.adminSession, ['people.worker.create']);

        await expect(
          updateOrgUnit({
            org_unit_id,
            patch: { name: 'Engineering' },
            session: workerCreateOnlySession,
          }),
        ).rejects.toMatchObject({ code: 'FORBIDDEN' });

        await expect(
          deleteOrgUnit({ org_unit_id, session: workerCreateOnlySession }),
        ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('allows updateOrgUnit/deleteOrgUnit for a session holding people.org_unit.manage', async () => {
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
        });

        const orgUnitManagerSession = narrowSession(t.adminSession, ['people.org_unit.manage']);

        await expect(
          updateOrgUnit({
            org_unit_id,
            patch: { name: 'Engineering' },
            session: orgUnitManagerSession,
          }),
        ).resolves.toMatchObject({ version: 2 });

        await expect(
          deleteOrgUnit({ org_unit_id, session: orgUnitManagerSession }),
        ).resolves.toEqual({ deleted: true });
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
