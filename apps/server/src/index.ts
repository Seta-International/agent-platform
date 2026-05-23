import { embeddingJobs } from '@seta/copilot';
import { createContributionRegistry } from '@seta/core';
import { coreDb } from '@seta/core/db';
import { emit, withEmit } from '@seta/core/events';
import { createOutboxStore } from '@seta/core/outbox';
import { registerCoreContributions } from '@seta/core/register';
import { buildRuntime, runMigrations, type WorkerHandle } from '@seta/core/runtime';
import { getEntraTenantId } from '@seta/identity';
import { registerIdentityContributions } from '@seta/identity/register';
import { createMailTransportConfigStore } from '@seta/integrations';
import { integrationsDb } from '@seta/integrations/db';
import { registerIntegrationsContributions } from '@seta/integrations/register';
import { knowledgeJobs } from '@seta/knowledge/jobs';
import { registerKnowledgeContributions } from '@seta/knowledge/register';
import { KnowledgeStreamHub } from '@seta/knowledge/stream';
import { registerNotificationsContributions } from '@seta/notifications/register';
import { NotificationStreamHub } from '@seta/notifications/stream';
import { plannerEmbeddingJobs } from '@seta/planner';
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
import { failedLoginAlertSubscriber } from './subscribers/failed-login-alert.ts';

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
registerKnowledgeContributions(reg);
registerNotificationsContributions(reg);
registerPlannerContributions(reg);
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

const boardStreamHub = new BoardStreamHub();
const knowledgeStreamHub = new KnowledgeStreamHub();
const notificationStreamHub = new NotificationStreamHub();

// Forward reference for the WorkerHandle so m365Boot (constructed before workers
// start) can enqueue from its closures once workers are running.
let workerHandleRef: WorkerHandle | undefined;
const enqueue = (
  id: string,
  payload?: unknown,
  opts?: Parameters<WorkerHandle['addJob']>[2],
): Promise<void> => {
  if (!workerHandleRef) throw new Error('worker handle not yet initialised');
  return workerHandleRef.addJob(id, payload, opts);
};

const m365Boot = env.M365_WEBHOOK_SECRET
  ? buildM365Boot({
      webhookSecret: env.M365_WEBHOOK_SECRET,
      cryptoSvc,
      workers: { addJob: enqueue, shutdown: async () => {} },
    })
  : null;

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
        ...(m365Boot ? m365Boot.jobs : {}),
        ...embeddingJobs,
        ...knowledgeJobs,
        ...plannerEmbeddingJobs,
      }
    : undefined,
  onServerStart: async ({ workers }) => {
    workerHandleRef = workers;
    boardStreamHub.start();
    knowledgeStreamHub.start();
    await notificationStreamHub.start(getPool('worker'));
    log.info('notification stream hub started');

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
  buildServerApp: ({ workers, pool, dispatcher }) => {
    const { app } = buildServerApp(reg, {
      pool,
      databaseUrl: env.DATABASE_URL,
      workers,
      readinessSnapshot: () => dispatcher.health(),
      boardStreamHub,
      knowledgeStreamHub,
      notificationStreamHub,
      m365GraphClientFor: m365Boot?.graphClientFor,
      m365Workers: m365Boot?.workers,
      m365LinksRepo: m365Boot?.m365LinksRepo,
    });
    if (m365Boot) {
      app.route('/', m365Boot.webhookRouter);
      log.info('m365 webhook router mounted');
    }
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
  boardStreamHub.stop();
  knowledgeStreamHub.stop();
  await notificationStreamHub.stop();
  await closePools();
  log.info('shutdown complete');
  process.exit(0);
};
process.on('SIGTERM', () => void handle('SIGTERM'));
process.on('SIGINT', () => void handle('SIGINT'));
