import { createDb, getPool } from '@seta/shared-db';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema/index.ts';

let cached: NodePgDatabase<typeof schema> | null = null;

export function billingDb(): NodePgDatabase<typeof schema> {
  if (!cached) cached = createDb(getPool('web'), schema, { schemaFilter: ['billing'] });
  return cached;
}

export function resetBillingDb(): void {
  cached = null;
}
