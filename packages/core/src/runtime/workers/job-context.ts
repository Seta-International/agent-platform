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
 * Branch 3 exists so jobs that never touch the database (e.g. S3-only cleanup) can
 * simply run, without a second allowlist of "jobs that need no tenant" that would
 * silently go stale as new tenantless jobs are added. It is meant to be a fail-closed
 * backstop — a job that *should* have been scoped but lost its tenant_id hitting
 * `executorPool()` and getting a loud `ExecutorContextError`. That backstop is not
 * live yet: every module db client still calls the deprecated `getPool()`, not
 * `executorPool()`, so today a tenantless job that reads an RLS-enabled table gets a
 * silent zero-row result instead. It becomes real once PR2/PR3 point module db
 * clients at `executorPool()`.
 */
export function wrapJob(name: string, task: Task): Task {
  return async (payload, helpers) => {
    if (MAINTENANCE_JOBS.has(name)) {
      return maintenance(async () => {
        await task(payload, helpers);
      });
    }
    const tenantId = (payload as { tenant_id?: unknown } | null)?.tenant_id;
    // An empty/whitespace-only string is not a tenant: pinning a connection with a
    // meaningless GUC would satisfy the `typeof === 'string'` check while still
    // leaving the job with no real tenant isolation. Fall through to branch 3.
    if (typeof tenantId === 'string' && tenantId.trim() !== '') {
      return scoped(tenantId, async () => {
        await task(payload, helpers);
      });
    }
    return task(payload, helpers);
  };
}
