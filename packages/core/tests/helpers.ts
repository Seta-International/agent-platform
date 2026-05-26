import { closePools, createDb, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import * as coreSchema from '../src/db/schema/index.ts';
import {
  type DispatcherHandle,
  type SubscriberDef,
  startDispatcher,
} from '../src/runtime/dispatcher/index.ts';

export function withCoreTestDb<T>(
  fn: (ctx: {
    pool: Pool;
    db: NodePgDatabase<typeof coreSchema>;
    databaseUrl: string;
  }) => Promise<T>,
): Promise<T> {
  return withTestDb(
    {
      templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
      baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
    },
    async ({ pool, databaseUrl }) => {
      // shared/db's pool registry is what coreDb() / withEmit reach for. Wire it to the
      // same DB as the test pool so writes through both paths land in one database.
      initPools({ databaseUrl });
      try {
        const db = createDb(pool, coreSchema, { schemaFilter: ['core'] });
        return await fn({ pool, db, databaseUrl });
      } finally {
        await closePools();
      }
    },
  );
}

export async function withDispatcher<T>(
  opts: { subscribers: SubscriberDef[]; pool: Pool },
  fn: (handle: DispatcherHandle) => Promise<T>,
): Promise<T> {
  const handle = await startDispatcher({
    pool: opts.pool,
    subscribers: opts.subscribers,
    pollIntervalMs: 100,
  });
  try {
    return await fn(handle);
  } finally {
    await handle.shutdown(5_000);
  }
}

export async function waitFor(
  predicate: () => Promise<boolean> | boolean,
  timeoutMs = 10_000,
  intervalMs = 50,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`waitFor timed out after ${timeoutMs}ms`);
}
