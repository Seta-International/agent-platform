import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { describe, expect, it } from 'vitest';
import { resetIdentityDb } from '../../src/backend/db/index.ts';
import * as schema from '../../src/backend/db/schema.ts';
import { orgUnitProjectionSubscribers } from '../../src/backend/subscribers/org-unit-projection.ts';
import { dispatch } from '../helpers/bus.ts';

const TENANT = '00000000-0000-0000-0000-0000000000c1';
const ORG_UNIT = '00000000-0000-0000-0000-0000000000d1';
const PARENT = '00000000-0000-0000-0000-0000000000d2';

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

  it('removes the row on people.org_unit.deleted', async () => {
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
        const rows = await db
          .select()
          .from(schema.orgUnitProjection)
          .where(eq(schema.orgUnitProjection.org_unit_id, ORG_UNIT));

        expect(rows).toHaveLength(0);

        // Replaying the delete against an already-deleted row must not error.
        await dispatch(orgUnitProjectionSubscribers, {
          eventType: 'people.org_unit.deleted',
          tenantId: TENANT,
          payload: {
            org_unit_id: ORG_UNIT,
            tenant_id: TENANT,
          },
        });

        const rowsAfterReplay = await db
          .select()
          .from(schema.orgUnitProjection)
          .where(eq(schema.orgUnitProjection.org_unit_id, ORG_UNIT));
        expect(rowsAfterReplay).toHaveLength(0);
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
