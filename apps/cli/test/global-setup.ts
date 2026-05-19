import { createContributionRegistry, runMigrations } from '@seta/core';
import { registerCoreContributions } from '@seta/core/register';
import { closePools, getPool, initPools } from '@seta/shared-db';
import { markAsTemplate, startPgContainer } from '@seta/shared-testing';

let handle: Awaited<ReturnType<typeof startPgContainer>> | null = null;

export default async function (): Promise<() => Promise<void>> {
  handle = await startPgContainer();
  initPools({ databaseUrl: `${handle.baseUrl}/seta_template` });
  const reg = createContributionRegistry();
  registerCoreContributions(reg);
  await runMigrations(reg, { pool: getPool('worker') });
  await closePools();
  await markAsTemplate(handle, 'seta_template');
  process.env.SETA_TEST_PG_BASE = handle.baseUrl;
  process.env.SETA_TEST_PG_TEMPLATE = 'seta_template';
  return async () => {
    await handle?.stop();
  };
}
