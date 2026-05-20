import { resetCoreDb } from '@seta/core/internal/test-support';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { addGroupMember, createGroup, removeGroupMember } from '../../src/index.ts';
import { buildSession, countEvents, readEvents, seedTenant } from '../helpers.ts';

describe('addGroupMember', () => {
  it('adds a member, emits planner.group.member.added', async () => {
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
            users: [{ name: 'Bob', email: 'bob@example.test' }],
          });
          const session = seeded.adminSession;
          const [bob] = seeded.users;
          if (!bob) throw new Error('Seed did not create Bob');

          const group = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'Alpha',
            session,
          });

          await addGroupMember({ group_id: group.id, user_id: bob.user_id, session });

          const { rows } = await pool.query(
            `SELECT user_id FROM planner.group_members WHERE group_id = $1`,
            [group.id],
          );
          expect(rows).toHaveLength(1);
          expect(rows[0].user_id).toBe(bob.user_id);

          const events = await readEvents(pool, seeded.tenant_id, 'planner.group.member.added');
          expect(events).toHaveLength(1);
          // biome-ignore lint/suspicious/noExplicitAny: payload is JSONB
          const payload = events[0]?.payload as any;
          expect(payload.group_id).toBe(group.id);
          expect(payload.user_id).toBe(bob.user_id);
          expect(payload.actor.user_id).toBe(session.user_id);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('is idempotent: second add is a no-op (no event, no error)', async () => {
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
            users: [{ name: 'Bob', email: 'bob@example.test' }],
          });
          const session = seeded.adminSession;
          const [bob] = seeded.users;
          if (!bob) throw new Error('Seed did not create Bob');

          const group = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'Beta',
            session,
          });

          await addGroupMember({ group_id: group.id, user_id: bob.user_id, session });
          await addGroupMember({ group_id: group.id, user_id: bob.user_id, session });

          const count = await countEvents(pool, seeded.tenant_id, 'planner.group.member.added');
          expect(count).toBe(1);

          const { rows } = await pool.query(
            `SELECT user_id FROM planner.group_members WHERE group_id = $1`,
            [group.id],
          );
          expect(rows).toHaveLength(1);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('throws NOT_FOUND when group does not exist', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          await expect(
            addGroupMember({
              group_id: crypto.randomUUID(),
              user_id: crypto.randomUUID(),
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

  it('throws FORBIDDEN when session lacks planner.group.member.write', async () => {
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
            users: [{ name: 'Bob', email: 'bob@example.test' }],
          });
          const adminSession = seeded.adminSession;
          const [bob] = seeded.users;
          if (!bob) throw new Error('Seed did not create Bob');

          const group = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'Gamma',
            session: adminSession,
          });

          const viewerSession = buildSession({
            tenant_id: seeded.tenant_id,
            user_id: crypto.randomUUID(),
            roles: ['planner.viewer'],
          });

          await expect(
            addGroupMember({ group_id: group.id, user_id: bob.user_id, session: viewerSession }),
          ).rejects.toMatchObject({ code: 'FORBIDDEN' });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});

describe('removeGroupMember', () => {
  it('removes a member, emits planner.group.member.removed', async () => {
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
            users: [{ name: 'Bob', email: 'bob@example.test' }],
          });
          const session = seeded.adminSession;
          const [bob] = seeded.users;
          if (!bob) throw new Error('Seed did not create Bob');

          const group = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'Delta',
            session,
          });

          await addGroupMember({ group_id: group.id, user_id: bob.user_id, session });
          await removeGroupMember({ group_id: group.id, user_id: bob.user_id, session });

          const { rows } = await pool.query(
            `SELECT user_id FROM planner.group_members WHERE group_id = $1`,
            [group.id],
          );
          expect(rows).toHaveLength(0);

          const events = await readEvents(pool, seeded.tenant_id, 'planner.group.member.removed');
          expect(events).toHaveLength(1);
          // biome-ignore lint/suspicious/noExplicitAny: payload is JSONB
          const payload = events[0]?.payload as any;
          expect(payload.group_id).toBe(group.id);
          expect(payload.user_id).toBe(bob.user_id);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('is idempotent: removing a non-member is a no-op (no event, no error)', async () => {
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
            users: [{ name: 'Bob', email: 'bob@example.test' }],
          });
          const session = seeded.adminSession;
          const [bob] = seeded.users;
          if (!bob) throw new Error('Seed did not create Bob');

          const group = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'Epsilon',
            session,
          });

          await addGroupMember({ group_id: group.id, user_id: bob.user_id, session });
          await removeGroupMember({ group_id: group.id, user_id: bob.user_id, session });
          await removeGroupMember({ group_id: group.id, user_id: bob.user_id, session });

          const count = await countEvents(pool, seeded.tenant_id, 'planner.group.member.removed');
          expect(count).toBe(1);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('throws NOT_FOUND when group does not exist', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          await expect(
            removeGroupMember({
              group_id: crypto.randomUUID(),
              user_id: crypto.randomUUID(),
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
});
