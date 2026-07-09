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

/**
 * Wrap a graphile-worker task in the right executor context, three-way:
 *
 *  1. Sanctioned maintenance job (`MAINTENANCE_JOBS`) -> `maintenance()`, admin pool.
 *  2. Payload carries a `tenant_id` string -> `scoped(tenantId, ...)`, app pool + RLS GUC.
 *  3. Neither -> run with no executor context at all.
 *
 * Branch 3 is not a hole: it's the fail-closed backstop. Jobs that never touch the
 * database (e.g. S3-only cleanup) simply run; jobs that *should* have been scoped but
 * lost their tenant_id will hit `executorPool()` on their first DB call and get
 * `ExecutorContextError` ("no executor context: wrap this call in scoped(tenantId, fn)
 * or maintenance(fn)"). That's a louder, more accurate failure than throwing here ever
 * was, and it doesn't require a second allowlist of "jobs that need no tenant" that
 * would silently go stale as new tenantless jobs are added.
 */
export function wrapJob(name: string, task: Task): Task {
  return async (payload, helpers) => {
    if (MAINTENANCE_JOBS.has(name)) {
      return maintenance(async () => {
        await task(payload, helpers);
      });
    }
    const tenantId = (payload as { tenant_id?: unknown } | null)?.tenant_id;
    if (typeof tenantId === 'string') {
      return scoped(tenantId, async () => {
        await task(payload, helpers);
      });
    }
    return task(payload, helpers);
  };
}
