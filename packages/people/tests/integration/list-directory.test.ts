import { resetCoreDb } from '@seta/core/testing';
import {
  addGroupMembers,
  createGroup,
  createUser,
  deactivateUser,
  grantRole,
} from '@seta/identity';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import { userProjection } from '../../src/backend/db/schema.ts';
import { createWorker, listDirectory, terminateWorker } from '../../src/index.ts';
import { buildSession, linkUserToPerson, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

const CLI = { type: 'cli' as const, user_id: null };

describe('listDirectory', () => {
  it('returns account_status none/active/suspended, role summary, group filter, and pagination', async () => {
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

        await createWorker({
          full_name: 'No Acct',
          work_email: 'noacct@acme.test',
          session: t.adminSession,
        });

        const { worker_id: actId } = await createWorker({
          full_name: 'Act Person',
          work_email: 'act@acme.test',
          session: t.adminSession,
        });
        const { user_id: actUserId } = await createUser(
          {
            tenant_id: t.tenant_id,
            email: 'act@acme.test',
            name: 'Act Person',
            password: 'S3cur3Pass!99',
          },
          CLI,
        );
        await linkUserToPerson(t.tenant_id, actId, actUserId);
        await grantRole(
          {
            user_id: actUserId,
            tenant_id: t.tenant_id,
            role_slug: 'people.viewer',
            scope_kind: 'tenant',
            scope_id: null,
          },
          CLI,
        );
        const { group_id: groupId } = await createGroup(
          { tenant_id: t.tenant_id, slug: 'hr', name: 'HR', kind: 'custom' },
          CLI,
        );
        await addGroupMembers(
          { group_id: groupId, tenant_id: t.tenant_id, user_ids: [actUserId] },
          CLI,
        );

        const { worker_id: susId } = await createWorker({
          full_name: 'Sus Person',
          work_email: 'sus2@acme.test',
          session: t.adminSession,
        });
        const { user_id: susUserId } = await createUser(
          {
            tenant_id: t.tenant_id,
            email: 'sus2@acme.test',
            name: 'Sus Person',
            password: 'S3cur3Pass!99',
          },
          CLI,
        );
        await linkUserToPerson(t.tenant_id, susId, susUserId);
        await deactivateUser(susUserId, CLI);
        // The identity -> people deactivated_at sync runs off the event bus (see
        // sync-user-status.test.ts for that subscriber in isolation); this lightweight
        // domain-fn test sets the projection directly, same fixture-only pattern as
        // linkUserToPerson above.
        await peopleDb()
          .update(userProjection)
          .set({ deactivated_at: new Date() })
          .where(eq(userProjection.user_id, susUserId));

        const all = await listDirectory(adminSession);
        const { rows } = all;
        const byEmail = Object.fromEntries(rows.map((r) => [r.work_email, r]));

        expect(byEmail['noacct@acme.test'].account_status).toBe('none');
        expect(byEmail['noacct@acme.test'].user_id).toBeNull();
        expect(byEmail['act@acme.test'].account_status).toBe('active');
        expect(byEmail['act@acme.test'].roles).toContain('people.viewer');
        expect(byEmail['act@acme.test'].groups).toEqual(['HR']);
        expect(byEmail['noacct@acme.test'].groups).toEqual([]);
        expect(byEmail['sus2@acme.test'].account_status).toBe('suspended');

        expect(all.total).toBe(3);
        expect(all.pageSize).toBe(25);
        expect(all.hasMore).toBe(false);

        const p0 = await listDirectory(adminSession, { pageSize: 2, page: 0 });
        const p1 = await listDirectory(adminSession, { pageSize: 2, page: 1 });
        expect(p0.rows).toHaveLength(2);
        expect(p0.hasMore).toBe(true);
        expect(p0.total).toBe(3);
        expect(p1.rows).toHaveLength(1);
        expect(p1.hasMore).toBe(false);
        const p0Ids = p0.rows.map((r) => r.person_id);
        const p1Ids = p1.rows.map((r) => r.person_id);
        expect(p0Ids.some((id) => p1Ids.includes(id))).toBe(false);

        const noneOnly = await listDirectory(adminSession, { status: 'none' });
        expect(noneOnly.rows.map((r) => r.work_email)).toEqual(['noacct@acme.test']);
        expect(noneOnly.rows.every((r) => r.account_status === 'none')).toBe(true);

        const inGroup = await listDirectory(adminSession, { group_id: groupId });
        expect(inGroup.rows.map((r) => r.work_email)).toEqual(['act@acme.test']);

        const terminated = await listDirectory(adminSession, { employment: 'terminated' });
        expect(terminated.rows).toHaveLength(0);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('surfaces a terminated worker under the employment:terminated filter', async () => {
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

        const { worker_id } = await createWorker({
          full_name: 'Termed Person',
          work_email: 'termed@acme.test',
          session: t.adminSession,
        });
        await terminateWorker({ worker_id, session: t.adminSession });

        const terminated = await listDirectory(adminSession, { employment: 'terminated' });
        expect(terminated.rows.map((r) => r.work_email)).toEqual(['termed@acme.test']);
        expect(terminated.rows[0]?.employment_status).toBe('terminated');

        const all = await listDirectory(adminSession);
        expect(all.rows.find((r) => r.work_email === 'termed@acme.test')?.employment_status).toBe(
          'terminated',
        );
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('lists a person with no user account', async () => {
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

        await createWorker({
          full_name: 'Solo Person',
          work_email: 'solo@acme.test',
          session: t.adminSession,
        });

        const result = await listDirectory(adminSession, { status: 'none' });
        const row = result.rows.find((r) => r.work_email === 'solo@acme.test');
        expect(row).toBeDefined();
        expect(row?.account_status).toBe('none');
        expect(row?.user_id).toBeNull();
        expect(row?.roles).toEqual([]);
        expect(row?.groups).toEqual([]);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('excludes people from another tenant', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t1 = await seedTenant(pool);
        const t2 = await seedTenant(pool);

        await createWorker({
          full_name: 'Tenant One Person',
          work_email: 'p1@acme.test',
          session: t1.adminSession,
        });
        await createWorker({
          full_name: 'Tenant Two Person',
          work_email: 'p2@acme.test',
          session: t2.adminSession,
        });

        const session1 = buildSession({
          tenant_id: t1.tenant_id,
          user_id: t1.admin_user_id,
          roles: ['identity.admin'],
        });

        const result = await listDirectory(session1);
        expect(result.rows.map((r) => r.work_email)).toEqual(['p1@acme.test']);
        expect(result.total).toBe(1);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('rejects a caller lacking identity.user.list', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const noPermsSession = buildSession({
          tenant_id: t.tenant_id,
          user_id: crypto.randomUUID(),
          roles: ['people.viewer'],
        });

        await expect(listDirectory(noPermsSession)).rejects.toMatchObject({ code: 'FORBIDDEN' });
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
