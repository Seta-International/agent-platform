import { closePools, createDb, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import * as integrationsSchema from '../../src/db/schema/index.ts';

export function withIntegrationsTestDb<T>(
  fn: (ctx: {
    pool: Pool;
    db: NodePgDatabase<typeof integrationsSchema>;
    databaseUrl: string;
  }) => Promise<T>,
): Promise<T> {
  return withTestDb(
    {
      templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
      baseUrl: process.env.SETA_TEST_PG_BASE as string,
    },
    async ({ pool, databaseUrl }) => {
      initPools({ databaseUrl });
      try {
        const db = createDb(pool, integrationsSchema, { schemaFilter: ['integrations'] });
        return await fn({ pool, db, databaseUrl });
      } finally {
        await closePools();
      }
    },
  );
}
