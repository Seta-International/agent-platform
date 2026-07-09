import {
  bindExecutorPools,
  currentExecutorMode,
  ExecutorContextError,
  executorPool,
} from '@seta/shared-db';
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

  it('runs a job with no tenant_id and no maintenance entry outside any executor context', async () => {
    let mode: string | undefined = 'unset';
    const job = wrapJob('chat_attachment_delete', async () => {
      mode = currentExecutorMode();
    });
    await job({ s3_key: 'k' }, {} as never);
    expect(mode).toBeUndefined();
  });

  it('treats an empty or whitespace-only tenant_id as absent, not a scoped tenant', async () => {
    let mode: string | undefined = 'unset';
    const job = wrapJob('mailer:send', async () => {
      mode = currentExecutorMode();
    });
    await job({ tenant_id: '   ' }, {} as never);
    expect(mode).toBeUndefined();
  });

  it('lets the executorPool() backstop reject a DB call made with no context', async () => {
    const job = wrapJob('chat_attachment_delete', async () => {
      executorPool();
    });
    await expect(job({ s3_key: 'k' }, {} as never)).rejects.toThrow(ExecutorContextError);
  });

  it('sanctions exactly the three cross-tenant built-ins', () => {
    expect([...MAINTENANCE_JOBS].sort()).toEqual([
      'partition_manager_tick',
      'retention_tick',
      'subscription_dlq_alerter',
    ]);
  });
});
