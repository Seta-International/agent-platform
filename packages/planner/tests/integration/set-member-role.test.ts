import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { addGroupMember, createGroup, PlannerError, setMemberRole } from '../../src/index.ts';
import { buildSession, readEvents, seedTenant } from '../helpers.ts';

describe('setMemberRole', () => {
  it('promotes member to owner and emits role-changed', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
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
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
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
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
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

  it('emits planner.group.member.role-changed domain event', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool, {
            users: [{ name: 'Affected', email: 'affected@example.test' }],
          });
          const session = seeded.adminSession;
          const affected = seeded.users[0]!;

          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
          await addGroupMember({ group_id: group.id, user_id: affected.user_id, session });

          await setMemberRole({
            group_id: group.id,
            user_id: affected.user_id,
            role: 'owner',
            session,
          });

          const events = await readEvents(
            pool,
            seeded.tenant_id,
            'planner.group.member.role-changed',
          );
          expect(events).toHaveLength(1);
          // biome-ignore lint/suspicious/noExplicitAny: payload is JSONB
          const payload = events[0]?.payload as any;
          expect(payload.user_id).toBe(affected.user_id);
          expect(payload.group_id).toBe(group.id);
          expect(payload.before_role).toBe('member');
          expect(payload.after_role).toBe('owner');
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
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
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
