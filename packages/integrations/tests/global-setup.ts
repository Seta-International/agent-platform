import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closePools, getPool, initPools, runMigrations } from '@seta/shared-db';
import { markAsTemplate, startPgContainer } from '@seta/shared-testing';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

let handle: Awaited<ReturnType<typeof startPgContainer>> | null = null;

export default async function (): Promise<() => Promise<void>> {
  handle = await startPgContainer();
  initPools({ databaseUrl: `${handle.baseUrl}/seta_template` });

  await runMigrations({
    pool: getPool('worker'),
    modules: [
      { name: 'core', dir: resolve(__dirname, '../../core/drizzle/migrations') },
      { name: 'integrations', dir: resolve(__dirname, '../drizzle/migrations') },
    ],
  });

  await closePools();
  await markAsTemplate(handle, 'seta_template');

  process.env.SETA_TEST_PG_BASE = handle.baseUrl;
  process.env.SETA_TEST_PG_TEMPLATE = 'seta_template';
  return async () => {
    await handle?.stop();
  };
}
