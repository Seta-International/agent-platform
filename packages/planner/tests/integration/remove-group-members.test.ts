import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import {
  addGroupMember,
  createGroup,
  listGroupMembers,
  removeGroupMembers,
} from '../../src/index.ts';
import { buildSession, seedTenant } from '../helpers.ts';

const DB = () => ({
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
});

describe('removeGroupMembers (bulk)', () => {
  it('removes multiple members in sequence, each member is no longer in the group', async () => {
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
          name: 'BulkRemove',
          session: seeded.adminSession,
        });

        await addGroupMember({
          group_id: group.id,
          user_id: alice.user_id,
          session: seeded.adminSession,
        });
        await addGroupMember({
          group_id: group.id,
          user_id: bob.user_id,
          session: seeded.adminSession,
        });

        await removeGroupMembers({
          group_id: group.id,
          user_ids: [alice.user_id, bob.user_id],
          session: seeded.adminSession,
        });

        const { members } = await listGroupMembers({
          group_id: group.id,
          session: seeded.adminSession,
        });
        const ids = members.map((m) => m.user_id);
        expect(ids).not.toContain(alice.user_id);
        expect(ids).not.toContain(bob.user_id);
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
          removeGroupMembers({
            group_id: linkedGroupId,
            user_ids: [alice.user_id],
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
          removeGroupMembers({
            group_id: group.id,
            user_ids: [alice.user_id],
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
