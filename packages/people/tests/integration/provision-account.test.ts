import type { SessionEnv } from '@seta/core';
import { resetCoreDb } from '@seta/core/testing';
import { createGroup, listUserGroups } from '@seta/identity';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { resetPeopleDb } from '../../src/backend/db/client.ts';
import { registerPeopleWorkersRoutes } from '../../src/backend/http/workers.ts';
import { createWorker, provisionAccount } from '../../src/index.ts';
import { peopleErrorMapper } from '../../src/register.ts';
import { buildSession, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('provisionAccount', () => {
  it('provisions an account for a no-account worker; gated + idempotent', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { worker_id } = await createWorker({
          full_name: 'Prov Me',
          work_email: 'prov@acme.test',
          session: t.adminSession,
        });

        const adminSession = buildSession({
          tenant_id: t.tenant_id,
          user_id: t.admin_user_id,
          roles: ['identity.admin'],
        });

        const r1 = await provisionAccount(adminSession, { person_id: worker_id });
        const r2 = await provisionAccount(adminSession, { person_id: worker_id });

        expect(r1.created).toBe(true);
        expect(r2.created).toBe(false);
        expect(r1.user_id).toBe(r2.user_id);

        const rows = await pool.query(
          `SELECT id FROM identity.user WHERE tenant_id = $1 AND lower(email) = 'prov@acme.test'`,
          [t.tenant_id],
        );
        expect(rows.rows).toHaveLength(1);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('rejects a caller lacking identity.user.update', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { worker_id } = await createWorker({
          full_name: 'No Perms Target',
          work_email: 'noperm-target@acme.test',
          session: t.adminSession,
        });

        const noPermsSession = buildSession({
          tenant_id: t.tenant_id,
          user_id: crypto.randomUUID(),
          roles: ['people.viewer'],
        });

        await expect(
          provisionAccount(noPermsSession, { person_id: worker_id }),
        ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('rejects when worker not found in directory', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const adminSession = buildSession({
          tenant_id: t.tenant_id,
          user_id: t.admin_user_id,
          roles: ['identity.admin'],
        });

        await expect(
          provisionAccount(adminSession, { person_id: crypto.randomUUID() }),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('rejects when worker has no work_email', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { worker_id } = await createWorker({
          full_name: 'No Email Worker',
          session: t.adminSession,
        });

        const adminSession = buildSession({
          tenant_id: t.tenant_id,
          user_id: t.admin_user_id,
          roles: ['identity.admin'],
        });

        await expect(
          provisionAccount(adminSession, { person_id: worker_id }),
        ).rejects.toMatchObject({ code: 'VALIDATION' });
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('adds a newly provisioned user to the base group', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const adminSession = buildSession({
          tenant_id: t.tenant_id,
          user_id: t.admin_user_id,
          roles: ['identity.admin'],
        });

        await createGroup(
          {
            tenant_id: t.tenant_id,
            slug: 'member',
            name: 'Member',
            kind: 'default',
            is_base: true,
          },
          { type: 'user', user_id: t.admin_user_id },
        );

        const { worker_id } = await createWorker({
          full_name: 'New Hire',
          work_email: 'new-hire@acme.test',
          session: t.adminSession,
        });

        const { user_id } = await provisionAccount(adminSession, { person_id: worker_id });

        const groups = await listUserGroups(adminSession, user_id);
        expect(groups.map((g) => g.slug)).toContain('member');
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('POST /api/people/v1/directory/:personId/provision provisions the account', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { worker_id } = await createWorker({
          full_name: 'Route Prov',
          work_email: 'route-prov@acme.test',
          session: t.adminSession,
        });

        const adminSession = buildSession({
          tenant_id: t.tenant_id,
          user_id: t.admin_user_id,
          roles: ['identity.admin'],
        });

        const app = new Hono<SessionEnv>();
        app.use('*', async (c, next) => {
          c.set('user', adminSession);
          await next();
        });
        registerPeopleWorkersRoutes(app);
        app.onError((err, c) => {
          const mapped = peopleErrorMapper(err);
          if (mapped) return c.json(mapped.body, mapped.status as Parameters<typeof c.json>[1]);
          throw err;
        });

        const res = await app.request(`/api/people/v1/directory/${worker_id}/provision`, {
          method: 'POST',
        });
        expect(res.status).toBe(200);
        const body = (await res.json()) as { user_id: string; created: boolean };
        expect(body.created).toBe(true);
        expect(typeof body.user_id).toBe('string');
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
