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
      const act = await seedDirectoryAccount(pool, {
        tenant_id: tenant,
        email: 'act@acme.test',
        admin: false,
        roles: ['people.viewer'],
      });
      // Give 'act' an access-group membership so the directory surfaces it.
      const groupId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO identity.access_group (id, tenant_id, slug, name) VALUES ($1, $2, $3, $4)`,
        [groupId, tenant, 'hr', 'HR'],
      );
      await pool.query(
        `INSERT INTO identity.access_group_membership (group_id, user_id) VALUES ($1, $2)`,
        [groupId, act.user_id],
      );
      await seedDirectoryAccount(pool, {
        tenant_id: tenant,
        email: 'sus2@acme.test',
        admin: false,
        suspended: true,
      });
      // Admin caller holds identity.user.list via a real DB role-grant (requirePermission gate).
      const admin = await seedDirectoryAccount(pool, {
        tenant_id: tenant,
        email: 'admin@acme.test',
        admin: true,
      });

      const session = testSession({ tenant, user_id: admin.user_id });
      const all = await listDirectory(session);
      const { rows } = all;
      const byEmail = Object.fromEntries(rows.map((r) => [r.work_email, r]));

      expect(byEmail['noacct@acme.test'].account_status).toBe('none');
      expect(byEmail['act@acme.test'].account_status).toBe('active');
      expect(byEmail['act@acme.test'].roles).toContain('people.viewer');
      expect(byEmail['act@acme.test'].groups).toEqual(['HR']);
      expect(byEmail['noacct@acme.test'].groups).toEqual([]);
      expect(byEmail['sus2@acme.test'].account_status).toBe('suspended');

      // Total reflects the whole filtered set, not just the returned page.
      expect(all.total).toBe(4);
      expect(all.pageSize).toBe(25);
      expect(all.hasMore).toBe(false);

      // Offset pagination: page 0 and page 1 (pageSize 2) return disjoint rows covering the set.
      const p0 = await listDirectory(session, { pageSize: 2, page: 0 });
      const p1 = await listDirectory(session, { pageSize: 2, page: 1 });
      expect(p0.rows).toHaveLength(2);
      expect(p0.hasMore).toBe(true);
      expect(p0.total).toBe(4);
      expect(p1.rows).toHaveLength(2);
      expect(p1.hasMore).toBe(false);
      const p0Emails = p0.rows.map((r) => r.work_email);
      const p1Emails = p1.rows.map((r) => r.work_email);
      expect(p0Emails.some((e) => p1Emails.includes(e))).toBe(false);

      // SQL status filter (pre-slice): only the none-status (no-account) row comes back.
      const noneOnly = await listDirectory(session, { status: 'none' });
      expect(noneOnly.rows.map((r) => r.work_email)).toEqual(['noacct@acme.test']);
      expect(noneOnly.rows.every((r) => r.account_status === 'none')).toBe(true);

      // Group filter: only members of that group (implicitly account-holders).
      const inGroup = await listDirectory(session, { group_id: groupId });
      expect(inGroup.rows.map((r) => r.work_email)).toEqual(['act@acme.test']);

      // Employment filter: all seeded people are employed, so a terminated filter is empty.
      const terminated = await listDirectory(session, { employment: 'terminated' });
      expect(terminated.rows).toHaveLength(0);
    } finally {
      resetIdentityDb();
      resetCoreDb();
      await closePools();
    }
  });
});

it('rejects a caller lacking identity.user.list', async () => {
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
