import type { EncryptedBlob } from '@seta/shared-crypto';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { runMigrations as runGraphileMigrations } from 'graphile-worker';
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
  // The cron and the admin `POST /directory/sync` route share a per-tenant jobKey so two pulls of
  // one directory can never run concurrently. That collapse is only safe in one direction: an
  // admin asking for `full: true` must survive until it runs. Under graphile-worker's default
  // 'replace', the 02:30 tick would overwrite a queued admin full sync with its own `full: false`
  // payload — the reset-the-cursor request would vanish with no error anywhere.
  it('asks for unsafe_dedupe so it cannot overwrite an admin full sync that is already queued', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      await seedConfig(db, TENANT_A, true);
      const addJob = vi.fn().mockResolvedValue(undefined);

      await runDirectoryPullCron({ listTenantIds: () => listDirectoryTenantIds(db), addJob });

      expect(addJob).toHaveBeenCalledTimes(1);
      expect(addJob.mock.calls[0]?.[2]).toMatchObject({ jobKeyMode: 'unsafe_dedupe' });
    });
  });

  // Pins the graphile-worker semantics the mode above relies on, so an upgrade that changed them
  // fails here rather than silently reinstating the overwrite.
  it('unsafe_dedupe leaves a queued job untouched, where the default replaces its payload', async () => {
    await withIntegrationsTestDb(async ({ pool }) => {
      await runGraphileMigrations({ pgPool: pool });
      const jobKey = `m365.directory.pull:${TENANT_A}`;
      const add = (full: boolean, mode: string) =>
        pool.query(
          `SELECT graphile_worker.add_job(identifier => $1, payload => $2::json,
             job_key => $3, job_key_mode => $4)`,
          ['m365.directory.pull', JSON.stringify({ tenant_id: TENANT_A, full }), jobKey, mode],
        );
      // graphile-worker 0.17's public `jobs` view deliberately omits `payload`, so the assertion
      // has to read `_private_jobs`. That coupling is the point of this test: if an upgrade moves
      // the table, this fails loudly instead of the mode quietly regressing.
      const storedFull = async (): Promise<boolean> => {
        const { rows } = await pool.query<{ full: boolean }>(
          `SELECT (payload ->> 'full')::boolean AS full FROM graphile_worker._private_jobs
            WHERE key = $1`,
          [jobKey],
        );
        return rows[0]?.full as boolean;
      };

      // An admin queues a full sync; the nightly tick then fires before it runs.
      await add(true, 'replace');
      await add(false, 'unsafe_dedupe');
      expect(await storedFull()).toBe(true);

      // The other direction still works: an admin supersedes a queued nightly run.
      await add(true, 'replace');
      expect(await storedFull()).toBe(true);
    });
  });

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
      expect(callA?.[2]).toEqual({
        jobKey: `m365.directory.pull:${TENANT_A}`,
        jobKeyMode: 'unsafe_dedupe',
      });

      expect(byTenant.get(TENANT_OFF)).toBeUndefined();
    });
  });
});
