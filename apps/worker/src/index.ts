import { embeddingJobs } from '@seta/copilot';
import { createContributionRegistry } from '@seta/core';
import { coreDb } from '@seta/core/db';
import { emit, withEmit } from '@seta/core/events';
import { createOutboxStore } from '@seta/core/outbox';
import { registerCoreContributions } from '@seta/core/register';
import { buildRuntime, runMigrations } from '@seta/core/runtime';
import { getEntraTenantId } from '@seta/identity';
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
import { resolveTransport } from '@seta/shared-mailer';
import { createMailerSendTask } from '@seta/shared-mailer/queue';
import pino from 'pino';
import { parseEnv } from './env.ts';
import { buildM365Boot } from './m365-boot.ts';

const log = pino({ name: 'apps/worker' });
const env = parseEnv(process.env);

initPools({ databaseUrl: env.DATABASE_URL });

const cryptoEnv = parseCryptoEnv(process.env);
const keyProvider = await createKeyProviderFromEnv(cryptoEnv);
const cryptoSvc = createCrypto({ keyProvider, log: log.child({ component: 'crypto' }) });

const reg = createContributionRegistry();
registerCoreContributions(reg);
registerIdentityContributions(reg);
registerIntegrationsContributions(reg);
registerKnowledgeContributions(reg);
registerNotificationsContributions(reg);
registerPlannerContributions(reg);
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

const m365Jobs = env.M365_WEBHOOK_SECRET
  ? buildM365Boot({ webhookSecret: env.M365_WEBHOOK_SECRET, cryptoSvc }).jobs
  : {};

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
      ...m365Jobs,
      ...embeddingJobs,
      ...knowledgeJobs,
      ...plannerEmbeddingJobs,
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
