import { createDb, executorPool } from '@seta/shared-db';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import * as schema from './schema/index.ts';

// Cache key includes the underlying Pool: executorPool() returns a different pool
// per call depending on the active mode (scoped -> app pool, maintenance -> admin
// pool), so caching on Pool identity (not just "is there a cache") is required or a
// maintenance() caller would be handed a scoped() caller's cached app-pool Drizzle
// instance, and vice versa.
let cached: { pool: Pool; db: NodePgDatabase<typeof schema> } | null = null;

export function coreDb(): NodePgDatabase<typeof schema> {
  const pool = executorPool();
  if (!cached || cached.pool !== pool) {
    cached = { pool, db: createDb(pool, schema, { schemaFilter: ['core'] }) };
  }
  return cached.db;
}

export function resetCoreDb(): void {
  cached = null;
}
