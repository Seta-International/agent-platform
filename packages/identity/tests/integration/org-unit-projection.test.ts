import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { and, eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { describe, expect, it } from 'vitest';
import { resetIdentityDb } from '../../src/backend/db/index.ts';
import * as schema from '../../src/backend/db/schema.ts';
import { expandOrgUnits } from '../../src/backend/domain/org-unit-reach.ts';
import { orgUnitProjectionSubscribers } from '../../src/backend/subscribers/org-unit-projection.ts';
import { dispatch } from '../helpers/bus.ts';

const TENANT = '00000000-0000-0000-0000-0000000000c1';
const OTHER_TENANT = '00000000-0000-0000-0000-0000000000c2';
const ORG_UNIT = '00000000-0000-0000-0000-0000000000d1';
const PARENT = '00000000-0000-0000-0000-0000000000d2';

/** A row is "live" only once it also clears the deleted_at IS NULL filter every reader applies. */
async function liveRows(db: ReturnType<typeof drizzle>, orgUnitId: string) {
  return db
    .select()
    .from(schema.orgUnitProjection)
    .where(
      and(
        eq(schema.orgUnitProjection.org_unit_id, orgUnitId),
        isNull(schema.orgUnitProjection.deleted_at),
      ),
    );
}

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('orgUnitProjectionSubscribers', () => {
  it('upserts an org_unit_projection row on org_unit.created and is idempotent', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetIdentityDb();
      initPools({ databaseUrl });
      try {
        await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)`, [
          TENANT,
          'Org Unit Projection Tenant',
          `org-unit-proj-${TENANT.slice(0, 8)}`,
        ]);

        const ev = {
          eventType: 'people.org_unit.created',
          tenantId: TENANT,
          payload: {
            org_unit_id: ORG_UNIT,
            tenant_id: TENANT,
            parent_id: PARENT,
            name: 'Engineering',
          },
        };

        await dispatch(orgUnitProjectionSubscribers, ev);
        await dispatch(orgUnitProjectionSubscribers, ev); // idempotency replay

        const db = drizzle(pool, { schema });
        const rows = await db
          .select()
          .from(schema.orgUnitProjection)
          .where(eq(schema.orgUnitProjection.org_unit_id, ORG_UNIT));

        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          org_unit_id: ORG_UNIT,
          tenant_id: TENANT,
          parent_id: PARENT,
          name: 'Engineering',
        });
      } finally {
        resetIdentityDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('applies a rename and re-parent from people.org_unit.updated', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetIdentityDb();
      initPools({ databaseUrl });
      try {
        await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)`, [
          TENANT,
          'Org Unit Projection Tenant',
          `org-unit-proj-${TENANT.slice(0, 8)}`,
        ]);

        await dispatch(orgUnitProjectionSubscribers, {
          eventType: 'people.org_unit.created',
          tenantId: TENANT,
          payload: {
            org_unit_id: ORG_UNIT,
            tenant_id: TENANT,
            parent_id: PARENT,
            name: 'Engineering',
          },
        });

        const NEW_PARENT = '00000000-0000-0000-0000-0000000000d3';
        await dispatch(orgUnitProjectionSubscribers, {
          eventType: 'people.org_unit.updated',
          tenantId: TENANT,
          payload: {
            org_unit_id: ORG_UNIT,
            tenant_id: TENANT,
            parent_id: NEW_PARENT,
            name: 'Platform Engineering',
            head_worker_id: null,
          },
        });

        const db = drizzle(pool, { schema });
        const rows = await db
          .select()
          .from(schema.orgUnitProjection)
          .where(eq(schema.orgUnitProjection.org_unit_id, ORG_UNIT));

        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          org_unit_id: ORG_UNIT,
          tenant_id: TENANT,
          parent_id: NEW_PARENT,
          name: 'Platform Engineering',
        });
      } finally {
        resetIdentityDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('converges when an update arrives before its create (per-aggregate ordering only)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetIdentityDb();
      initPools({ databaseUrl });
      try {
        await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)`, [
          TENANT,
          'Org Unit Projection Tenant',
          `org-unit-proj-${TENANT.slice(0, 8)}`,
        ]);

        // .updated arrives first (at-least-once delivery, no cross-aggregate ordering guarantee).
        // The row does not exist yet — the upsert must create it rather than no-op.
        await dispatch(orgUnitProjectionSubscribers, {
          eventType: 'people.org_unit.updated',
          tenantId: TENANT,
          payload: {
            org_unit_id: ORG_UNIT,
            tenant_id: TENANT,
            parent_id: PARENT,
            name: 'Interim Name',
            head_worker_id: null,
          },
        });

        const db = drizzle(pool, { schema });
        const afterUpdateOnly = await db
          .select()
          .from(schema.orgUnitProjection)
          .where(eq(schema.orgUnitProjection.org_unit_id, ORG_UNIT));
        expect(afterUpdateOnly).toHaveLength(1);
        expect(afterUpdateOnly[0]).toMatchObject({
          org_unit_id: ORG_UNIT,
          tenant_id: TENANT,
          parent_id: PARENT,
          name: 'Interim Name',
        });

        // .created arrives second (its own delivery arrived late) — the row must survive,
        // converging on whichever payload was applied most recently rather than being dropped.
        await dispatch(orgUnitProjectionSubscribers, {
          eventType: 'people.org_unit.created',
          tenantId: TENANT,
          payload: {
            org_unit_id: ORG_UNIT,
            tenant_id: TENANT,
            parent_id: PARENT,
            name: 'Engineering',
          },
        });

        const rows = await db
          .select()
          .from(schema.orgUnitProjection)
          .where(eq(schema.orgUnitProjection.org_unit_id, ORG_UNIT));

        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          org_unit_id: ORG_UNIT,
          tenant_id: TENANT,
          parent_id: PARENT,
          name: 'Engineering',
        });
      } finally {
        resetIdentityDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('tombstones (not hard-deletes) the row on people.org_unit.deleted', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetIdentityDb();
      initPools({ databaseUrl });
      try {
        await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)`, [
          TENANT,
          'Org Unit Projection Tenant',
          `org-unit-proj-${TENANT.slice(0, 8)}`,
        ]);

        await dispatch(orgUnitProjectionSubscribers, {
          eventType: 'people.org_unit.created',
          tenantId: TENANT,
          payload: {
            org_unit_id: ORG_UNIT,
            tenant_id: TENANT,
            parent_id: PARENT,
            name: 'Engineering',
          },
        });

        await dispatch(orgUnitProjectionSubscribers, {
          eventType: 'people.org_unit.deleted',
          tenantId: TENANT,
          payload: {
            org_unit_id: ORG_UNIT,
            tenant_id: TENANT,
          },
        });

        const db = drizzle(pool, { schema });

        // Not a hard delete: the row still physically exists, tombstoned.
        const allRows = await db
          .select()
          .from(schema.orgUnitProjection)
          .where(eq(schema.orgUnitProjection.org_unit_id, ORG_UNIT));
        expect(allRows).toHaveLength(1);
        expect(allRows[0]?.deleted_at).not.toBeNull();

        // But it is no longer live — every reader filters deleted_at IS NULL.
        expect(await liveRows(db, ORG_UNIT)).toHaveLength(0);

        // Replaying the delete against an already-tombstoned row must not error.
        await dispatch(orgUnitProjectionSubscribers, {
          eventType: 'people.org_unit.deleted',
          tenantId: TENANT,
          payload: {
            org_unit_id: ORG_UNIT,
            tenant_id: TENANT,
          },
        });

        expect(await liveRows(db, ORG_UNIT)).toHaveLength(0);
      } finally {
        resetIdentityDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('regression FUT-842: a delete that drains before its own create must not be resurrected', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetIdentityDb();
      initPools({ databaseUrl });
      try {
        await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)`, [
          TENANT,
          'Org Unit Projection Tenant',
          `org-unit-proj-${TENANT.slice(0, 8)}`,
        ]);

        // Simulates the drain.ts failure scenario: upsert-on-created is halted on its own
        // per-subscription backoff cursor while delete-on-deleted drains independently and
        // arrives first, for a row that does not exist yet.
        await dispatch(orgUnitProjectionSubscribers, {
          eventType: 'people.org_unit.deleted',
          tenantId: TENANT,
          payload: {
            org_unit_id: ORG_UNIT,
            tenant_id: TENANT,
          },
        });

        const db = drizzle(pool, { schema });
        // The tombstone insert itself must succeed even with no prior row.
        const afterDeleteOnly = await db
          .select()
          .from(schema.orgUnitProjection)
          .where(eq(schema.orgUnitProjection.org_unit_id, ORG_UNIT));
        expect(afterDeleteOnly).toHaveLength(1);
        expect(afterDeleteOnly[0]?.deleted_at).not.toBeNull();

        // The backed-off create finally drains, late.
        await dispatch(orgUnitProjectionSubscribers, {
          eventType: 'people.org_unit.created',
          tenantId: TENANT,
          payload: {
            org_unit_id: ORG_UNIT,
            tenant_id: TENANT,
            parent_id: PARENT,
            name: 'Engineering',
          },
        });

        // Must NOT be resurrected: the tombstone wins, the row stays invisible to every reader.
        expect(await liveRows(db, ORG_UNIT)).toHaveLength(0);
        expect(await expandOrgUnits(TENANT, [ORG_UNIT])).toEqual({ [ORG_UNIT]: [ORG_UNIT] });
      } finally {
        resetIdentityDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('a normal create -> update -> delete sequence still ends with the unit not visible', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetIdentityDb();
      initPools({ databaseUrl });
      try {
        await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)`, [
          TENANT,
          'Org Unit Projection Tenant',
          `org-unit-proj-${TENANT.slice(0, 8)}`,
        ]);

        await dispatch(orgUnitProjectionSubscribers, {
          eventType: 'people.org_unit.created',
          tenantId: TENANT,
          payload: {
            org_unit_id: ORG_UNIT,
            tenant_id: TENANT,
            parent_id: PARENT,
            name: 'Engineering',
          },
        });

        await dispatch(orgUnitProjectionSubscribers, {
          eventType: 'people.org_unit.updated',
          tenantId: TENANT,
          payload: {
            org_unit_id: ORG_UNIT,
            tenant_id: TENANT,
            parent_id: PARENT,
            name: 'Platform Engineering',
            head_worker_id: null,
          },
        });

        await dispatch(orgUnitProjectionSubscribers, {
          eventType: 'people.org_unit.deleted',
          tenantId: TENANT,
          payload: {
            org_unit_id: ORG_UNIT,
            tenant_id: TENANT,
          },
        });

        const db = drizzle(pool, { schema });
        expect(await liveRows(db, ORG_UNIT)).toHaveLength(0);
        expect(await expandOrgUnits(TENANT, [ORG_UNIT])).toEqual({ [ORG_UNIT]: [ORG_UNIT] });
      } finally {
        resetIdentityDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('excludes a tombstoned unit from expandOrgUnits (proves the read-path filter, not just storage)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetIdentityDb();
      initPools({ databaseUrl });
      try {
        await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)`, [
          TENANT,
          'Org Unit Projection Tenant',
          `org-unit-proj-${TENANT.slice(0, 8)}`,
        ]);

        const CHILD = '00000000-0000-0000-0000-0000000000d4';

        await dispatch(orgUnitProjectionSubscribers, {
          eventType: 'people.org_unit.created',
          tenantId: TENANT,
          payload: {
            org_unit_id: PARENT,
            tenant_id: TENANT,
            parent_id: null,
            name: 'Root',
          },
        });
        await dispatch(orgUnitProjectionSubscribers, {
          eventType: 'people.org_unit.created',
          tenantId: TENANT,
          payload: {
            org_unit_id: ORG_UNIT,
            tenant_id: TENANT,
            parent_id: PARENT,
            name: 'Engineering',
          },
        });
        await dispatch(orgUnitProjectionSubscribers, {
          eventType: 'people.org_unit.created',
          tenantId: TENANT,
          payload: {
            org_unit_id: CHILD,
            tenant_id: TENANT,
            parent_id: ORG_UNIT,
            name: 'Platform Team',
          },
        });

        // Before the tombstone: the whole subtree is reachable from PARENT.
        expect(await expandOrgUnits(TENANT, [PARENT])).toEqual({
          [PARENT]: expect.arrayContaining([PARENT, ORG_UNIT, CHILD]),
        });

        await dispatch(orgUnitProjectionSubscribers, {
          eventType: 'people.org_unit.deleted',
          tenantId: TENANT,
          payload: {
            org_unit_id: ORG_UNIT,
            tenant_id: TENANT,
          },
        });

        // After tombstoning ORG_UNIT, expandOrgUnits must not treat it (or reach through it) as
        // live — CHILD hangs off a tombstoned parent, so the tree walk stops there too.
        const expanded = await expandOrgUnits(TENANT, [PARENT]);
        expect(expanded[PARENT]).not.toContain(ORG_UNIT);
        expect(expanded[PARENT]).not.toContain(CHILD);
        expect(expanded[PARENT]).toContain(PARENT);
      } finally {
        resetIdentityDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('tenant guard: an upsert carrying a mismatched tenant_id must not modify the existing row', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetIdentityDb();
      initPools({ databaseUrl });
      try {
        await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)`, [
          TENANT,
          'Org Unit Projection Tenant',
          `org-unit-proj-${TENANT.slice(0, 8)}`,
        ]);
        await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)`, [
          OTHER_TENANT,
          'Org Unit Projection Other Tenant',
          `org-unit-proj-other-${OTHER_TENANT.slice(-8)}`,
        ]);

        await dispatch(orgUnitProjectionSubscribers, {
          eventType: 'people.org_unit.created',
          tenantId: TENANT,
          payload: {
            org_unit_id: ORG_UNIT,
            tenant_id: TENANT,
            parent_id: PARENT,
            name: 'Engineering',
          },
        });

        // A payload for the same org_unit_id but a different tenant_id — must not clobber the
        // row belonging to TENANT.
        await dispatch(orgUnitProjectionSubscribers, {
          eventType: 'people.org_unit.updated',
          tenantId: OTHER_TENANT,
          payload: {
            org_unit_id: ORG_UNIT,
            tenant_id: OTHER_TENANT,
            parent_id: null,
            name: 'Hijacked',
            head_worker_id: null,
          },
        });

        const db = drizzle(pool, { schema });
        const rows = await db
          .select()
          .from(schema.orgUnitProjection)
          .where(eq(schema.orgUnitProjection.org_unit_id, ORG_UNIT));

        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          org_unit_id: ORG_UNIT,
          tenant_id: TENANT,
          parent_id: PARENT,
          name: 'Engineering',
        });
      } finally {
        resetIdentityDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('is idempotent — replaying the same update event changes nothing observable but the timestamp', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetIdentityDb();
      initPools({ databaseUrl });
      try {
        await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)`, [
          TENANT,
          'Org Unit Projection Tenant',
          `org-unit-proj-${TENANT.slice(0, 8)}`,
        ]);

        await dispatch(orgUnitProjectionSubscribers, {
          eventType: 'people.org_unit.created',
          tenantId: TENANT,
          payload: {
            org_unit_id: ORG_UNIT,
            tenant_id: TENANT,
            parent_id: PARENT,
            name: 'Engineering',
          },
        });

        const updateEvent = {
          eventType: 'people.org_unit.updated',
          tenantId: TENANT,
          payload: {
            org_unit_id: ORG_UNIT,
            tenant_id: TENANT,
            parent_id: PARENT,
            name: 'Platform Engineering',
            head_worker_id: null,
          },
        };

        await dispatch(orgUnitProjectionSubscribers, updateEvent);
        await dispatch(orgUnitProjectionSubscribers, updateEvent); // replay

        const db = drizzle(pool, { schema });
        const rows = await db
          .select()
          .from(schema.orgUnitProjection)
          .where(eq(schema.orgUnitProjection.org_unit_id, ORG_UNIT));

        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          org_unit_id: ORG_UNIT,
          tenant_id: TENANT,
          parent_id: PARENT,
          name: 'Platform Engineering',
        });
      } finally {
        resetIdentityDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
