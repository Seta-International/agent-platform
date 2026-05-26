import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import type { Pool } from 'pg';
import { resetCoreDb } from '../../src/test-support.ts';

export { makeToolContext } from '@seta/copilot-sdk/testing';

export function withCopilotTestDb<T>(
  fn: (ctx: { pool: Pool; databaseUrl: string }) => Promise<T>,
): Promise<T> {
  return withTestDb(
    {
      templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
      baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
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
