import './otel.ts'; // MUST be first; see otel.ts header comment.
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
import { plannerEmbeddingJobs, plannerMembershipJobs } from '@seta/planner';
import { registerPlannerContributions } from '@seta/planner/register';
import { createCrypto, createKeyProviderFromEnv, parseCryptoEnv } from '@seta/shared-crypto';
import { closePools, getPool, initPools } from '@seta/shared-db';
import { resolveTransport } from '@seta/shared-mailer';
import { createMailerSendTask } from '@seta/shared-mailer/queue';
import { registerStaffingContributions } from '@seta/staffing/register';
// MODULE_IMPORTS_END — generator inserts new register*Contributions imports above this comment.
import pino from 'pino';
import { parseEnv } from './env.ts';
import { logStreams } from './log-streams.ts';

const log = pino({ name: 'apps/worker' }, pino.multistream(logStreams('worker')));
const env = parseEnv(process.env);

initPools({ databaseUrl: env.DATABASE_URL });

const cryptoEnv = parseCryptoEnv(process.env);
const keyProvider = await createKeyProviderFromEnv(cryptoEnv);
const cryptoSvc = createCrypto({ keyProvider, log: log.child({ component: 'crypto' }) });

// Forward reference for the WorkerHandle so m365 boot's job handlers can
// enqueue follow-on jobs once the worker pool is running.
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
  webhookSecret: env.M365_WEBHOOK_SECRET,
  getWorkers,
});
registerKnowledgeContributions(reg);
registerNotificationsContributions(reg);
registerPlannerContributions(reg);
registerStaffingContributions(reg);
// MODULE_REGISTRATIONS_END — generator inserts new register*Contributions(reg) calls above this comment.
log.info('contributions registered');

const lag = await runMigrations(reg, { pool: getPool('worker'), assertCaughtUpOnly: true });
if (lag.length > 0) {
  log.error({ lag }, 'schema_migrations behind — run apps/cli migrate before booting worker');
  process.exit(1);
}

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

const rt = buildRuntime(
  { PORT: 0, DATABASE_URL: env.DATABASE_URL },
  {
    reg,
    pool: getPool('worker'),
    buildServerApp: () => {
      throw new Error('apps/worker does not build a server app');
    },
    extraJobs: {
      'mailer:send': async (payload) => {
        await mailerSendTask(payload as never);
      },
      ...embeddingJobs,
      ...knowledgeJobs,
      ...plannerEmbeddingJobs,
      ...plannerMembershipJobs,
    },
    onWorkerStart: ({ workers }) => {
      workerHandleRef = workers;
    },
  },
);

const { shutdown } = await rt.startWorkerRuntime();
log.info('worker started');

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
