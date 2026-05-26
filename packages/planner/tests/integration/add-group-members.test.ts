import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { addGroupMembers, createGroup, listGroupMembers } from '../../src/index.ts';
import { buildSession, countEvents, seedTenant } from '../helpers.ts';

const DB = () => ({
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
});

describe('addGroupMembers (bulk)', () => {
  it('adds multiple members in sequence, emits an event per member', async () => {
    await withTestDb(DB(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool, {
          users: [
            { name: 'Alice', email: 'alice@example.test' },
            { name: 'Bob', email: 'bob@example.test' },
          ],
        });
        const [alice, bob] = seeded.users;
        if (!alice || !bob) throw new Error('seed failed');

        const group = await createGroup({
          tenant_id: seeded.tenant_id,
          name: 'Bulk',
          session: seeded.adminSession,
        });

        await addGroupMembers({
          group_id: group.id,
          members: [{ user_id: alice.user_id }, { user_id: bob.user_id }],
          session: seeded.adminSession,
        });

        const { members } = await listGroupMembers({
          group_id: group.id,
          session: seeded.adminSession,
        });
        const ids = members.map((m) => m.user_id);
        expect(ids).toContain(alice.user_id);
        expect(ids).toContain(bob.user_id);

        const eventCount = await countEvents(pool, seeded.tenant_id, 'planner.group.member.added');
        // alice + bob (creator was auto-added at group creation, not re-added here)
        expect(eventCount).toBe(2);
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('is idempotent: duplicate user_id in input is a no-op', async () => {
    await withTestDb(DB(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool, {
          users: [{ name: 'Alice', email: 'alice@example.test' }],
        });
        const [alice] = seeded.users;
        if (!alice) throw new Error('seed failed');

        const group = await createGroup({
          tenant_id: seeded.tenant_id,
          name: 'Idem',
          session: seeded.adminSession,
        });

        await addGroupMembers({
          group_id: group.id,
          members: [{ user_id: alice.user_id }, { user_id: alice.user_id }],
          session: seeded.adminSession,
        });

        const { rows } = await pool.query(
          `SELECT user_id FROM planner.group_members WHERE group_id = $1 AND user_id = $2`,
          [group.id, alice.user_id],
        );
        expect(rows).toHaveLength(1);
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('throws LINKED_GROUP_IMMUTABLE_MEMBERS for M365-linked groups', async () => {
    await withTestDb(DB(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool, {
          users: [{ name: 'Alice', email: 'alice@example.test' }],
        });
        const [alice] = seeded.users;
        if (!alice) throw new Error('seed failed');

        // Insert a linked group directly
        await pool.query(
          `INSERT INTO planner.groups
             (id, tenant_id, name, external_source, external_id, created_by)
             VALUES ($1, $2, 'Linked', 'm365', 'ext-1', $3)`,
          [crypto.randomUUID(), seeded.tenant_id, seeded.admin.user_id],
        );
        const { rows } = await pool.query(
          `SELECT id FROM planner.groups WHERE tenant_id = $1 AND external_source = 'm365'`,
          [seeded.tenant_id],
        );
        const linkedGroupId = rows[0].id as string;

        await expect(
          addGroupMembers({
            group_id: linkedGroupId,
            members: [{ user_id: alice.user_id }],
            session: seeded.adminSession,
          }),
        ).rejects.toMatchObject({ code: 'LINKED_GROUP_IMMUTABLE_MEMBERS' });
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('throws FORBIDDEN for session lacking planner.group.member.write', async () => {
    await withTestDb(DB(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool, {
          users: [{ name: 'Alice', email: 'alice@example.test' }],
        });
        const [alice] = seeded.users;
        if (!alice) throw new Error('seed failed');

        const group = await createGroup({
          tenant_id: seeded.tenant_id,
          name: 'Forbidden',
          session: seeded.adminSession,
        });

        const viewer = buildSession({
          tenant_id: seeded.tenant_id,
          user_id: crypto.randomUUID(),
          roles: ['planner.viewer'],
        });

        await expect(
          addGroupMembers({
            group_id: group.id,
            members: [{ user_id: alice.user_id }],
            session: viewer,
          }),
        ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });
});
