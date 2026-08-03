import type { EncryptedBlob } from '@seta/shared-crypto';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { describe, expect, it, vi } from 'vitest';
import type * as schema from '../../src/backend/db/schema/index.ts';
import { m365TenantConfig } from '../../src/backend/db/schema/index.ts';
import { listDirectoryTenantIds } from '../../src/backend/m365/directory/tenants.ts';
import { runDirectoryPullCron } from '../../src/backend/m365/jobs/directory-pull-cron.ts';
import { withIntegrationsTestDb } from '../helpers/test-db.ts';

const TENANT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TENANT_OFF = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

async function seedConfig(
  db: NodePgDatabase<typeof schema>,
  tenantId: string,
  enabled: boolean,
): Promise<void> {
  await db.insert(m365TenantConfig).values({
    tenantId,
    entraTenantId: '22222222-2222-4222-8222-222222222222',
    clientId: 'client-id',
    // Never decrypted: the cron only reads tenant ids, it never builds a Graph client.
    clientSecretBlob: {
      v: 1,
      alg: 'aes-256-gcm',
      iv: '',
      ct: '',
      tag: '',
    } as unknown as EncryptedBlob,
    createdBy: SYSTEM_USER_ID,
    updatedBy: SYSTEM_USER_ID,
    enabled,
  });
}

describe('m365.directory.pull-cron', () => {
  it('no M365-configured tenant → no enqueues', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      const addJob = vi.fn().mockResolvedValue(undefined);

      const result = await runDirectoryPullCron({
        listTenantIds: () => listDirectoryTenantIds(db),
        addJob,
      });

      expect(result.enqueued).toBe(0);
      expect(addJob).not.toHaveBeenCalled();
    });
  });

  it('one job per enabled tenant, with a per-tenant jobKey so overlapping runs collapse', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      await seedConfig(db, TENANT_A, true);
      await seedConfig(db, TENANT_B, true);
      // A disabled config is not an M365-enabled tenant: pulling it would build a Graph client
      // against credentials the admin deliberately switched off.
      await seedConfig(db, TENANT_OFF, false);

      const addJob = vi.fn().mockResolvedValue(undefined);
      const result = await runDirectoryPullCron({
        listTenantIds: () => listDirectoryTenantIds(db),
        addJob,
      });

      expect(result.enqueued).toBe(2);
      expect(addJob).toHaveBeenCalledTimes(2);

      const byTenant = new Map(
        addJob.mock.calls.map((call) => [(call[1] as { tenant_id: string }).tenant_id, call]),
      );
      expect([...byTenant.keys()].sort()).toEqual([TENANT_A, TENANT_B].sort());

      const callA = byTenant.get(TENANT_A);
      expect(callA?.[0]).toBe('m365.directory.pull');
      // The nightly run is incremental — only the admin route resets the cursor (§10).
      expect(callA?.[1]).toEqual({ tenant_id: TENANT_A, full: false });
      expect(callA?.[2]).toEqual({ jobKey: `m365.directory.pull:${TENANT_A}` });

      expect(byTenant.get(TENANT_OFF)).toBeUndefined();
    });
  });
});
