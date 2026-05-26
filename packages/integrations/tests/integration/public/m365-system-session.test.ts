import { resetCoreDb } from '@seta/core/testing';
import { markGroupSyncStatus } from '@seta/planner';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { resetIntegrationsDb } from '../../../src/backend/db/client.ts';
import { buildSystemSession } from '../../../src/backend/m365/system-session.ts';

describe('system session — markGroupSyncStatus end-to-end', () => {
  it('system session can mark sync status for a linked group on the tenant', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        resetIntegrationsDb();
        initPools({ databaseUrl });
        try {
          const tenantId = crypto.randomUUID();
          await pool.query(
            `INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'Test Org', $2)`,
            [tenantId, `test-${tenantId.slice(0, 8)}`],
          );

          // Seed a planner group that is already linked to M365 (external_source = 'm365').
          // Using raw SQL avoids a dependency on @seta/identity just for seeding a user.
          const groupId = crypto.randomUUID();
          const systemUserId = '00000000-0000-0000-0000-000000000000';
          await pool.query(
            `INSERT INTO planner.groups
               (id, tenant_id, name, external_source, external_id, created_by)
             VALUES ($1, $2, 'Linked Group', 'm365', 'ext-abc', $3)`,
            [groupId, tenantId, systemUserId],
          );

          const session = buildSystemSession(tenantId);
          const ts = new Date().toISOString();

          await expect(
            markGroupSyncStatus({ group_id: groupId, external_synced_at: ts, session }),
          ).resolves.toBeUndefined();

          const { rows } = await pool.query(
            `SELECT external_synced_at FROM planner.groups WHERE id = $1`,
            [groupId],
          );
          expect(rows[0].external_synced_at).not.toBeNull();
        } finally {
          resetCoreDb();
          resetIntegrationsDb();
          await closePools();
        }
      },
    );
  });
});
