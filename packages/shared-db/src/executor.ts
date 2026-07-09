import { AsyncLocalStorage } from 'node:async_hooks';
import type { Pool } from 'pg';
import { pinTenantConnection } from './request-tenant.ts';

/**
 * Thrown when module code reaches for a connection outside an executor context.
 * This is the fail-closed half of the design: a job or workflow whose entry point
 * was never wrapped dies here on its first query, rather than silently running as
 * a BYPASSRLS superuser.
 */
export class ExecutorContextError extends Error {
  constructor() {
    super(
      'no executor context: wrap this call in scoped(tenantId, fn) or maintenance(fn). ' +
        'Only apps/server and apps/worker may open one.',
    );
    this.name = 'ExecutorContextError';
  }
}

export type ExecutorMode = 'scoped' | 'maintenance';

const modeCtx = new AsyncLocalStorage<ExecutorMode>();

let appPool: (() => Pool) | null = null;
let adminPool: (() => Pool) | null = null;

/** Called once by initPools(). Avoids an import cycle between pools.ts and executor.ts. */
export function bindExecutorPools(app: () => Pool, admin: () => Pool): void {
  appPool = app;
  adminPool = admin;
}

export function currentExecutorMode(): ExecutorMode | undefined {
  return modeCtx.getStore();
}

/** The pool for the active context. Module db clients call this and nothing else. */
export function executorPool(): Pool {
  const mode = modeCtx.getStore();
  if (!mode) throw new ExecutorContextError();
  const resolve = mode === 'maintenance' ? adminPool : appPool;
  if (!resolve) throw new Error('executorPool called before initPools.');
  return resolve();
}

/** Shared "called before initPools" guard for the bound admin resolver. */
function resolveAdminPool(): Pool {
  if (!adminPool) throw new Error('executorPool called before initPools.');
  return adminPool();
}

/**
 * Run `fn` against the app role (NOBYPASSRLS) on a connection pinned to `tenantId`.
 * Every tenant-bound path uses this: HTTP requests, subscriber handlers, tenant jobs,
 * agent workflows.
 */
export async function scoped<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  return pinTenantConnection(tenantId, () => modeCtx.run('scoped', fn));
}

/**
 * Run `fn` against the admin role with no tenant GUC. Legitimate uses are exactly four:
 * core retention, the events partition-manager, the mailer scan, and knowledge's
 * per-tenant chunk partition DDL (which needs CREATE, and seta_app lacks it).
 * Any other call site is a bug.
 */
export async function maintenance<T>(fn: () => Promise<T>): Promise<T> {
  // Unlike scoped(), which must still no-op when pools were never initialised (unit
  // tests and CLI tools rely on that), maintenance() has no such contract — resolve
  // eagerly so a torn-down or unbound admin pool fails here, before `fn` runs, rather
  // than only when `fn` happens to reach for a connection.
  resolveAdminPool();
  return modeCtx.run('maintenance', fn);
}
