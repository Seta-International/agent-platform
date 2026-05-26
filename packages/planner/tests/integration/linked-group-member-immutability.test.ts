import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import {
  addGroupMember,
  createGroup,
  linkGroupToM365,
  type PlannerSessionScope,
  removeGroupMember,
} from '../../src/index.ts';
import { seedTenant } from '../helpers.ts';

describe('linked-group member immutability', () => {
  it('rejects addGroupMember on linked group from user actor', async () => {
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
            users: [{ name: 'Other', email: 'other@example.test' }],
          });
          const other = seeded.users[0];
          if (!other) throw new Error('Seed did not create user');
          const g = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'G',
            session: seeded.adminSession,
          });
          await linkGroupToM365({
            group_id: g.id,
            external_id: 'x',
            session: seeded.adminSession,
          });
          await expect(
            addGroupMember({
              group_id: g.id,
              user_id: other.user_id,
              session: seeded.adminSession,
            }),
          ).rejects.toMatchObject({ code: 'LINKED_GROUP_IMMUTABLE_MEMBERS' });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('allows addGroupMember on linked group from system actor', async () => {
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
            users: [{ name: 'Other', email: 'other@example.test' }],
          });
          const other = seeded.users[0];
          if (!other) throw new Error('Seed did not create user');
          const g = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'G',
            session: seeded.adminSession,
          });
          await linkGroupToM365({
            group_id: g.id,
            external_id: 'x',
            session: seeded.adminSession,
          });
          const systemSession: PlannerSessionScope = {
            ...seeded.adminSession,
            actor: { kind: 'system', system_id: 'integrations.m365' },
          };
          await expect(
            addGroupMember({
              group_id: g.id,
              user_id: other.user_id,
              session: systemSession,
            }),
          ).resolves.toBeUndefined();

          const { rows } = await pool.query(
            'SELECT user_id FROM planner.group_members WHERE group_id = $1 AND user_id = $2',
            [g.id, other.user_id],
          );
          expect(rows).toHaveLength(1);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('rejects removeGroupMember on linked group from user actor', async () => {
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
            users: [{ name: 'Other', email: 'other@example.test' }],
          });
          const other = seeded.users[0];
          if (!other) throw new Error('Seed did not create user');
          const g = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'G',
            session: seeded.adminSession,
          });
          // Add the member while still native, then link.
          await addGroupMember({
            group_id: g.id,
            user_id: other.user_id,
            session: seeded.adminSession,
          });
          await linkGroupToM365({
            group_id: g.id,
            external_id: 'x',
            session: seeded.adminSession,
          });
          await expect(
            removeGroupMember({
              group_id: g.id,
              user_id: other.user_id,
              session: seeded.adminSession,
            }),
          ).rejects.toMatchObject({ code: 'LINKED_GROUP_IMMUTABLE_MEMBERS' });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('allows removeGroupMember on linked group from system actor', async () => {
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
            users: [{ name: 'Other', email: 'other@example.test' }],
          });
          const other = seeded.users[0];
          if (!other) throw new Error('Seed did not create user');
          const g = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'G',
            session: seeded.adminSession,
          });
          await addGroupMember({
            group_id: g.id,
            user_id: other.user_id,
            session: seeded.adminSession,
          });
          await linkGroupToM365({
            group_id: g.id,
            external_id: 'x',
            session: seeded.adminSession,
          });
          const systemSession: PlannerSessionScope = {
            ...seeded.adminSession,
            actor: { kind: 'system', system_id: 'integrations.m365' },
          };
          await expect(
            removeGroupMember({
              group_id: g.id,
              user_id: other.user_id,
              session: systemSession,
            }),
          ).resolves.toBeUndefined();

          const { rows } = await pool.query(
            'SELECT user_id FROM planner.group_members WHERE group_id = $1 AND user_id = $2',
            [g.id, other.user_id],
          );
          expect(rows).toHaveLength(0);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
