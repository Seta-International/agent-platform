import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { and, eq, sql } from 'drizzle-orm';
import { expect, it } from 'vitest';
import { identityDb, resetIdentityDb } from '../../src/backend/db/index.ts';
import { user } from '../../src/backend/db/schema.ts';
import { provisionAccount } from '../../src/backend/domain/provision-account.ts';
import { seedDirectoryAccount, seedDirectoryPersonOnly, testSession } from '../helpers/seed.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

it('provisions an account for a no-account person; gated + idempotent', async () => {
  await withTestDb(ctx, async ({ pool, databaseUrl }) => {
    resetCoreDb();
    resetIdentityDb();
    initPools({ databaseUrl });
    try {
      const tenant = crypto.randomUUID();
      await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)`, [
        tenant,
        'Provision Account Test',
        `prov-acct-${tenant.slice(0, 8)}`,
      ]);

      // Seed the no-account person (target of provisioning).
      const { person_id } = await seedDirectoryPersonOnly(pool, {
        tenant_id: tenant,
        email: 'prov@acme.test',
        name: 'Prov Me',
      });

      // Seed a real caller with identity.admin role so requirePermission passes.
      const admin = await seedDirectoryAccount(pool, {
        tenant_id: tenant,
        email: 'admin@acme.test',
        admin: false,
        roles: ['identity.admin'],
      });
      const session = testSession({ tenant, user_id: admin.user_id });

      const r1 = await provisionAccount(session, { person_id });
      const r2 = await provisionAccount(session, { person_id });

      expect(r1.created).toBe(true);
      expect(r2.created).toBe(false);
      expect(r1.user_id).toBe(r2.user_id);

      const rows = await identityDb()
        .select()
        .from(user)
        .where(and(eq(user.tenant_id, tenant), sql`lower(${user.email}) = 'prov@acme.test'`));
      expect(rows).toHaveLength(1);
    } finally {
      resetIdentityDb();
      resetCoreDb();
      await closePools();
    }
  });
});

it('rejects a caller lacking identity.user.update', async () => {
  await withTestDb(ctx, async ({ pool, databaseUrl }) => {
    resetCoreDb();
    resetIdentityDb();
    initPools({ databaseUrl });
    try {
      const tenant = crypto.randomUUID();
      await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)`, [
        tenant,
        'Perm Reject Test',
        `perm-rej-${tenant.slice(0, 8)}`,
      ]);

      // Caller with no role grants (no identity.user.update).
      const noPerms = await seedDirectoryAccount(pool, {
        tenant_id: tenant,
        email: 'noperms@acme.test',
        admin: false,
      });
      const session = testSession({ tenant, user_id: noPerms.user_id });

      await expect(provisionAccount(session, { person_id: crypto.randomUUID() })).rejects.toThrow();
    } finally {
      resetIdentityDb();
      resetCoreDb();
      await closePools();
    }
  });
});

it('rejects when person not found in directory', async () => {
  await withTestDb(ctx, async ({ pool, databaseUrl }) => {
    resetCoreDb();
    resetIdentityDb();
    initPools({ databaseUrl });
    try {
      const tenant = crypto.randomUUID();
      await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)`, [
        tenant,
        'Not Found Test',
        `not-found-${tenant.slice(0, 8)}`,
      ]);

      const admin = await seedDirectoryAccount(pool, {
        tenant_id: tenant,
        email: 'admin2@acme.test',
        admin: false,
        roles: ['identity.admin'],
      });
      const session = testSession({ tenant, user_id: admin.user_id });

      await expect(
        provisionAccount(session, { person_id: crypto.randomUUID() }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    } finally {
      resetIdentityDb();
      resetCoreDb();
      await closePools();
    }
  });
});
