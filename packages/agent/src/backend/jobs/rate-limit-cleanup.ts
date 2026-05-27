import { getPool } from '@seta/shared-db';
import type { TaskList } from 'graphile-worker';

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
};
