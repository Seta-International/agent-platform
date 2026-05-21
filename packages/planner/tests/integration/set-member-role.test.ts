import { resetCoreDb } from '@seta/core/internal/test-support';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { addGroupMember, createGroup, PlannerError, setMemberRole } from '../../src/index.ts';
import { buildSession, readEvents, seedTenant } from '../helpers.ts';

describe('setMemberRole', () => {
  it('promotes member to owner and emits role-changed', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool, {
            users: [{ name: 'Mem', email: 'mem@example.test' }],
          });
          const member = seeded.users[0];
          if (!member) throw new Error('Seed did not create member');
          const g = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'G',
            session: seeded.adminSession,
          });
          await addGroupMember({
            group_id: g.id,
            user_id: member.user_id,
            session: seeded.adminSession,
          });
          await setMemberRole({
            group_id: g.id,
            user_id: member.user_id,
            role: 'owner',
            session: seeded.adminSession,
          });

          const events = await readEvents(
            pool,
            seeded.tenant_id,
            'planner.group.member.role-changed',
          );
          expect(events).toHaveLength(1);
          const p = events[0]?.payload as { before_role: string; after_role: string };
          expect(p.before_role).toBe('member');
          expect(p.after_role).toBe('owner');
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('is a no-op when role already matches (no event)', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool, {
            users: [{ name: 'Mem', email: 'mem@example.test' }],
          });
          const member = seeded.users[0];
          if (!member) throw new Error('Seed did not create member');
          const g = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'G',
            session: seeded.adminSession,
          });
          await addGroupMember({
            group_id: g.id,
            user_id: member.user_id,
            session: seeded.adminSession,
          });
          await setMemberRole({
            group_id: g.id,
            user_id: member.user_id,
            role: 'member',
            session: seeded.adminSession,
          });

          const events = await readEvents(
            pool,
            seeded.tenant_id,
            'planner.group.member.role-changed',
          );
          expect(events).toHaveLength(0);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('rejects NOT_FOUND when member is not in the group', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool, {
            users: [{ name: 'Mem', email: 'mem@example.test' }],
          });
          const member = seeded.users[0];
          if (!member) throw new Error('Seed did not create member');
          const g = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'G',
            session: seeded.adminSession,
          });
          await expect(
            setMemberRole({
              group_id: g.id,
              user_id: member.user_id,
              role: 'owner',
              session: seeded.adminSession,
            }),
          ).rejects.toMatchObject({ code: 'NOT_FOUND' });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('rejects with FORBIDDEN when actor lacks permission', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool, {
            users: [{ name: 'Mem', email: 'mem@example.test' }],
          });
          const member = seeded.users[0];
          if (!member) throw new Error('Seed did not create member');
          const g = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'G',
            session: seeded.adminSession,
          });
          await addGroupMember({
            group_id: g.id,
            user_id: member.user_id,
            session: seeded.adminSession,
          });
          const viewerSession = buildSession({
            tenant_id: seeded.tenant_id,
            user_id: member.user_id,
            roles: ['planner.viewer'],
            accessible_group_ids: [g.id],
          });
          await expect(
            setMemberRole({
              group_id: g.id,
              user_id: member.user_id,
              role: 'owner',
              session: viewerSession,
            }),
          ).rejects.toBeInstanceOf(PlannerError);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
