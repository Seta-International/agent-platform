import { Pool } from 'pg';

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

export function initPools(cfg: PoolsConfig): Pools {
  if (pools) throw new Error('Pools already initialized; call closePools() first.');
  const webStmt = cfg.statementTimeoutMs ?? 5_000;
  const workerStmt = 30_000;
  pools = {
    web: new Pool({
      connectionString: cfg.databaseUrl,
      max: cfg.webMax ?? 15,
      statement_timeout: webStmt,
    }),
    worker: new Pool({
      connectionString: cfg.databaseUrl,
      max: cfg.workerMax ?? 10,
      statement_timeout: workerStmt,
    }),
    mastraState: new Pool({
      connectionString: cfg.databaseUrl,
      max: cfg.mastraStateMax ?? 5,
      statement_timeout: webStmt,
    }),
  };
  return pools;
}

export function getPool(name: 'web' | 'worker' | 'mastraState'): Pool {
  if (!pools) throw new Error('getPool called before initPools.');
  return pools[name];
}

export async function closePools(): Promise<void> {
  if (!pools) return;
  await Promise.all([pools.web.end(), pools.worker.end(), pools.mastraState.end()]);
  pools = null;
}
