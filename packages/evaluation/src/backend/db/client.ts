import { createDb, getPool, type PoolName } from '@seta/shared-db';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import * as schema from './schema.ts';

let cached: { pool: Pool; db: NodePgDatabase<typeof schema> } | null = null;

export function evaluationDb(poolName: PoolName = 'web'): NodePgDatabase<typeof schema> {
  const pool = getPool(poolName);
  if (!cached || cached.pool !== pool) {
    cached = { pool, db: createDb(pool, schema, { schemaFilter: ['evaluation'] }) };
  }
  return cached.db;
}

export function resetEvaluationDb(): void {
  cached = null;
}
