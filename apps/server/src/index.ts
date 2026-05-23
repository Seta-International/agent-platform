import { createContributionRegistry } from '@seta/core';
import { coreDb } from '@seta/core/db';
import { emit, withEmit } from '@seta/core/events';
import { createOutboxStore } from '@seta/core/outbox';
import { registerCoreContributions } from '@seta/core/register';
import { buildRuntime, runMigrations, type WorkerHandle } from '@seta/core/runtime';
import { embeddingJobs, getEntraTenantId } from '@seta/identity';
import { registerIdentityContributions } from '@seta/identity/register';
import { createMailTransportConfigStore } from '@seta/integrations';
import { integrationsDb } from '@seta/integrations/db';
import { registerIntegrationsContributions } from '@seta/integrations/register';
import { knowledgeJobs } from '@seta/knowledge/jobs';
import { registerKnowledgeContributions } from '@seta/knowledge/register';
import { registerNotificationsContributions } from '@seta/notifications/register';
import { plannerEmbeddingJobs } from '@seta/planner';
import { registerPlannerContributions } from '@seta/planner/register';
import { createCrypto, createKeyProviderFromEnv, parseCryptoEnv } from '@seta/shared-crypto';
import { closePools, getPool, initPools } from '@seta/shared-db';
import { createMailer, resolveTransport } from '@seta/shared-mailer';
import { createMailerSendTask } from '@seta/shared-mailer/queue';
import { registerStaffingContributions } from '@seta/staffing/register';
import pino from 'pino';
import { buildServerApp, registerAppContributions } from './build.ts';
import { parseEnv } from './env.ts';
import { failedLoginAlertSubscriber } from './subscribers/failed-login-alert.ts';

const log = pino({ name: 'apps/server' });
const env = parseEnv(process.env);

initPools({ databaseUrl: env.DATABASE_URL });

const cryptoEnv = parseCryptoEnv(process.env);
const keyProvider = await createKeyProviderFromEnv(cryptoEnv);
const cryptoSvc = createCrypto({ keyProvider, log: log.child({ component: 'crypto' }) });
log.info({ provider: keyProvider.kind }, 'crypto wired');

// Forward reference for the WorkerHandle so m365 boot (constructed at register
// time, before workers start) can enqueue from its closures once workers are
// running. onServerStart sets this just before HTTP boot completes.
let workerHandleRef: WorkerHandle | undefined;
const getWorkers = (): WorkerHandle => {
  if (!workerHandleRef) throw new Error('worker handle not yet initialised');
  return workerHandleRef;
};

const reg = createContributionRegistry();
registerCoreContributions(reg);
registerIdentityContributions(reg);
registerIntegrationsContributions(reg, {
  cryptoSvc,
  mailerEnv: env,
  webhookSecret: env.M365_WEBHOOK_SECRET,
  getWorkers,
});
registerKnowledgeContributions(reg);
registerNotificationsContributions(reg);
registerPlannerContributions(reg);
registerStaffingContributions(reg);
registerAppContributions(reg);

const lag = await runMigrations(reg, { pool: getPool('worker'), assertCaughtUpOnly: true });
if (lag.length > 0) {
  log.error({ lag }, 'schema_migrations behind — run apps/cli migrate before booting server');
  process.exit(1);
}

const inDev = process.env.NODE_ENV !== 'production';

// Forward reference: the mailer is wired after workers start so its addJob target
// (the WorkerHandle) exists. The reference is set inside onServerStart before any
// route handler can pull from the mailer.
let mailerRef: import('@seta/shared-mailer').Mailer | undefined;
const getMailer = (): import('@seta/shared-mailer').Mailer => {
  if (!mailerRef) throw new Error('mailer not yet initialised');
  return mailerRef;
};

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

// In dev (NODE_ENV !== production) startBoth runs HTTP + dispatcher + worker pool in one
// process — mirroring the previous single-process developer experience. In production
// startServerRuntime runs HTTP only, with an enqueue-only WorkerHandle; apps/worker runs
// the actual job handlers.
const rt = buildRuntime(env, {
  reg,
  pool: getPool('worker'),
  extraSubscribers: [
    failedLoginAlertSubscriber({
      getMailer,
    }) as import('@seta/shared-types').SubscriberDef,
  ],
  extraJobs: inDev
    ? {
        'mailer:send': async (payload) => {
          await mailerSendTask(payload as never);
        },
        ...embeddingJobs,
        ...knowledgeJobs,
        ...plannerEmbeddingJobs,
      }
    : undefined,
  onServerStart: async ({ workers }) => {
    workerHandleRef = workers;
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
      log: log.child({ component: 'mailer' }),
    });
    mailerRef = mailer;
    log.info('mailer wired');
  },
  buildServerApp: ({ workers, pool, dispatcher, streams }) => {
    const { app } = buildServerApp(reg, {
      pool,
      databaseUrl: env.DATABASE_URL,
      workers,
      readinessSnapshot: () => dispatcher.health(),
      streams,
    });
    return app;
  },
});

const { server, shutdown } = inDev ? await rt.startBoth() : await rt.startServerRuntime();
server.on('listening', () => {
  const addr = server.address();
  if (addr && typeof addr === 'object') log.info({ port: addr.port }, 'server listening');
});

let shuttingDown = false;
const handle = async (signal: string): Promise<void> => {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info({ signal }, 'shutdown begin');
  await shutdown(signal);
  await closePools();
  log.info('shutdown complete');
  process.exit(0);
};
process.on('SIGTERM', () => void handle('SIGTERM'));
process.on('SIGINT', () => void handle('SIGINT'));
