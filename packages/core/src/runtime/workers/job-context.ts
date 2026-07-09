import { maintenance, scoped } from '@seta/shared-db';
import type { Task } from 'graphile-worker';

/**
 * The only jobs permitted to run with admin privilege and no tenant GUC: each one
 * legitimately spans every tenant. Adding a name here is a security decision and
 * requires a T3 review.
 */
export const MAINTENANCE_JOBS: ReadonlySet<string> = new Set([
  'partition_manager_tick',
  'retention_tick',
  'subscription_dlq_alerter',
]);

/** Wrap a graphile-worker task so it always runs inside an executor context. */
export function wrapJob(name: string, task: Task): Task {
  return async (payload, helpers) => {
    if (MAINTENANCE_JOBS.has(name)) {
      return maintenance(async () => {
        await task(payload, helpers);
      });
    }
    const tenantId = (payload as { tenant_id?: unknown } | null)?.tenant_id;
    if (typeof tenantId !== 'string') {
      throw new Error(
        `job "${name}" has no tenant_id in its payload and is not a sanctioned maintenance job`,
      );
    }
    return scoped(tenantId, async () => {
      await task(payload, helpers);
    });
  };
}
