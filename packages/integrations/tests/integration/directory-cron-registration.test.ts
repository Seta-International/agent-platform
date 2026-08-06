import { createContributionRegistry } from '@seta/core';
import { startWorkerPool } from '@seta/core/runtime';
import { resetCoreDb } from '@seta/core/testing';
import { parseCrontab } from 'graphile-worker';
import { describe, expect, it, vi } from 'vitest';
import { resetIntegrationsDb } from '../../src/backend/db/client.ts';
import { registerIntegrationsContributions } from '../../src/register.ts';
import { withIntegrationsTestDb } from '../helpers/test-db.ts';

const DIRECTORY_CRONTAB = '30 2 * * * m365_directory_pull_cron';

function buildRegistry() {
  const reg = createContributionRegistry();
  registerIntegrationsContributions(reg, {
    webhookSecret: 'test-secret',
    // Never used here: registration builds repos and closures, it decrypts nothing.
    cryptoSvc: {} as never,
    getWorkers: () => ({ addJob: vi.fn(), shutdown: vi.fn() }) as never,
  });
  return reg;
}

describe('integrations crontab contribution (design §10)', () => {
  it('contributes the nightly directory line alongside a task that can serve it', async () => {
    await withIntegrationsTestDb(async () => {
      resetCoreDb();
      resetIntegrationsDb();
      const reg = buildRegistry();

      expect([...reg.collected.crontabs]).toContainEqual({
        module: 'integrations',
        crontab: DIRECTORY_CRONTAB,
      });
      // graphile-worker never validates a crontab line against the task list: an entry with no
      // handler would enqueue a job every night that fails with "unsupported task identifier"
      // and retries forever. The two must be contributed together or not at all.
      expect(reg.collected.jobs.has('m365_directory_pull_cron')).toBe(true);
      expect(reg.collected.jobs.has('m365.directory.pull')).toBe(true);
    });
  });

  it('contributes no crontab when the M365 boot deps are absent, so no unservable line ships', async () => {
    await withIntegrationsTestDb(async () => {
      resetCoreDb();
      resetIntegrationsDb();
      const reg = createContributionRegistry();
      registerIntegrationsContributions(reg, {});

      expect([...reg.collected.crontabs]).toEqual([]);
      expect(reg.collected.jobs.has('m365_directory_pull_cron')).toBe(false);
    });
  });

  it('parses into a 02:30 cron item whose task is in the composed task list', async () => {
    await withIntegrationsTestDb(async () => {
      resetCoreDb();
      resetIntegrationsDb();
      const reg = buildRegistry();

      // Exactly how runtime/bootstrap.ts composes the field.
      const extraCrontab = reg.collected.crontabs.map((entry) => entry.crontab).join('\n');
      const items = parseCrontab(extraCrontab);

      expect(items).toHaveLength(1);
      expect(items[0]?.task).toBe('m365_directory_pull_cron');
      expect(items[0]?.match({ min: 30, hour: 2, date: 4, month: 8, dow: 2 })).toBe(true);
      expect(items[0]?.match({ min: 31, hour: 2, date: 4, month: 8, dow: 2 })).toBe(false);
      expect(reg.collected.jobs.has(items[0]?.task as string)).toBe(true);
    });
  });

  it("rejects a dotted cron task name — that is why the task is not called 'm365.directory.pull-cron'", () => {
    // graphile-worker's CRONTAB_COMMAND allows [_a-zA-Z][_a-zA-Z0-9:/_-]* only: a dot in the task
    // name makes the whole crontab unparseable, and startWorkerPool() surfaces that as a rejected
    // run() — the worker never boots. The fanned-out job keeps its dotted name because add_job
    // imposes no such restriction; only the crontab-invoked task is constrained.
    expect(() => parseCrontab('30 2 * * * m365.directory.pull-cron')).toThrow(
      /Invalid command specification/,
    );
  });

  it('is accepted by a real worker pool — the line reaches graphile-worker and is registered', async () => {
    await withIntegrationsTestDb(async ({ pool }) => {
      resetCoreDb();
      resetIntegrationsDb();
      const reg = buildRegistry();

      const workers = await startWorkerPool({
        pool,
        jobs: Object.fromEntries(reg.collected.jobs),
        extraCrontab: reg.collected.crontabs.map((entry) => entry.crontab).join('\n'),
      });
      try {
        // graphile-worker records every cron identifier it accepted at boot. A line it rejected,
        // or never received, leaves no row here — this is the end-to-end proof that the `crontab`
        // field on reg.module() is actually consumed (design §10: verify it early).
        const { rows } = await pool.query<{ identifier: string }>(
          'SELECT identifier FROM graphile_worker._private_known_crontabs ORDER BY identifier',
        );
        const identifiers = rows.map((row) => row.identifier);
        expect(identifiers).toContain('m365_directory_pull_cron');
        // The platform defaults still ship alongside it, so the module line is additive.
        expect(identifiers).toContain('partition_manager_tick');
      } finally {
        await workers.shutdown();
      }
    });
  }, 60_000);
});
