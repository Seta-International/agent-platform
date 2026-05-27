import { getPool, type NodePgDatabase } from '@seta/shared-db';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import * as schema from './schema.ts';

export * from './schema.ts';

// Cache key includes the underlying Pool so closePools()+initPools() (tests,
// graceful restart) doesn't leave us wrapping a dead Pool reference.
let cached: { pool: Pool; db: NodePgDatabase<typeof schema> } | null = null;

export function plannerDb(): NodePgDatabase<typeof schema> {
  const pool = getPool('worker');
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
