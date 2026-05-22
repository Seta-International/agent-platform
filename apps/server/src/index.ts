import { serve } from '@hono/node-server';
import { embeddingJobs } from '@seta/copilot';
import { createContributionRegistry, runMigrations } from '@seta/core';
import { coreDb } from '@seta/core/db';
import { startDispatcher } from '@seta/core/dispatcher';
import { emit, withEmit } from '@seta/core/events';
import { createOutboxStore } from '@seta/core/outbox';
import { registerCoreContributions } from '@seta/core/register';
import { startWorkerPool, type WorkerHandle } from '@seta/core/workers';
import { getEntraTenantId } from '@seta/identity';
import { registerIdentityContributions } from '@seta/identity/register';
import { createMailTransportConfigStore } from '@seta/integrations';
import { integrationsDb } from '@seta/integrations/db';
import { registerIntegrationsContributions } from '@seta/integrations/register';
import { registerPlannerContributions } from '@seta/planner/register';
import { createCrypto, createKeyProviderFromEnv, parseCryptoEnv } from '@seta/shared-crypto';
import { closePools, getPool, initPools } from '@seta/shared-db';
import { createMailer, resolveTransport } from '@seta/shared-mailer';
import { createMailerSendTask } from '@seta/shared-mailer/queue';
import pino from 'pino';
import { BoardStreamHub } from './board-stream/hub.ts';
import { buildServerApp, registerAppContributions } from './build.ts';
import { parseEnv } from './env.ts';
import { buildM365Boot } from './m365-boot.ts';
import { NotificationStreamHub } from './notifications-stream/hub.ts';

const log = pino({ name: 'apps/server' });
const env = parseEnv(process.env);

initPools({ databaseUrl: env.DATABASE_URL });

const cryptoEnv = parseCryptoEnv(process.env);
const keyProvider = await createKeyProviderFromEnv(cryptoEnv);
const cryptoSvc = createCrypto({ keyProvider, log: log.child({ component: 'crypto' }) });
log.info({ provider: keyProvider.kind }, 'crypto wired');

const reg = createContributionRegistry();
registerCoreContributions(reg);
registerIdentityContributions(reg);
registerIntegrationsContributions(reg);
registerPlannerContributions(reg);
registerAppContributions(reg);

await runMigrations(reg, { pool: getPool('worker') });
log.info('migrations applied');

const dispatcher = await startDispatcher({
  pool: getPool('worker'),
  subscribers: [...reg.collected.subscribers],
});
log.info('dispatcher started');

const boardStreamHub = new BoardStreamHub();
boardStreamHub.start();

const notificationStreamHub = new NotificationStreamHub();
await notificationStreamHub.start(getPool('worker'));
log.info('notification stream hub started');

const mailerLog = log.child({ component: 'mailer' });
const outboxStore = createOutboxStore({ db: coreDb() });
const configStore = createMailTransportConfigStore({ db: integrationsDb() });

const mailerSendTask = createMailerSendTask({
  outboxStore,
  resolveTransport: (tenantId) =>
    resolveTransport(tenantId, {
      env,
      configStore: { findEnabled: (tid) => configStore.findEnabled(tid) },
      lookupEntraTenantId: getEntraTenantId,
      crypto: { decrypt: (b) => cryptoSvc.decrypt(b) },
    }),
  emit: (event) =>
    withEmit(undefined, async () => {
      await emit(event);
    }),
  log: log.child({ component: 'mailer.worker' }),
});

// Forward reference resolves the cycle between the jobs object and the
// WorkerHandle they need to call workers.addJob on. The variable is written
// before any job can be dispatched (startWorkerPool returns before any job
// fires), so this is always initialised at call time.
let _workerHandle: WorkerHandle | undefined;
function enqueue(id: string, payload?: unknown, opts?: Parameters<WorkerHandle['addJob']>[2]) {
  if (!_workerHandle) throw new Error('worker pool not yet initialised');
  return _workerHandle.addJob(id, payload, opts);
}

const m365Boot = env.M365_WEBHOOK_SECRET
  ? buildM365Boot({
      webhookSecret: env.M365_WEBHOOK_SECRET,
      cryptoSvc,
      workers: { addJob: enqueue, shutdown: async () => {} },
    })
  : null;

const workers = await startWorkerPool({
  pool: getPool('worker'),
  jobs: {
    'mailer:send': async (payload) => {
      await mailerSendTask(payload as never);
    },
    ...(m365Boot ? m365Boot.jobs : {}),
    ...embeddingJobs,
  },
});
_workerHandle = workers;
log.info('workers started');

const mailer = createMailer({
  env,
  outboxStore,
  queue: {
    addJob: (taskName, payload, opts) => workers.addJob(taskName, payload, opts),
  },
  emit: (event) =>
    withEmit(undefined, async () => {
      await emit(event);
    }),
  log: mailerLog,
});
log.info('mailer wired');
void mailer;

const { app } = buildServerApp(reg, {
  pool: getPool('worker'),
  databaseUrl: env.DATABASE_URL,
  readinessSnapshot: () => dispatcher.health(),
  boardStreamHub,
  notificationStreamHub,
  m365GraphClientFor: m365Boot?.graphClientFor,
  m365Workers: m365Boot?.workers,
  m365LinksRepo: m365Boot?.m365LinksRepo,
});

if (m365Boot) {
  app.route('/', m365Boot.webhookRouter);
  log.info('m365 webhook router mounted');
}

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  log.info({ port: info.port }, 'server listening');
});

let shuttingDown = false;
const shutdown = async (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info({ signal }, 'shutdown begin');
  await new Promise<void>((r) => server.close(() => r()));
  boardStreamHub.stop();
  await notificationStreamHub.stop();
  await dispatcher.shutdown(15_000);
  await workers.shutdown();
  await closePools();
  log.info('shutdown complete');
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
