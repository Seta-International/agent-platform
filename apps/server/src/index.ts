import './otel.ts'; // MUST be first; see otel.ts header comment.
import { resolveModel } from '@seta/agent';
import { registerAgent } from '@seta/agent/register';
import { SpecializedAgentRegistry } from '@seta/agent-sdk';
import { createContributionRegistry, requestIdStorage } from '@seta/core';
import { coreDb } from '@seta/core/db';
import { emit, withEmit } from '@seta/core/events';
import { createOutboxStore } from '@seta/core/outbox';
import { registerCoreContributions } from '@seta/core/register';
import { buildRuntime, runMigrations, type WorkerHandle } from '@seta/core/runtime';
import { getIdentityVectorStore } from '@seta/identity';
import { registerIdentityContributions } from '@seta/identity/register';
import { registerIntegrationsContributions } from '@seta/integrations/register';
import { registerKnowledgeContributions } from '@seta/knowledge/register';
import { registerNotificationsContributions } from '@seta/notifications/register';
import { plannerProposeAssignmentChatHitlDecider } from '@seta/planner/agent-tools';
import { registerPlannerContributions } from '@seta/planner/register';
import { createCrypto, createKeyProviderFromEnv, parseCryptoEnv } from '@seta/shared-crypto';
import { closePools, getPool, initPools } from '@seta/shared-db';
import { resolveEmbeddingProvider } from '@seta/shared-embeddings';
import { createMailer } from '@seta/shared-mailer';
import { OrchestrationRegistry } from '@seta/shared-orchestration';
import {
  buildStaffingOrchestrationRuntime,
  makeAvailability,
  makeSkillSearch,
  makeTaskReader,
  makeTaskSearch,
  StaffingRunStateRepository,
} from '@seta/staffing';
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

// Build the staffing orchestration runtime (specialized agents + DAG) and freeze
// the kernel registries. apps/server is the only layer allowed to bind staffing
// adapters (planner/identity reads + the agent model) to the engine surface.
const identityEmbeddingProvider: ReturnType<typeof resolveEmbeddingProvider> = {
  // Lazy proxy: defer the OPENAI_API_KEY check to the first embed call (runtime)
  // so the server still boots without a key, matching identity's own lazy use.
  get modelId() {
    return resolveEmbeddingProvider().modelId;
  },
  get dimensions() {
    return resolveEmbeddingProvider().dimensions;
  },
  embed: (...args) => resolveEmbeddingProvider().embed(...args),
};
const staffingOrchestration = buildStaffingOrchestrationRuntime({
  repo: new StaffingRunStateRepository(),
  resolveModel: () => resolveModel('auto', { tierHint: 'fast' }).model,
  ports: {
    taskReader: makeTaskReader(),
    taskSearch: makeTaskSearch(),
    skillSearch: makeSkillSearch({
      provider: identityEmbeddingProvider,
      pgVector: getIdentityVectorStore(env.DATABASE_URL),
    }),
    availability: makeAvailability(),
  },
});
SpecializedAgentRegistry.freeze();
OrchestrationRegistry.freeze();

// Build the agent engine up front so subscriberBuilders contributed by
// orchestrator modules (e.g. staffing) can be constructed against the live
// Mastra instance before the dispatcher starts.
const agent = registerAgent({
  pool: getPool('worker'),
  databaseUrl: env.DATABASE_URL,
  reg,
  log: log.child({ subsystem: 'agent' }),
  // Chat-flow HITL deciders: called by decide-approval when the approval was
  // created by a chat-flow tool (workflow_id starts with '__chat_hitl:').
  // Wired here because this is the only layer that can import from both the
  // agent engine (packages/agent) and feature modules (packages/planner).
  chatHitlDeciders: {
    planner_proposeAssignment: plannerProposeAssignmentChatHitlDecider,
  },
  // The chat runtime: every chat turn streams through the inline staffing
  // orchestration. apps/server is the only layer that can bind the staffing
  // runtime to the engine surface.
  chatOrchestration: staffingOrchestration.runInline,
});
const agentSubscribers = reg.collected.subscriberBuilders.map(({ builder }) =>
  builder({ mastra: agent.mastra }),
);

const rt = buildRuntime(env, {
  reg,
  pool: getPool('worker'),
  log: log.child({ subsystem: 'core.runtime' }),
  // The orchestration kernel's queued runner (production async path). The chat
  // harness uses staffingOrchestration.runInline instead; same registries.
  extraJobs: {
    ...staffingOrchestration.taskList,
  },
  extraSubscribers: [
    failedLoginAlertSubscriber({
      getMailer,
    }) as import('@seta/shared-types').SubscriberDef,
    revokeSessionsOnDeactivationSubscriber() as import('@seta/shared-types').SubscriberDef,
    ...agentSubscribers,
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
      agent,
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
