import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { createGroup, listGroups } from '../../src/index.ts';
import { buildSession, seedTenant } from '../helpers.ts';

describe('listGroups visibility', () => {
  it('AC-1: creator can see the group they created via their group membership', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const group = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'Creators Group',
            visibility: 'private',
            session: seeded.adminSession,
          });

          // Non-admin session — visibility comes from the creator's real planner.group_members row.
          const creatorSession = buildSession({
            tenant_id: seeded.tenant_id,
            user_id: seeded.adminSession.user_id,
            roles: ['planner.viewer'],
          });

          const groups = await listGroups({ session: creatorSession });
          expect(groups.map((g) => g.id)).toContain(group.id);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('AC-2: non-member cannot see a private group', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'Secret',
            visibility: 'private',
            session: seeded.adminSession,
          });

          const outsider = await import('@seta/identity').then((m) =>
            m.createUser(
              {
                tenant_id: seeded.tenant_id,
                email: `out-${crypto.randomUUID().slice(0, 8)}@t.com`,
                name: 'Out',
                password: 'pass',
              },
              { type: 'cli', user_id: null },
            ),
          );
          // Non-admin with no group membership — cannot see private groups
          const outsiderSession = buildSession({
            tenant_id: seeded.tenant_id,
            user_id: outsider.user_id,
            roles: ['planner.viewer'],
          });

          const groups = await listGroups({ session: outsiderSession });
          expect(groups.map((g) => g.name)).not.toContain('Secret');
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
