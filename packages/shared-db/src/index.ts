import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';

export type { NodePgDatabase, Pool };
export type PoolName = 'web' | 'worker' | 'mastraState';

export { createDb } from './db.ts';
export { halfvec } from './halfvec.ts';
export { MigrationChecksumMismatch, type ModuleMigration, runMigrations } from './migrate.ts';
export {
  type EnsureTenantPartitionOptions,
  ensureTenantPartition,
} from './partition-provisioner.ts';
export { closePools, getPool, initPools, type Pools, type PoolsConfig } from './pools.ts';
export { type NodeTx, withRetry, withTx } from './tx.ts';
