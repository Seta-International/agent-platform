import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closePools, getPool, initPools, runMigrations } from '@seta/shared-db';
import { ensureTemplateDb, markAsTemplate, startPgContainer } from '@seta/shared-testing';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

let handle: Awaited<ReturnType<typeof startPgContainer>> | null = null;

export default async function (): Promise<() => Promise<void>> {
  const TEMPLATE = 'platform_template_integrations';
  handle = await startPgContainer();
  await ensureTemplateDb(handle, TEMPLATE);
  initPools({ databaseUrl: `${handle.baseUrl}/${TEMPLATE}` });

  await runMigrations({
    pool: getPool('worker'),
    modules: [
      { name: 'core', dir: resolve(__dirname, '../../core/drizzle/migrations') },
      { name: 'identity', dir: resolve(__dirname, '../../identity/drizzle') },
      { name: 'planner', dir: resolve(__dirname, '../../planner/drizzle') },
      { name: 'integrations', dir: resolve(__dirname, '../drizzle/migrations') },
    ],
  });

  await closePools();
  await markAsTemplate(handle, TEMPLATE);

  process.env.PLATFORM_TEST_PG_BASE = handle.baseUrl;
  process.env.PLATFORM_TEST_PG_TEMPLATE = TEMPLATE;
  process.env.BETTER_AUTH_SECRET ??= 'test'.padEnd(32, '_');
  return async () => {
    await handle?.stop();
  };
}
