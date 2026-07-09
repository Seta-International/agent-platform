import { AsyncLocalStorage } from 'node:async_hooks';
import type { Pool, PoolClient } from 'pg';
import { TENANT_GUC } from './rls.ts';

// Per-request tenant binding for the RLS-enforced web pool. The web role
// (seta_app) is NOBYPASSRLS, so every read must run on a connection whose
// `app.tenant_id` GUC is set or the tenant_isolation policy hides all rows.
// A request pins one connection (GUC set) in this ALS; the tenant-aware pool
// facade routes that request's queries/transactions to it. Writes go through
// the worker pool (admin, RLS-bypass) and are unaffected.
const pinned = new AsyncLocalStorage<PoolClient>();

let realWebPool: Pool | null = null;
export function bindWebPool(pool: Pool): void {
  realWebPool = pool;
}

/** Pool facade: routes to the request-pinned client when present, else the pool. */
export function makeTenantAwarePool(pool: Pool): Pool {
  return new Proxy(pool, {
    get(target, prop, receiver) {
      if (prop === 'query') {
        return (...args: unknown[]) => {
          const client = pinned.getStore();
          return (client ?? target).query(...(args as Parameters<Pool['query']>));
        };
      }
      if (prop === 'connect') {
        return () => {
          const client = pinned.getStore();
          if (!client) return target.connect();
          // Reuse the pinned client for drizzle transactions; neuter release()
          // so the request-scoped connection survives drizzle's per-tx release.
          return Promise.resolve(
            new Proxy(client, {
              get(t, p) {
                if (p === 'release') return () => {};
                const v = Reflect.get(t, p);
                return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(t) : v;
              },
            }),
          );
        };
      }
      const v = Reflect.get(target, prop, receiver);
      return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(target) : v;
    },
  }) as Pool;
}

/** The request-pinned client ALS. Exported for executor.ts; not part of the public surface. */
export function pinnedClient(): PoolClient | undefined {
  return pinned.getStore();
}

/** Acquire a connection from the app pool, set the tenant GUC, pin it for `fn`. */
export async function pinTenantConnection<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  if (!realWebPool) return fn(); // pools not initialised (tests/tools): no-op
  const client = await realWebPool.connect();
  try {
    await client.query('SELECT set_config($1, $2, false)', [TENANT_GUC, tenantId]);
    return await pinned.run(client, fn);
  } finally {
    try {
      await client.query('RESET ALL');
    } catch {
      /* connection may be broken; release regardless */
    }
    client.release();
  }
}

/** @deprecated use `scoped()` from executor.ts. Kept until PR4. */
export async function runRequestTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  return pinTenantConnection(tenantId, fn);
}
