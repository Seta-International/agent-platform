import { AsyncLocalStorage } from 'node:async_hooks';
import type { Pool, PoolClient } from 'pg';
import { TENANT_GUC } from './rls.ts';

// Per-request tenant binding for the RLS-enforced web pool. The web role
// (seta_app) is NOBYPASSRLS, so every read must run on a connection whose
// `app.tenant_id` GUC is set or the tenant_isolation policy hides all rows.
// A request binds a tenant (not yet a connection) in this ALS; the tenant-aware
// pool facade acquires a connection from the app pool on first use and pins it
// for the rest of the scope. Writes go through the worker pool (admin,
// RLS-bypass) and are unaffected.
interface TenantBinding {
  readonly tenantId: string;
  /** Memoised so concurrent queries in one scope share one connection — `??=` on the
   * promise (not the resolved client) closes the race where two queries issued
   * without an await between them would otherwise both see no client yet and each
   * call pool.connect(), splitting one logical scope across two connections with
   * two different session GUCs (and a Drizzle transaction could straddle both). */
  clientPromise: Promise<PoolClient> | null;
}

const binding = new AsyncLocalStorage<TenantBinding>();

/** pg-pool only keeps an 'error' listener on a client while it sits idle in the pool.
 * For the life of a scope the client is checked out and has none, so a socket error —
 * a killed backend, a pool ended by a racing shutdown — is an unhandled 'error' event
 * and takes the whole process down. Hold one for the checkout's duration. */
const swallowClientError = (): void => {};

async function acquire(b: TenantBinding, pool: Pool): Promise<PoolClient> {
  b.clientPromise ??= (async () => {
    const client = await pool.connect();
    client.on('error', swallowClientError);
    await client.query('SELECT set_config($1, $2, false)', [TENANT_GUC, b.tenantId]);
    return client;
  })();
  return b.clientPromise;
}

type WebPoolState = 'uninitialised' | 'live' | 'closed';

let webPoolState: WebPoolState = 'uninitialised';

/** initPools() calls this once the web pool exists. */
export function bindWebPool(): void {
  webPoolState = 'live';
}

/** closePools() calls this. A later initPools() re-binds via bindWebPool(). */
export function unbindWebPool(): void {
  webPoolState = 'closed';
}

/** Pool facade: routes to the scope-bound tenant connection (acquired on first use)
 * when present, else the pool. */
export function makeTenantAwarePool(pool: Pool): Pool {
  return new Proxy(pool, {
    get(target, prop, receiver) {
      if (prop === 'query') {
        return async (...args: unknown[]) => {
          const b = binding.getStore();
          const client = b ? await acquire(b, target) : target;
          return client.query(...(args as Parameters<Pool['query']>));
        };
      }
      if (prop === 'connect') {
        return async () => {
          const b = binding.getStore();
          if (!b) return target.connect();
          const client = await acquire(b, target);
          // Reuse the scope's connection for drizzle transactions; neuter release()
          // so the request-scoped connection survives drizzle's per-tx release.
          return new Proxy(client, {
            get(t, p) {
              if (p === 'release') return () => {};
              const v = Reflect.get(t, p);
              return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(t) : v;
            },
          });
        };
      }
      const v = Reflect.get(target, prop, receiver);
      return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(target) : v;
    },
  }) as Pool;
}

/** Acquire a connection from the app pool on first use, pin it to `tenantId` for `fn`. */
export async function pinTenantConnection<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  // Never initialised (unit tests, CLI tools): running unpinned is intended.
  // Initialised then closed: running unpinned would silently drop tenant isolation.
  if (webPoolState === 'uninitialised') return fn();
  if (webPoolState === 'closed') {
    throw new Error('pinTenantConnection called after closePools.');
  }
  const b: TenantBinding = { tenantId, clientPromise: null };
  try {
    return await binding.run(b, fn);
  } finally {
    if (b.clientPromise) {
      // If acquisition itself failed, there's nothing to release — swallow so fn's
      // rejection (the real error) propagates instead of this finally's.
      const client = await b.clientPromise.catch(() => null);
      if (client) {
        try {
          // RESET ALL clears GUCs but leaves prepared statements on the connection, so a
          // later scope reusing it can hit a stale plan under a colliding statement name.
          await client.query('DISCARD ALL');
          client.off('error', swallowClientError);
          client.release();
        } catch {
          // Open/aborted transaction or a broken socket: the connection cannot be cleaned,
          // so destroy it rather than return a dirty one to the pool. The listener stays
          // attached — destroying it is what may surface the socket error. release() on an
          // already-ended pool throws, and this runs in a `finally`, so it must not escape.
          try {
            client.release(true);
          } catch {
            // Nothing left to reclaim; fn's own error (if any) is the one that matters.
          }
        }
      }
    }
  }
}

/** @deprecated use `scoped()` from executor.ts. Kept until PR4. */
export async function runRequestTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  return pinTenantConnection(tenantId, fn);
}
