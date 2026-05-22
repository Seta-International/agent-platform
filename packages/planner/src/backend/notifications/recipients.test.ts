import { resetCoreDb } from '@seta/core/internal/test-support';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { plannerDb } from '../../db/index.ts';
import { groupMembers, groups } from '../../db/schema.ts';
import { resolveGroupMemberIds } from './recipients.ts';

const dbEnv = () => ({
  templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.SETA_TEST_PG_BASE as string,
});

describe('resolveGroupMemberIds', () => {
  it('returns all members of the group', async () => {
    await withTestDb(dbEnv(), async ({ databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const tenantId = crypto.randomUUID();
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
            { group_id: groupId, user_id: u1, role: 'owner', added_by: u1 },
            { group_id: groupId, user_id: u2, role: 'member', added_by: u1 },
            { group_id: groupId, user_id: u3, role: 'member', added_by: u1 },
          ]);
        const ids = await resolveGroupMemberIds(tenantId, groupId, plannerDb());
        expect(ids.sort()).toEqual([u1, u2, u3].sort());
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
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });
});
