import { executorPool } from '@seta/shared-db';
import type { TaskList } from 'graphile-worker';
import type { Pool } from 'pg';
import { retryLifecycleEvent } from './lifecycle-retry.ts';

/**
 * Deletes expired rate-limit windows. Also wired as the `agent.rate_limits`
 * lifecycle custom policy (see register.ts) — the retention runner passes its
 * own pool; callers outside retention omit it and resolve the executor's, which
 * requires an active context.
 */
export async function cleanupExpiredRateLimitBuckets(pool: Pool = executorPool()): Promise<void> {
  await pool.query(`
    DELETE FROM agent.rate_limits
     WHERE window_start < now() - interval '90 seconds'
  `);
}

export const agentJobs: TaskList = {
  agent_lifecycle_retry: async (payload) => {
    await retryLifecycleEvent(payload as Record<string, unknown>);
  },
};
