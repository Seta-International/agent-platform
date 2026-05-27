import './otel.ts'; // MUST be first; see otel.ts header comment.
import { registerCopilot } from '@seta/copilot/register';
import { createContributionRegistry, requestIdStorage } from '@seta/core';
import { coreDb } from '@seta/core/db';
import { emit, withEmit } from '@seta/core/events';
import { createOutboxStore } from '@seta/core/outbox';
import { registerCoreContributions } from '@seta/core/register';
import { buildRuntime, runMigrations, type WorkerHandle } from '@seta/core/runtime';
import { registerIdentityContributions } from '@seta/identity/register';
import { registerIntegrationsContributions } from '@seta/integrations/register';
import { registerKnowledgeContributions } from '@seta/knowledge/register';
import { registerNotificationsContributions } from '@seta/notifications/register';
import { registerPlannerContributions } from '@seta/planner/register';
import { createCrypto, createKeyProviderFromEnv, parseCryptoEnv } from '@seta/shared-crypto';
import { closePools, getPool, initPools } from '@seta/shared-db';
import { createMailer } from '@seta/shared-mailer';
import { registerStaffingContributions } from '@seta/staffing/register';
// MODULE_IMPORTS_END — generator inserts new register*Contributions imports above this comment.
import pino from 'pino';
import { buildServerApp, registerAppContributions } from './build.ts';
import { parseEnv } from './env.ts';
import { failedLoginAlertSubscriber } from './subscribers/failed-login-alert.ts';
import { revokeSessionsOnDeactivationSubscriber } from './subscribers/revoke-sessions-on-deactivation.ts';

const log = pino({
  name: 'apps/server',
  mixin() {
    const requestId = requestIdStorage.getStore()?.requestId;
    return requestId ? { request_id: requestId } : {};
  },
});
const env = parseEnv(process.env);

initPools({ databaseUrl: env.DATABASE_URL, log: log.child({ subsystem: 'shared-db' }) });

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
// MODULE_REGISTRATIONS_END — generator inserts new register*Contributions(reg) calls above this comment.
registerAppContributions(reg);

const lag = await runMigrations(reg, { pool: getPool('worker'), assertCaughtUpOnly: true });
if (lag.length > 0) {
  log.error({ lag }, 'schema_migrations behind — run apps/cli migrate before booting server');
  process.exit(1);
}

// Forward reference: the mailer is wired after workers start so its addJob target
// (the WorkerHandle) exists. The reference is set inside onServerStart before any
// route handler can pull from the mailer.
let mailerRef: import('@seta/shared-mailer').Mailer | undefined;
const getMailer = (): import('@seta/shared-mailer').Mailer => {
  if (!mailerRef) throw new Error('mailer not yet initialised');
  return mailerRef;
};

const outboxStore = createOutboxStore({ db: coreDb() });
// Build the copilot engine up front so subscriberBuilders contributed by
// orchestrator modules (e.g. staffing) can be constructed against the live
// Mastra instance before the dispatcher starts.
const copilot = registerCopilot({
  pool: getPool('worker'),
  databaseUrl: env.DATABASE_URL,
  reg,
  log: log.child({ subsystem: 'copilot' }),
});
const copilotSubscribers = reg.collected.subscriberBuilders.map(({ builder }) =>
  builder({ mastra: copilot.mastra }),
);

const rt = buildRuntime(env, {
  reg,
  pool: getPool('worker'),
  log: log.child({ subsystem: 'core.runtime' }),
  extraSubscribers: [
    failedLoginAlertSubscriber({
      getMailer,
    }) as import('@seta/shared-types').SubscriberDef,
    revokeSessionsOnDeactivationSubscriber() as import('@seta/shared-types').SubscriberDef,
    ...copilotSubscribers,
  ],
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
      corsOrigins: env.CORS_ORIGINS,
      copilot,
      log: log.child({ subsystem: 'server' }),
    });
    return app;
  },
});

const { server, shutdown } = await rt.startServerRuntime();
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
