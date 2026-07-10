import { runMigrations } from '@seta/core';
import { closePools, initPools } from '@seta/shared-db';
import { getPool } from '@seta/shared-db/composition';
import {
  createAppRole,
  ensureTemplateDb,
  markAsTemplate,
  startPgContainer,
} from '@seta/shared-testing';
import { buildMigrationRegistry } from '../src/commands/migrate.ts';

let handle: Awaited<ReturnType<typeof startPgContainer>> | null = null;

export default async function (): Promise<() => Promise<void>> {
  const TEMPLATE = 'platform_template_cli';
  handle = await startPgContainer();
  await ensureTemplateDb(handle, TEMPLATE);
  initPools({ databaseUrl: `${handle.baseUrl}/${TEMPLATE}` });
  // Before the migrations: each baseline's grants are conditional on this role existing.
  await createAppRole(getPool('worker'));
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
