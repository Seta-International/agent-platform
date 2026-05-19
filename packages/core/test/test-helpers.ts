import { createDb } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import * as coreSchema from '../src/db/schema/index.ts';

export function withCoreTestDb<T>(
  fn: (ctx: { pool: Pool; db: NodePgDatabase<typeof coreSchema> }) => Promise<T>,
): Promise<T> {
  return withTestDb(
    {
      templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
      baseUrl: process.env.SETA_TEST_PG_BASE as string,
    },
    async ({ pool }) => {
      const db = createDb(pool, coreSchema, { schemaFilter: ['core'] });
      return fn({ pool, db });
    },
  );
}
