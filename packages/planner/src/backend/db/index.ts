import { executorPool, type NodePgDatabase } from '@seta/shared-db';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import * as schema from './schema.ts';

export * from './schema.ts';

// Cache key includes the underlying Pool: executorPool() returns a different pool
// per call depending on the active mode (scoped -> app pool, maintenance -> admin
// pool), so caching on Pool identity (not just "is there a cache") is required or a
// maintenance() caller would be handed a scoped() caller's cached app-pool instance.
let cached: { pool: Pool; db: NodePgDatabase<typeof schema> } | null = null;

export function plannerDb(): NodePgDatabase<typeof schema> {
  const pool = executorPool();
  if (!cached || cached.pool !== pool) {
    cached = { pool, db: drizzle(pool, { schema }) };
  }
  return cached.db;
}

/** Reset the cached instance. Use only in tests via @seta/planner/testing. */
export function resetPlannerDb(): void {
  cached = null;
}

export type PlannerDb = ReturnType<typeof plannerDb>;
