import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { expect, it } from 'vitest';
import { resetIdentityDb } from '../../src/backend/db/index.ts';
import { listDirectory } from '../../src/backend/domain/list-directory.ts';
import { seedDirectoryAccount, seedDirectoryPersonOnly, testSession } from '../helpers/seed.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

it('returns account_status none/active/suspended, role summary, and SQL status filter; gated', async () => {
  await withTestDb(ctx, async ({ pool, databaseUrl }) => {
    resetCoreDb();
    resetIdentityDb();
    initPools({ databaseUrl });
    try {
      const tenant = crypto.randomUUID();
      await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)`, [
        tenant,
        'List Directory Test',
        `list-dir-${tenant.slice(0, 8)}`,
      ]);

      await seedDirectoryPersonOnly(pool, {
        tenant_id: tenant,
        email: 'noacct@acme.test',
        name: 'No Acct',
      });
      await seedDirectoryAccount(pool, {
        tenant_id: tenant,
        email: 'act@acme.test',
        admin: false,
        roles: ['people.viewer'],
      });
      await seedDirectoryAccount(pool, {
        tenant_id: tenant,
        email: 'sus2@acme.test',
        admin: false,
        suspended: true,
      });
      // Admin caller holds identity.user.read.any via a real DB role-grant (requirePermission gate).
      const admin = await seedDirectoryAccount(pool, {
        tenant_id: tenant,
        email: 'admin@acme.test',
        admin: true,
      });

      const session = testSession({ tenant, user_id: admin.user_id });
      const { rows } = await listDirectory(session);
      const byEmail = Object.fromEntries(rows.map((r) => [r.work_email, r]));

      expect(byEmail['noacct@acme.test'].account_status).toBe('none');
      expect(byEmail['act@acme.test'].account_status).toBe('active');
      expect(byEmail['act@acme.test'].roles).toContain('people.viewer');
      expect(byEmail['sus2@acme.test'].account_status).toBe('suspended');

      // SQL status filter (pre-slice): only the none-status (no-account) row comes back.
      const noneOnly = await listDirectory(session, { status: 'none' });
      expect(noneOnly.rows.map((r) => r.work_email)).toEqual(['noacct@acme.test']);
      expect(noneOnly.rows.every((r) => r.account_status === 'none')).toBe(true);
    } finally {
      resetIdentityDb();
      resetCoreDb();
      await closePools();
    }
  });
});

it('rejects a caller lacking identity.user.read.any', async () => {
  await withTestDb(ctx, async ({ pool, databaseUrl }) => {
    resetCoreDb();
    resetIdentityDb();
    initPools({ databaseUrl });
    try {
      const tenant = crypto.randomUUID();
      await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)`, [
        tenant,
        'List Directory Reject Test',
        `list-dir-rej-${tenant.slice(0, 8)}`,
      ]);
      // A user with no role grants in the tenant must be rejected by requirePermission.
      await expect(listDirectory(testSession({ tenant }))).rejects.toThrow();
    } finally {
      resetIdentityDb();
      resetCoreDb();
      await closePools();
    }
  });
});
