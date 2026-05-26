import { getPool, type NodePgDatabase } from '@seta/shared-db';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema.ts';

let cached: NodePgDatabase<typeof schema> | null = null;

export function identityDb(): NodePgDatabase<typeof schema> {
  if (!cached) cached = drizzle(getPool('worker'), { schema });
  return cached;
}

/** Reset the cached instance. Use only in tests via @seta/identity/testing. */
export function resetIdentityDb(): void {
  cached = null;
}

export type IdentityDb = ReturnType<typeof identityDb>;
export * as identitySchema from './schema.ts';
