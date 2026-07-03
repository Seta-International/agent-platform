import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { describe, expect, it } from 'vitest';
import { resetIdentityDb } from '../../src/backend/db/index.ts';
import * as schema from '../../src/backend/db/schema.ts';
import { directoryProjectionSubscribers } from '../../src/backend/subscribers/directory-projection.ts';
import { dispatch } from '../helpers/bus.ts';

const TENANT = '00000000-0000-0000-0000-0000000000a1';
const PERSON = '00000000-0000-0000-0000-0000000000b1';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('directoryProjectionSubscribers', () => {
  it('upserts a person_projection row on worker.created and is idempotent', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetIdentityDb();
      initPools({ databaseUrl });
      try {
        await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)`, [
          TENANT,
          'Dir Projection Tenant',
          `dir-proj-${TENANT.slice(0, 8)}`,
        ]);

        const ev = {
          eventType: 'people.worker.created',
          tenantId: TENANT,
          payload: {
            worker_id: PERSON,
            person_id: PERSON,
            tenant_id: TENANT,
            full_name: 'Mai Tran',
            work_email: 'mai@acme.test',
            job_title: 'Engineer',
          },
        };

        await dispatch(directoryProjectionSubscribers, ev);
        await dispatch(directoryProjectionSubscribers, ev); // idempotency replay

        const db = drizzle(pool, { schema });
        const rows = await db
          .select()
          .from(schema.personProjection)
          .where(eq(schema.personProjection.person_id, PERSON));

        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          full_name: 'Mai Tran',
          work_email: 'mai@acme.test',
          job_title: 'Engineer',
          employment_status: 'active',
        });
      } finally {
        resetIdentityDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('upserts display fields on worker.updated', async () => {
    const PERSON2 = '00000000-0000-0000-0000-0000000000b2';
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetIdentityDb();
      initPools({ databaseUrl });
      try {
        await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)`, [
          TENANT,
          'Dir Projection Tenant',
          `dir-proj2-${TENANT.slice(0, 8)}`,
        ]);

        await dispatch(directoryProjectionSubscribers, {
          eventType: 'people.worker.created',
          tenantId: TENANT,
          payload: {
            worker_id: PERSON2,
            person_id: PERSON2,
            tenant_id: TENANT,
            full_name: 'Old Name',
            work_email: null,
            job_title: null,
          },
        });

        await dispatch(directoryProjectionSubscribers, {
          eventType: 'people.worker.updated',
          tenantId: TENANT,
          payload: {
            worker_id: PERSON2,
            person_id: PERSON2,
            tenant_id: TENANT,
            fields: ['full_name', 'job_title'],
            full_name: 'New Name',
            work_email: null,
            job_title: 'Senior Engineer',
          },
        });

        const db = drizzle(pool, { schema });
        const [row] = await db
          .select()
          .from(schema.personProjection)
          .where(eq(schema.personProjection.person_id, PERSON2));

        expect(row).toMatchObject({ full_name: 'New Name', job_title: 'Senior Engineer' });
      } finally {
        resetIdentityDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('flips employment_status on terminate then reinstate', async () => {
    const PERSON3 = '00000000-0000-0000-0000-0000000000b3';
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetIdentityDb();
      initPools({ databaseUrl });
      try {
        await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)`, [
          TENANT,
          'Dir Projection Tenant',
          `dir-proj3-${TENANT.slice(0, 8)}`,
        ]);

        await dispatch(directoryProjectionSubscribers, {
          eventType: 'people.worker.created',
          tenantId: TENANT,
          payload: {
            worker_id: PERSON3,
            person_id: PERSON3,
            tenant_id: TENANT,
            full_name: 'Bob Jones',
            work_email: null,
            job_title: null,
          },
        });

        const base = {
          tenantId: TENANT,
          payload: { worker_id: PERSON3, person_id: PERSON3, tenant_id: TENANT },
        };

        await dispatch(directoryProjectionSubscribers, {
          ...base,
          eventType: 'people.worker.terminated',
        });

        const db = drizzle(pool, { schema });
        let [row] = await db
          .select()
          .from(schema.personProjection)
          .where(eq(schema.personProjection.person_id, PERSON3));
        expect(row?.employment_status).toBe('terminated');

        await dispatch(directoryProjectionSubscribers, {
          ...base,
          eventType: 'people.worker.reinstated',
        });

        [row] = await db
          .select()
          .from(schema.personProjection)
          .where(eq(schema.personProjection.person_id, PERSON3));
        expect(row?.employment_status).toBe('active');
      } finally {
        resetIdentityDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
