import { createDb, getPool } from '@seta/shared-db';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema.ts';

let cached: NodePgDatabase<typeof schema> | null = null;

export function knowledgeDb(): NodePgDatabase<typeof schema> {
  if (!cached) cached = createDb(getPool('worker'), schema, { schemaFilter: ['knowledge'] });
  return cached;
}

export function resetKnowledgeDb(): void {
  cached = null;
}
