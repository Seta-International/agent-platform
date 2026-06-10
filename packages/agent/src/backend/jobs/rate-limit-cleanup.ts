import { getPool } from '@seta/shared-db';
import type { TaskList } from 'graphile-worker';
import { retryLifecycleEvent } from './lifecycle-retry.ts';

export async function cleanupExpiredRateLimitBuckets(): Promise<void> {
  await getPool('worker').query(`
    DELETE FROM agent.rate_limits
     WHERE window_start < now() - interval '90 seconds'
  `);
}

export const agentJobs: TaskList = {
  agent_rate_limits_cleanup: async () => {
    await cleanupExpiredRateLimitBuckets();
  },
  agent_lifecycle_retry: async (payload) => {
    await retryLifecycleEvent(payload as Record<string, unknown>);
  },
};
