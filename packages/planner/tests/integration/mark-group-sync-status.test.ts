import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import {
  createGroup,
  linkGroupToM365,
  markGroupSyncStatus,
  type PlannerSessionScope,
} from '../../src/index.ts';
import { countEvents, seedTenant } from '../helpers.ts';

describe('markGroupSyncStatus', () => {
  it('updates external_synced_at and emits no group.updated event', async () => {
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
          const beforeCount = await countEvents(pool, seeded.tenant_id, 'planner.group.updated');
          const ts = new Date().toISOString();
          const systemSession: PlannerSessionScope = {
            ...seeded.adminSession,
            actor: { kind: 'system', system_id: 'integrations.m365' },
          };
          await markGroupSyncStatus({
            group_id: g.id,
            external_synced_at: ts,
            session: systemSession,
          });
          const afterCount = await countEvents(pool, seeded.tenant_id, 'planner.group.updated');
          expect(afterCount).toBe(beforeCount);

          const row = await pool.query(
            'SELECT external_synced_at, version FROM planner.groups WHERE id = $1',
            [g.id],
          );
          expect(row.rows[0].external_synced_at).not.toBeNull();
          // version is NOT bumped by markGroupSyncStatus
          expect(row.rows[0].version).toBe(2);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('rejects FORBIDDEN when called by non-system actor', async () => {
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
            markGroupSyncStatus({
              group_id: g.id,
              external_synced_at: new Date().toISOString(),
              session: seeded.adminSession,
            }),
          ).rejects.toMatchObject({ code: 'FORBIDDEN' });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
