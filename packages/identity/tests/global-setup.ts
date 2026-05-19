import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMigrations } from '@seta/shared-db';
import { markAsTemplate, startPgContainer } from '@seta/shared-testing';
import { Pool } from 'pg';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

let handle: Awaited<ReturnType<typeof startPgContainer>> | null = null;

export default async function (): Promise<() => Promise<void>> {
  handle = await startPgContainer();

  const templateUrl = `${handle.baseUrl}/seta_template`;
  const pool = new Pool({ connectionString: templateUrl });
  try {
    await runMigrations({
      pool,
      modules: [
        { name: 'core', dir: resolve(__dirname, '../../core/drizzle/migrations') },
        { name: 'identity', dir: resolve(__dirname, '../drizzle') },
      ],
    });
  } finally {
    await pool.end();
  }

  await markAsTemplate(handle, 'seta_template');

  process.env.SETA_TEST_PG_BASE = handle.baseUrl;
  process.env.SETA_TEST_PG_TEMPLATE = 'seta_template';
  process.env.BETTER_AUTH_SECRET ??= 'test'.padEnd(32, '_');

  return async () => {
    await handle?.stop();
  };
}
