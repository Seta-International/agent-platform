import { resetCoreDb } from '@seta/core/testing';
import { resetPeopleDb } from '@seta/people/testing';
import { closePools, initPools, scoped } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import type { Pool } from 'pg';

export { makeToolContext } from '@seta/agent-sdk/testing';

export function withAgentTestDb<T>(
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
        // No appDatabaseUrl here, so scoped()'s tenant GUC is inert (self-host
        // fallback) — this only opens the executor context plannerDb() requires.
        return await scoped(crypto.randomUUID(), () => fn({ pool, databaseUrl }));
      } finally {
        resetCoreDb();
        // The skill-search tool reads People (getPersonSkills); reset its cached
        // DB client so it rebinds to the next test's pool after closePools().
        resetPeopleDb();
        await closePools();
      }
    },
  );
}
