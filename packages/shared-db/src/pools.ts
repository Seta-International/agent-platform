import { Pool } from 'pg';
import { bindExecutorPools } from './executor.ts';
import { instrumentPool } from './instrumentation.ts';
import { bindWebPool, makeTenantAwarePool, unbindWebPool } from './request-tenant.ts';

export interface PoolsConfig {
  databaseUrl: string;
  appDatabaseUrl?: string;
  webMax?: number;
  workerMax?: number;
  mastraStateMax?: number;
  statementTimeoutMs?: number;
  log?: {
    warn: (obj: unknown, msg?: string) => void;
  };
}

export interface Pools {
  web: Pool;
  worker: Pool;
  mastraState: Pool;
}

let pools: Pools | null = null;
let webFacade: Pool | null = null;

function requirePools(): Pools {
  if (!pools) throw new Error('executorPool called before initPools.');
  return pools;
}

// Sizing formula (docs/hosting/aws.md §7):
//   max = floor(pg_max_connections / (server_tasks + worker_tasks)) − margin
//   Starter  (200 / 2 tasks) − 10 = ~90 headroom
//   Growth   (400 / 6 tasks) − 10 = ~57 headroom
//   Scale tier: introduce RDS Proxy instead of raising pool sizes further.
//   Override via cfg.webMax / cfg.workerMax / cfg.mastraStateMax.
export function initPools(cfg: PoolsConfig): Pools {
  if (pools) throw new Error('Pools already initialized; call closePools() first.');
  const webStmt = cfg.statementTimeoutMs ?? 5_000;
  const workerStmt = 30_000;
  pools = {
    web: new Pool({
      // || not ??: an unset DATABASE_APP_URL arrives as "" through compose's
      // ${VAR:-} default, and "" must fall back to databaseUrl (not become an
      // empty connectionString that pg silently resolves to localhost).
      connectionString: cfg.appDatabaseUrl || cfg.databaseUrl,
      max: cfg.webMax ?? 15,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 10_000,
      statement_timeout: webStmt,
    }),
    worker: new Pool({
      connectionString: cfg.databaseUrl,
      max: cfg.workerMax ?? 20,
      // No connectionTimeoutMillis: graphile-worker holds connections for the
      // duration of each job (concurrency slots). A timeout here would kill
      // the process when the pool is under load. Jobs use statement_timeout
      // to bound individual queries instead.
      idleTimeoutMillis: 30_000,
      statement_timeout: workerStmt,
    }),
    mastraState: new Pool({
      connectionString: cfg.databaseUrl,
      max: cfg.mastraStateMax ?? 5,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 10_000,
      statement_timeout: webStmt,
    }),
  };
  // Idle clients can emit 'error' if the server terminates them out from under us (admin
  // shutdown, DROP DATABASE WITH FORCE in tests). Without a Pool-level handler, those
  // become unhandled rejections and crash the process. We surface them via the injected
  // logger (or console.warn as fallback) so genuine pool problems still show up but
  // don't kill the runner.
  const swallow = (e: unknown) => {
    if (cfg.log) {
      cfg.log.warn({ subsystem: 'shared-db.pool', err: e }, 'pg pool client error (suppressed)');
    } else {
      console.warn('[shared-db] pg pool client error (suppressed):', e);
    }
  };
  pools.web.on('error', swallow);
  pools.worker.on('error', swallow);
  pools.mastraState.on('error', swallow);

  // Silent fallback to the admin (BYPASSRLS) pool is correct for simple self-host
  // but must never be silent in an environment where DATABASE_APP_URL was meant to
  // be set — surface it loudly so a dropped env var doesn't quietly disable the
  // RLS backstop. || above already normalizes "" (compose's ${VAR:-} default) to
  // this same fallback, so this check must too.
  if (!cfg.appDatabaseUrl) {
    const msg =
      'RLS backstop inert: no appDatabaseUrl, so the web pool uses the admin connection ' +
      '(BYPASSRLS). Tenant isolation rests entirely on explicit WHERE tenant_id. ' +
      'Set DATABASE_APP_URL to enable the backstop.';
    if (cfg.log) cfg.log.warn({ subsystem: 'shared-db.pool' }, msg);
    else console.warn(`[shared-db] ${msg}`);
  }

  instrumentPool(pools.web, 'web');
  instrumentPool(pools.worker, 'worker');
  instrumentPool(pools.mastraState, 'mastraState');

  // The web pool is served through a tenant-aware facade so per-request RLS
  // binding (runRequestTenant) governs every module's reads. Raw pool is bound
  // for the connection-pinning path.
  bindWebPool();
  webFacade = makeTenantAwarePool(pools.web);

  // The executor decides privilege; modules never pick a pool. `scoped` runs on the
  // app-role facade (NOBYPASSRLS, request-pinned when a connection is pinned);
  // `maintenance` runs on the admin pool. Resolve through the live `pools` binding,
  // not a captured local: closePools() must make executorPool() throw, not hand out
  // an ended pool.
  bindExecutorPools(
    () => webFacade ?? requirePools().web,
    () => requirePools().worker,
  );

  return pools;
}

/**
 * @deprecated Modules must not choose a privilege level. Use `executorPool()`, and let
 * the composition root open the context with `scoped()` / `maintenance()`.
 * Removed in PR4 of DB-1; will then be importable only by apps/server and apps/worker.
 */
export function getPool(name?: 'web' | 'worker' | 'mastraState'): Pool {
  if (!pools) throw new Error('getPool called before initPools.');
  const key = name ?? 'web';
  if (key === 'web') return webFacade ?? pools.web;
  return pools[key];
}

export function getPoolStats(): {
  web: { total: number; idle: number; waiting: number };
  worker: { total: number; idle: number; waiting: number };
  mastraState: { total: number; idle: number; waiting: number };
} | null {
  if (!pools) return null;
  return {
    web: {
      total: pools.web.totalCount,
      idle: pools.web.idleCount,
      waiting: pools.web.waitingCount,
    },
    worker: {
      total: pools.worker.totalCount,
      idle: pools.worker.idleCount,
      waiting: pools.worker.waitingCount,
    },
    mastraState: {
      total: pools.mastraState.totalCount,
      idle: pools.mastraState.idleCount,
      waiting: pools.mastraState.waitingCount,
    },
  };
}

export async function closePools(): Promise<void> {
  if (!pools) return;
  await Promise.all([pools.web.end(), pools.worker.end(), pools.mastraState.end()]);
  pools = null;
  webFacade = null;
  // Unbind so pinTenantConnection fails closed instead of calling .connect()
  // on the now-ended pool.
  unbindWebPool();
}
