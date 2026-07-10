import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Pool, PoolClient } from 'pg';

export type { NodePgDatabase, Pool, PoolClient };
export type PoolName = 'web' | 'worker' | 'mastraState';

export { createDb } from './db.ts';
export {
  bindExecutorPools,
  currentExecutorMode,
  ExecutorContextError,
  type ExecutorMode,
  executorPool,
  maintenance,
  scoped,
} from './executor.ts';
export { halfvec } from './halfvec.ts';
export {
  getLifecycleEntries,
  type LifecycleEntry,
  type LifecyclePolicy,
  registerLifecycle,
  resetLifecycleRegistry,
  runRetention,
} from './lifecycle.ts';
export {
  MigrationChecksumMismatch,
  type MigrationLagRow,
  type ModuleMigration,
  runMigrations,
} from './migrate.ts';
export {
  type EnsureTenantPartitionOptions,
  ensureTenantPartition,
} from './partition-provisioner.ts';
export { closePools, initPools, type Pools, type PoolsConfig } from './pools.ts';
export { runRequestTenant } from './request-tenant.ts';
export { buildRlsSql, setTenantGuc, TENANT_GUC, withTenantTx } from './rls.ts';
export { textEnum, textEnumCheck, textEnumValuesSql } from './text-enum.ts';
export { buildTouchTriggerSql, buildTouchUpdatedAtFnSql } from './touch-updated-at.ts';
export { type NodeTx, withRetry, withTx } from './tx.ts';
