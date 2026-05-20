import { serve } from '@hono/node-server';
import { createContributionRegistry, runMigrations } from '@seta/core';
import { startDispatcher } from '@seta/core/dispatcher';
import { registerCoreContributions } from '@seta/core/register';
import { startWorkerPool } from '@seta/core/workers';
import { registerIdentityContributions } from '@seta/identity/register';
import { createCrypto, createKeyProviderFromEnv, parseCryptoEnv } from '@seta/shared-crypto';
import { closePools, getPool, initPools } from '@seta/shared-db';
import pino from 'pino';
import { buildServerApp, registerAppContributions } from './build.ts';
import { parseEnv } from './env.ts';

const log = pino({ name: 'apps/server' });
const env = parseEnv(process.env);

initPools({ databaseUrl: env.DATABASE_URL });

const cryptoEnv = parseCryptoEnv(process.env);
const keyProvider = await createKeyProviderFromEnv(cryptoEnv);
const crypto = createCrypto({ keyProvider, log: log.child({ component: 'crypto' }) });
log.info({ provider: keyProvider.kind }, 'crypto wired');
void crypto;

const reg = createContributionRegistry();
registerCoreContributions(reg);
registerIdentityContributions(reg);
registerAppContributions(reg);

await runMigrations(reg, { pool: getPool('worker') });
log.info('migrations applied');

const dispatcher = await startDispatcher({
  pool: getPool('worker'),
  subscribers: [...reg.collected.subscribers],
});
log.info('dispatcher started');

const workers = await startWorkerPool({ pool: getPool('worker') });
log.info('workers started');

const { app } = buildServerApp(reg, {
  pool: getPool('worker'),
  databaseUrl: env.DATABASE_URL,
  readinessSnapshot: () => dispatcher.health(),
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
