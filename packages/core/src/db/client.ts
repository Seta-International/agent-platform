import { createDb, getPool } from '@seta/shared-db';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema/index.ts';

let cached: NodePgDatabase<typeof schema> | null = null;

export function coreDb(): NodePgDatabase<typeof schema> {
  if (!cached) cached = createDb(getPool('web'), schema, { schemaFilter: ['core'] });
  return cached;
}

// For tests that re-initialize pools across runs.
export function resetCoreDb(): void {
  cached = null;
}
