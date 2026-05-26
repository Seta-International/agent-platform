import * as coreSchema from '@seta/core/db/schema';
import { closePools, createDb, initPools, type Pool } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

export function withCliTestDb<T>(
  fn: (ctx: { pool: Pool; db: NodePgDatabase<typeof coreSchema> }) => Promise<T>,
): Promise<T> {
  return withTestDb(
    {
      templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
      baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
    },
    async ({ pool, databaseUrl }) => {
      initPools({ databaseUrl });
      try {
        const db = createDb(pool, coreSchema, { schemaFilter: ['core'] });
        return await fn({ pool, db });
      } finally {
        await closePools();
      }
    },
  );
}
