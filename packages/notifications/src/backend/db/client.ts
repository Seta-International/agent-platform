import { createDb, getPool } from '@seta/shared-db';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema/index.ts';

let cached: NodePgDatabase<typeof schema> | null = null;

export function notificationsDb(): NodePgDatabase<typeof schema> {
  if (!cached) cached = createDb(getPool('web'), schema, { schemaFilter: ['notifications'] });
  return cached;
}

export function resetNotificationsDb(): void {
  cached = null;
}
