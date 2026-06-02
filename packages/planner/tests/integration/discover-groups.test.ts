import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { createGroup, discoverGroups } from '../../src/index.ts';
import { buildSession, seedTenant } from '../helpers.ts';

describe('discoverGroups', () => {
  it('returns public groups matching the query, excludes private groups', async () => {
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
          const session = seeded.adminSession;

          await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'Engineering All',
            visibility: 'public',
            session,
          });
          await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'Engineering Secret',
            visibility: 'private',
            session,
          });
          await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'Marketing Public',
            visibility: 'public',
            session,
          });

          const outsider = await import('@seta/identity').then((m) =>
            m.createUser(
              {
                tenant_id: seeded.tenant_id,
                email: `outsider-${crypto.randomUUID().slice(0, 8)}@test.com`,
                name: 'Outsider',
                password: 'pass',
              },
              { type: 'cli', user_id: null },
            ),
          );
          const outsiderSession = buildSession({
            tenant_id: seeded.tenant_id,
            user_id: outsider.user_id,
            accessible_group_ids: [],
            roles: ['planner.viewer'],
          });

          const results = await discoverGroups({ q: 'engineering', session: outsiderSession });

          expect(results).toHaveLength(1);
          expect(results[0]?.name).toBe('Engineering All');
          expect(results[0]?.member_count).toBeGreaterThanOrEqual(1);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('returns empty array when query matches nothing', async () => {
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
          const results = await discoverGroups({ q: 'zzznomatch', session: seeded.adminSession });
          expect(results).toHaveLength(0);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
