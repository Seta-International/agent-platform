import { getPool } from '@seta/shared-db';
import type { TaskList } from 'graphile-worker';

export async function cleanupExpiredRateLimitBuckets(): Promise<void> {
  await getPool('worker').query(`
    DELETE FROM copilot.rate_limits
     WHERE window_start < now() - interval '90 seconds'
  `);
}

export const copilotJobs: TaskList = {
  copilot_rate_limits_cleanup: async () => {
    await cleanupExpiredRateLimitBuckets();
  },
};
