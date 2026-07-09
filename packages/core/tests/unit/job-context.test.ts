import { bindExecutorPools, currentExecutorMode } from '@seta/shared-db';
import type { Pool } from 'pg';
import { beforeEach, describe, expect, it } from 'vitest';
import { MAINTENANCE_JOBS, wrapJob } from '../../src/runtime/workers/job-context.ts';

const TENANT = '11111111-1111-1111-1111-111111111111';
const fake = {} as unknown as Pool;

beforeEach(() => {
  bindExecutorPools(
    () => fake,
    () => fake,
  );
});

describe('wrapJob', () => {
  it('runs a tenant job in the scoped context', async () => {
    let mode: string | undefined;
    const job = wrapJob('mailer:send', async () => {
      mode = currentExecutorMode();
    });
    await job({ tenant_id: TENANT }, {} as never);
    expect(mode).toBe('scoped');
  });

  it('runs a maintenance job in the maintenance context', async () => {
    let mode: string | undefined;
    const job = wrapJob('retention_tick', async () => {
      mode = currentExecutorMode();
    });
    await job({}, {} as never);
    expect(mode).toBe('maintenance');
  });

  it('rejects a non-maintenance job with no tenant_id rather than silently elevating', async () => {
    const job = wrapJob('mailer:send', async () => {});
    await expect(job({}, {} as never)).rejects.toThrow(/tenant_id/);
  });

  it('sanctions exactly the three cross-tenant built-ins', () => {
    expect([...MAINTENANCE_JOBS].sort()).toEqual([
      'partition_manager_tick',
      'retention_tick',
      'subscription_dlq_alerter',
    ]);
  });
});
