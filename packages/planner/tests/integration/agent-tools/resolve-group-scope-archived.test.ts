import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { resolveGroupScope } from '../../../src/backend/agent-tools/resolve-scope.ts';
import { createGroup, deleteGroup } from '../../../src/index.ts';
import { makeMemberSession, seedTenant } from '../../helpers.ts';

function testDbOpts() {
  return {
    templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
    baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
  };
}

describe('resolveGroupScope and archived groups (FUT-832 AC3)', () => {
  it('reports a name match on an archived group as archived, not as not-found', async () => {
    await withTestDb(testDbOpts(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool);
        const admin = seeded.adminSession;
        const gone = await createGroup({
          tenant_id: seeded.tenant_id,
          name: 'Helios Migration',
          session: admin,
        });
        const member = await makeMemberSession(pool, {
          tenant_id: seeded.tenant_id,
          group_id: gone.id,
          role: 'member',
        });
        await deleteGroup({ group_id: gone.id, expected_version: gone.version, session: admin });

        const resolved = await resolveGroupScope(member, { groupName: 'Helios' });

        expect(resolved).toEqual({ archived: true, id: gone.id, name: 'Helios Migration' });
      } finally {
        await closePools();
      }
    });
  });

  it('reports an archived group looked up by id as archived, admin included', async () => {
    await withTestDb(testDbOpts(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool);
        const admin = seeded.adminSession;
        const gone = await createGroup({
          tenant_id: seeded.tenant_id,
          name: 'Helios Migration',
          session: admin,
        });
        await deleteGroup({ group_id: gone.id, expected_version: gone.version, session: admin });

        const resolved = await resolveGroupScope(admin, { groupId: gone.id });

        expect(resolved).toEqual({ archived: true, id: gone.id, name: 'Helios Migration' });
      } finally {
        await closePools();
      }
    });
  });
});
