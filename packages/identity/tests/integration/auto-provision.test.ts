import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools, scoped } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { and, eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { identityDb, resetIdentityDb } from '../../src/backend/db/index.ts';
import { user } from '../../src/backend/db/schema.ts';
import { autoProvisionSubscribers } from '../../src/backend/subscribers/auto-provision.ts';
import { dispatch } from '../helpers/bus.ts';

const TENANT = '00000000-0000-0000-0000-0000000000a2';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('autoProvisionSubscribers', () => {
  it('provisions an account on worker.created with work_email; idempotent on replay', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetIdentityDb();
      initPools({ databaseUrl });
      try {
        await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)`, [
          TENANT,
          'Auto Provision Tenant',
          `auto-prov-${TENANT.slice(0, 8)}`,
        ]);

        // No appDatabaseUrl here, so scoped()'s tenant GUC is inert (self-host
        // fallback) — this only opens the executor context identityDb() requires.
        await scoped(TENANT, async () => {
          const ev = {
            eventType: 'people.worker.created',
            tenantId: TENANT,
            payload: {
              worker_id: '00000000-0000-0000-0000-000000000001',
              person_id: '00000000-0000-0000-0000-000000000001',
              tenant_id: TENANT,
              full_name: 'Lan Vo',
              work_email: 'lan@acme.test',
              job_title: null,
            },
          };

          await dispatch(autoProvisionSubscribers, ev);
          await dispatch(autoProvisionSubscribers, ev); // idempotency replay

          const rows = await identityDb()
            .select({ id: user.id })
            .from(user)
            .where(and(eq(user.tenant_id, TENANT), sql`lower(${user.email}) = ${'lan@acme.test'}`));
          expect(rows).toHaveLength(1);
        });
      } finally {
        resetIdentityDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('does not provision when work_email is null until updated sets one', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetIdentityDb();
      initPools({ databaseUrl });
      try {
        await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)`, [
          TENANT,
          'Auto Provision Tenant',
          `auto-prov2-${TENANT.slice(0, 8)}`,
        ]);

        // No appDatabaseUrl here, so scoped()'s tenant GUC is inert (self-host
        // fallback) — this only opens the executor context identityDb() requires.
        await scoped(TENANT, async () => {
          await dispatch(autoProvisionSubscribers, {
            eventType: 'people.worker.created',
            tenantId: TENANT,
            payload: {
              worker_id: '00000000-0000-0000-0000-000000000002',
              person_id: '00000000-0000-0000-0000-000000000002',
              tenant_id: TENANT,
              full_name: 'No Email',
              work_email: null,
              job_title: null,
            },
          });

          const beforeRows = await identityDb()
            .select({ id: user.id })
            .from(user)
            .where(eq(user.tenant_id, TENANT));
          expect(beforeRows).toHaveLength(0);

          await dispatch(autoProvisionSubscribers, {
            eventType: 'people.worker.updated',
            tenantId: TENANT,
            payload: {
              worker_id: '00000000-0000-0000-0000-000000000002',
              person_id: '00000000-0000-0000-0000-000000000002',
              tenant_id: TENANT,
              fields: ['work_email'],
              full_name: 'No Email',
              work_email: 'now@acme.test',
              job_title: null,
            },
          });

          const afterRows = await identityDb()
            .select({ id: user.id })
            .from(user)
            .where(and(eq(user.tenant_id, TENANT), sql`lower(${user.email}) = ${'now@acme.test'}`));
          expect(afterRows).toHaveLength(1);
        });
      } finally {
        resetIdentityDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
