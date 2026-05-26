import { getPool, type NodePgDatabase } from '@seta/shared-db';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema.ts';

let cached: NodePgDatabase<typeof schema> | null = null;

export function copilotDb(): NodePgDatabase<typeof schema> {
  if (!cached) cached = drizzle(getPool('worker'), { schema });
  return cached;
}

/** Reset the cached instance. Use only in tests via @seta/copilot/testing. */
export function resetCopilotDb(): void {
  cached = null;
}

export type CopilotDb = ReturnType<typeof copilotDb>;
export * as copilotSchema from './schema.ts';
