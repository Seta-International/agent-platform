import { getPool, type NodePgDatabase } from '@seta/shared-db';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema.ts';

export * from './schema.ts';

let cached: NodePgDatabase<typeof schema> | null = null;

export function plannerDb(): NodePgDatabase<typeof schema> {
  if (!cached) cached = drizzle(getPool('worker'), { schema });
  return cached;
}

/** Reset the cached instance. Use only in tests via @seta/planner/testing. */
export function resetPlannerDb(): void {
  cached = null;
}

export type PlannerDb = ReturnType<typeof plannerDb>;
