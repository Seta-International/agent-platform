import { runMigrations } from '@seta/core';
import { closePools, getPool, initPools } from '@seta/shared-db';
import { ensureTemplateDb, markAsTemplate, startPgContainer } from '@seta/shared-testing';
import { buildMigrationRegistry } from '../src/commands/migrate.ts';

let handle: Awaited<ReturnType<typeof startPgContainer>> | null = null;

export default async function (): Promise<() => Promise<void>> {
  const TEMPLATE = 'platform_template_cli';
  handle = await startPgContainer();
  await ensureTemplateDb(handle, TEMPLATE);
  initPools({ databaseUrl: `${handle.baseUrl}/${TEMPLATE}` });
  const reg = buildMigrationRegistry();
  await runMigrations(reg, { pool: getPool('worker') });
  await closePools();
  await markAsTemplate(handle, TEMPLATE);
  process.env.PLATFORM_TEST_PG_BASE = handle.baseUrl;
  process.env.PLATFORM_TEST_PG_TEMPLATE = TEMPLATE;
  return async () => {
    await handle?.stop();
  };
}
