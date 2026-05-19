import { serve } from '@hono/node-server';
import { buildHonoApp, createContributionRegistry, runMigrations } from '@seta/core';
import { startDispatcher } from '@seta/core/dispatcher';
import { registerCoreContributions } from '@seta/core/register';
import { startWorkerPool } from '@seta/core/workers';
import { closePools, getPool, initPools } from '@seta/shared-db';
import pino from 'pino';
import { parseEnv } from './env.ts';

const log = pino({ name: 'apps/server' });
const env = parseEnv(process.env);

initPools({ databaseUrl: env.DATABASE_URL });

const reg = createContributionRegistry();
registerCoreContributions(reg);

await runMigrations(reg, { pool: getPool('worker') });
log.info('migrations applied');

const dispatcher = await startDispatcher({
  pool: getPool('worker'),
  subscribers: [...reg.collected.subscribers],
});
log.info('dispatcher started');

const workers = await startWorkerPool({ pool: getPool('worker') });
log.info('workers started');

const app = buildHonoApp(reg);
app.get('/health/ready', (c) => {
  const h = dispatcher.health();
  const fresh = Date.now() - h.lastTickAt.getTime() < 30_000;
  return c.json({ ok: fresh, lastTickAt: h.lastTickAt }, fresh ? 200 : 503);
});

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  log.info({ port: info.port }, 'server listening');
});

let shuttingDown = false;
const shutdown = async (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info({ signal }, 'shutdown begin');
  await new Promise<void>((r) => server.close(() => r()));
  await dispatcher.shutdown(15_000);
  await workers.shutdown();
  await closePools();
  log.info('shutdown complete');
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
