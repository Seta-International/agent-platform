import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools, scoped } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { plannerDb } from '../../../src/backend/db/index.ts';
import { groupMembers, groups } from '../../../src/backend/db/schema.ts';
import { resolveGroupMemberIds } from '../../../src/backend/domain/recipients.ts';

const dbEnv = () => ({
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
});

describe('resolveGroupMemberIds', () => {
  it('returns all members of the group', async () => {
    await withTestDb(dbEnv(), async ({ databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const tenantId = crypto.randomUUID();

        // No appDatabaseUrl here, so scoped()'s tenant GUC is inert (self-host
        // fallback) — this only opens the executor context plannerDb() requires.
        await scoped(tenantId, async () => {
          const groupId = crypto.randomUUID();
          const createdBy = crypto.randomUUID();
          await plannerDb().insert(groups).values({
            id: groupId,
            tenant_id: tenantId,
            name: 'Test Group',
            created_by: createdBy,
          });
          const u1 = crypto.randomUUID();
          const u2 = crypto.randomUUID();
          const u3 = crypto.randomUUID();
          await plannerDb()
            .insert(groupMembers)
            .values([
              { tenant_id: tenantId, group_id: groupId, user_id: u1, role: 'owner', added_by: u1 },
              {
                tenant_id: tenantId,
                group_id: groupId,
                user_id: u2,
                role: 'member',
                added_by: u1,
              },
              {
                tenant_id: tenantId,
                group_id: groupId,
                user_id: u3,
                role: 'member',
                added_by: u1,
              },
            ]);
          const ids = await resolveGroupMemberIds(tenantId, groupId, plannerDb());
          expect(ids.sort()).toEqual([u1, u2, u3].sort());
        });
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('returns empty array when group has no members', async () => {
    await withTestDb(dbEnv(), async ({ databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const tenantId = crypto.randomUUID();

        // No appDatabaseUrl here, so scoped()'s tenant GUC is inert (self-host
        // fallback) — this only opens the executor context plannerDb() requires.
        await scoped(tenantId, async () => {
          const groupId = crypto.randomUUID();
          const createdBy = crypto.randomUUID();
          await plannerDb().insert(groups).values({
            id: groupId,
            tenant_id: tenantId,
            name: 'Empty Group',
            created_by: createdBy,
          });
          const ids = await resolveGroupMemberIds(tenantId, groupId, plannerDb());
          expect(ids).toEqual([]);
        });
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });
});
