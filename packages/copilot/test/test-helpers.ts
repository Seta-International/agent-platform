import { resetCoreDb } from '@seta/core/internal/test-support';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import type { Pool } from 'pg';

export function withCopilotTestDb<T>(
  fn: (ctx: { pool: Pool; databaseUrl: string }) => Promise<T>,
): Promise<T> {
  return withTestDb(
    {
      templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
      baseUrl: process.env.SETA_TEST_PG_BASE as string,
    },
    async ({ pool, databaseUrl }) => {
      initPools({ databaseUrl });
      try {
        return await fn({ pool, databaseUrl });
      } finally {
        resetCoreDb();
        await closePools();
      }
    },
  );
}
