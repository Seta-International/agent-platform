import { Pool } from 'pg';
import { instrumentPool } from './instrumentation.ts';

export interface PoolsConfig {
  databaseUrl: string;
  webMax?: number;
  workerMax?: number;
  mastraStateMax?: number;
  statementTimeoutMs?: number;
}

export interface Pools {
  web: Pool;
  worker: Pool;
  mastraState: Pool;
}

let pools: Pools | null = null;

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
      connectionString: cfg.databaseUrl,
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
  // become unhandled rejections and crash the process. We surface them via console.warn
  // so genuine pool problems still show up but don't kill the runner.
  const swallow = (e: unknown) => {
    console.warn('[shared-db] pg pool client error (suppressed):', e);
  };
  pools.web.on('error', swallow);
  pools.worker.on('error', swallow);
  pools.mastraState.on('error', swallow);

  instrumentPool(pools.web, 'web');
  instrumentPool(pools.worker, 'worker');
  instrumentPool(pools.mastraState, 'mastraState');

  return pools;
}

export function getPool(name: 'web' | 'worker' | 'mastraState'): Pool {
  if (!pools) throw new Error('getPool called before initPools.');
  return pools[name];
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
}
