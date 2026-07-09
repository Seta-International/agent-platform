import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools, scoped } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { createGroup, createJoinRequest, discoverGroups } from '../../src/index.ts';
import { buildSession, seedTenant } from '../helpers.ts';

const dbCfg = () => ({
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
});

async function makeOutsider(tenantId: string) {
  const created = await import('@seta/identity').then((m) =>
    m.createUser(
      {
        tenant_id: tenantId,
        email: `outsider-${crypto.randomUUID().slice(0, 8)}@test.com`,
        name: 'Outsider',
        password: 'pass',
      },
      { type: 'cli', user_id: null },
    ),
  );
  return buildSession({
    tenant_id: tenantId,
    user_id: created.user_id,
    roles: ['planner.viewer'],
  });
}

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

          // No appDatabaseUrl here, so scoped()'s tenant GUC is inert (self-host
          // fallback) — this only opens the executor context plannerDb() requires.
          await scoped(seeded.tenant_id, async () => {
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
              roles: ['planner.viewer'],
            });

            const results = await discoverGroups({ q: 'engineering', session: outsiderSession });

            expect(results).toHaveLength(1);
            expect(results[0]?.name).toBe('Engineering All');
            expect(results[0]?.member_count).toBeGreaterThanOrEqual(1);
          });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('flags groups the viewer already belongs to (FUT-44)', async () => {
    await withTestDb(dbCfg(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool);
        // No appDatabaseUrl here, so scoped()'s tenant GUC is inert (self-host
        // fallback) — this only opens the executor context plannerDb() requires.
        await scoped(seeded.tenant_id, async () => {
          // The creator (admin) is added as a member of the group.
          await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'Owners Club',
            visibility: 'public',
            session: seeded.adminSession,
          });

          const adminResults = await discoverGroups({
            q: 'Owners Club',
            session: seeded.adminSession,
          });
          expect(adminResults[0]?.is_member).toBe(true);
          expect(adminResults[0]?.has_pending_request).toBe(false);

          const outsiderSession = await makeOutsider(seeded.tenant_id);
          const outsiderResults = await discoverGroups({
            q: 'Owners Club',
            session: outsiderSession,
          });
          expect(outsiderResults[0]?.is_member).toBe(false);
          expect(outsiderResults[0]?.has_pending_request).toBe(false);
        });
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('flags groups the viewer has a pending join request for (FUT-44)', async () => {
    await withTestDb(dbCfg(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool);
        // No appDatabaseUrl here, so scoped()'s tenant GUC is inert (self-host
        // fallback) — this only opens the executor context plannerDb() requires.
        await scoped(seeded.tenant_id, async () => {
          const group = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'Joinable Team',
            visibility: 'public',
            session: seeded.adminSession,
          });

          const outsiderSession = await makeOutsider(seeded.tenant_id);
          await createJoinRequest({ group_id: group.id, session: outsiderSession });

          const results = await discoverGroups({ q: 'Joinable Team', session: outsiderSession });
          expect(results[0]?.has_pending_request).toBe(true);
          expect(results[0]?.is_member).toBe(false);
        });
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
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

          // No appDatabaseUrl here, so scoped()'s tenant GUC is inert (self-host
          // fallback) — this only opens the executor context plannerDb() requires.
          await scoped(seeded.tenant_id, async () => {
            const results = await discoverGroups({
              q: 'zzznomatch',
              session: seeded.adminSession,
            });
            expect(results).toHaveLength(0);
          });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
