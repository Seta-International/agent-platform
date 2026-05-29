import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMigrations } from '@seta/shared-db';
import { ensureTemplateDb, markAsTemplate, startPgContainer } from '@seta/shared-testing';
import { Pool } from 'pg';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

let handle: Awaited<ReturnType<typeof startPgContainer>> | null = null;

export default async function (): Promise<() => Promise<void>> {
  const TEMPLATE = 'platform_template_agent';
  handle = await startPgContainer();
  await ensureTemplateDb(handle, TEMPLATE);

  const pool = new Pool({ connectionString: `${handle.baseUrl}/${TEMPLATE}` });
  try {
    await runMigrations({
      pool,
      modules: [
        { name: 'core', dir: resolve(__dirname, '../../core/drizzle/migrations') },
        { name: 'identity', dir: resolve(__dirname, '../../identity/drizzle') },
        { name: 'planner', dir: resolve(__dirname, '../../planner/drizzle') },
        { name: 'agent', dir: resolve(__dirname, '../drizzle') },
      ],
    });
  } finally {
    await pool.end();
  }

  await markAsTemplate(handle, TEMPLATE);

  process.env.PLATFORM_TEST_PG_BASE = handle.baseUrl;
  process.env.PLATFORM_TEST_PG_TEMPLATE = TEMPLATE;
  process.env.BETTER_AUTH_SECRET ??= 'test'.padEnd(32, '_');
  process.env.AGENT_MODEL ??= 'mock/echo';
  // buildMemory constructs an embedding model that validates its provider key at
  // build time. Tests never make real embedding calls, so a dummy key is enough.
  process.env.OPENAI_API_KEY ??= 'test-key';

  return async () => {
    await handle?.stop();
  };
}
