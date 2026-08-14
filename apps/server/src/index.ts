import './otel.ts'; // MUST be first; see otel.ts header comment.
import './undici-timeouts.ts'; // MUST run before any outbound fetch.
import { AgentRunStateRepository, resolveModel } from '@seta/agent';
import { createAgentMastraStorage, registerAgent } from '@seta/agent/register';
import { createContributionRegistry, createOverlayStore, requestIdStorage } from '@seta/core';
import { readLatestScores } from '@seta/core/agent-eval';
import { coreDb } from '@seta/core/db';
import { emit, withEmit } from '@seta/core/events';
import { createOutboxStore } from '@seta/core/outbox';
import { registerCoreContributions } from '@seta/core/register';
import { buildRuntime, runMigrations, type WorkerHandle } from '@seta/core/runtime';
import { registerHiringContributions } from '@seta/hiring/register';
import { listTenantRoleOverlays } from '@seta/identity';
import { registerIdentityContributions } from '@seta/identity/register';
import { registerIntegrationsContributions } from '@seta/integrations/register';
import {
  ContextOverflowError,
  consumeThreadAttachmentsAsText,
  markAttachmentsConsumed,
  markAttachmentsFailed,
} from '@seta/knowledge';
import { registerKnowledgeContributions } from '@seta/knowledge/register';
import { registerNotificationsContributions } from '@seta/notifications/register';
import { getPeopleVectorStore } from '@seta/people';
import { registerPeopleContributions } from '@seta/people/register';
import {
  makeAssign,
  makeAvailability,
  makeSkillSearch,
  makeTaskAssignees,
  makeTaskReader,
  makeTaskSearch,
  makeUserProfileLookup,
} from '@seta/planner/orchestration';
import { registerPlannerContributions } from '@seta/planner/register';
import { registerPmContributions } from '@seta/pm/register';
import { createCrypto, createKeyProviderFromEnv, parseCryptoEnv } from '@seta/shared-crypto';
import { closePools, getPool, initPools } from '@seta/shared-db';
import { resolveEmbeddingProvider } from '@seta/shared-embeddings';
import { createMailer } from '@seta/shared-mailer';
// MODULE_IMPORTS_END — generator inserts new register*Contributions imports above this comment.
import pino from 'pino';
import { makeActionPreviewPort, makeFindOpenPreview } from './action-preview-port.ts';
import { initAgentEvalMetrics } from './agent-eval-metrics.ts';
import { buildServerApp, registerAppContributions } from './build.ts';
import { makeIntentClassifier } from './chat-routing/intent-classifier.ts';
import { makeChatRouter } from './chat-routing/route-chat.ts';
import { composeRegistries } from './compose-registries.ts';
import { parseEnv } from './env.ts';
import { logStreams } from './log-streams.ts';
import { failedLoginAlertSubscriber } from './subscribers/failed-login-alert.ts';
import { refreshRoleOverlaySubscriber } from './subscribers/refresh-role-overlay.ts';
import { revokeSessionsOnDeactivationSubscriber } from './subscribers/revoke-sessions-on-deactivation.ts';

const log = pino(
  {
    name: 'apps/server',
    mixin() {
      const requestId = requestIdStorage.getStore()?.requestId;
      return requestId ? { request_id: requestId } : {};
    },
  },
  pino.multistream(logStreams('server')),
);
const env = parseEnv(process.env);

initPools({
  databaseUrl: env.DATABASE_URL,
  appDatabaseUrl: env.DATABASE_APP_URL,
  log: log.child({ subsystem: 'shared-db' }),
});

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
registerPeopleContributions(reg);
registerHiringContributions(reg);
registerPmContributions(reg);
// MODULE_REGISTRATIONS_END — generator inserts new register*Contributions(reg) calls above this comment.
registerAppContributions(reg);

// Single per-tenant role-permission overlay projection shared by the HTTP
// permission resolver (buildServerApp) and the RolePermissionsChanged
// subscriber that refreshes it, so admin edits take effect process-wide.
const overlayStore = createOverlayStore({ load: listTenantRoleOverlays });

const lag = await runMigrations(reg, { pool: getPool('worker'), assertCaughtUpOnly: true });
if (lag.length > 0) {
  log.error({ lag }, 'schema_migrations behind — run apps/cli migrate before booting server');
  process.exit(1);
}

// Re-export the latest nightly agent-quality scores as OTel gauges for Grafana.
// Advisory: refresh failures hold the last snapshot and never affect the server.
initAgentEvalMetrics({ readLatest: () => readLatestScores(coreDb()) });

// Forward reference: the mailer is wired after workers start so its addJob target
// (the WorkerHandle) exists. The reference is set inside onServerStart before any
// route handler can pull from the mailer.
let mailerRef: import('@seta/shared-mailer').Mailer | undefined;
const getMailer = (): import('@seta/shared-mailer').Mailer => {
  if (!mailerRef) throw new Error('mailer not yet initialised');
  return mailerRef;
};

const outboxStore = createOutboxStore({ db: coreDb() });

// apps/server is the only layer allowed to bind assignment adapters
// (planner/identity reads + the agent model) to the engine surface. Run
// persistence still comes from staffing's local tables — Task 3 swaps this
// repo for an agent-backed implementation.
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
// ONE shared Mastra store for both the engine runtime and the assignment
// orchestrator's per-turn Mastra. Cross-Mastra-instance native-suspend resume
// requires both wrap the SAME physical store; the engine's Mastra is built from
// getPool('worker'), so the orchestrator must share that exact pool.
const mastraStorage = createAgentMastraStorage({ pool: getPool('worker') });

// Compose the planner Query, weekly-plan, and assignment orchestration runtimes
// (built here so their registrations land before the registries freeze) and
// freeze SpecializedAgentRegistry, OrchestrationRegistry, and AgentRegistry —
// the same composition the agent-registry-integrity test drives standalone.
// The assignment orchestrator's DB-bound ports/repo/store are real adapters
// here; tests/helpers/compose.ts's testComposeDeps() wires fakes instead, so
// the eval-coverage and registry-integrity gates see this specialist too.
const {
  plannerQueryOrchestration,
  weeklyPlanOrchestration,
  assignmentOrchestration,
  actionOrchestration,
} = composeRegistries({
  resolveModel: () => resolveModel('auto', { tierHint: 'fast' }).model,
  embeddingProvider: resolveEmbeddingProvider(),
  databaseUrl: env.DATABASE_URL,
  assignmentPorts: {
    taskReader: makeTaskReader(),
    taskSearch: makeTaskSearch(),
    skillSearch: makeSkillSearch({
      provider: identityEmbeddingProvider,
      pgVector: getPeopleVectorStore(env.DATABASE_URL),
    }),
    availability: makeAvailability(),
    userProfileLookup: makeUserProfileLookup(),
    assign: makeAssign(),
    taskAssignees: makeTaskAssignees(),
  },
  assignmentRepo: new AgentRunStateRepository(),
  mastraStorage,
  actionPreviewPort: makeActionPreviewPort(),
});

// Tiered chat router: classify each turn (tier-1 domain hard-coded to planner;
// tier-2 assignment vs planner_qna) and dispatch to the matching runtime. Composed
// here because apps/server is the only layer that can see both runtimes; the
// agent engine stays import-isolated and receives one chatOrchestration function.
const chatRouter = makeChatRouter({
  classify: makeIntentClassifier({
    // The classifier runs on the deployment's DEFAULT model (AGENT_MODEL_DEFAULT)
    // — locally the self-hosted llama.cpp box — not on `auto`. `auto` with a
    // `fast` hint is a lie in this catalog: no entry declares tier `fast`, so
    // pickAuto falls to `fast ?? first` and every classification silently went to
    // whichever cloud model happens to be listed first. One word per turn, on the
    // hot path of every chat message, is exactly the work the local model should
    // carry. Passing the hint anyway keeps `AGENT_MODEL_DEFAULT=auto`
    // deployments behaving as they do today.
    resolveModel: () => resolveModel(undefined, { tierHint: 'fast' }).model,
  }),
  assignment: assignmentOrchestration.runStream,
  plannerQuery: plannerQueryOrchestration.runStream,
  weeklyPlanner: weeklyPlanOrchestration.runStream,
  // A2: a change request gets a preview card and writes nothing until confirmed.
  action: actionOrchestration.runStream,
  // The revision loop's first move: tell A2 which preview is already waiting
  // (FUT-840). Bound to planner.action, so a recommend card is never adjustable.
  findOpenPreview: makeFindOpenPreview(),
});

// Build the agent engine up front so subscriberBuilders contributed by
// orchestrator modules (e.g. the planner assignment orchestrator) can be
// constructed against the live Mastra instance before the dispatcher starts.
const agent = registerAgent({
  pool: getPool('worker'),
  databaseUrl: env.DATABASE_URL,
  reg,
  // Reuse the SAME store instance the assignment orchestrator wraps so the
  // engine Mastra and the per-turn orchestrator Mastra share one physical store.
  mastraStorage,
  log: log.child({ subsystem: 'agent' }),
  // The chat runtime: every chat turn streams through the tiered chat router,
  // which classifies the turn and dispatches to the assignment or planner_qna
  // runtime. apps/server is the only layer that can compose both.
  chatOrchestration: chatRouter,
  // Native-suspend HITL resume. apps/server is the only layer that can see both
  // runtimes, so the dispatch lives here rather than in a registry inside
  // @seta/agent (revisit at the A0 orchestrator split). The card's own
  // workflow_id — read off the persisted row by the route — picks the runtime.
  resumeOrchestration: async (resume, ctx) => {
    if (ctx.workflowId === 'planner.action') {
      return actionOrchestration.runResume(resume as never, ctx);
    }
    if (ctx.workflowId === 'planner.assignment-orchestrator') {
      return assignmentOrchestration.runResume(resume as never, ctx);
    }
    throw Object.assign(new Error(`no resume runtime for ${ctx.workflowId}`), {
      code: 'not_supported',
    });
  },
  // Chat attachments: apps/server is the only layer that can import the
  // @seta/knowledge consume/mark functions into the engine surface.
  consumeThreadAttachments: async ({ tenantId, threadId, query }) => {
    try {
      const r = await consumeThreadAttachmentsAsText({
        tenant_id: tenantId,
        thread_id: threadId,
        query,
        contextWindowTokens: Number(process.env.CHAT_ATTACHMENT_CONTEXT_WINDOW_TOKENS ?? 128_000),
        reservedOutputTokens: Number(
          process.env.CHAT_ATTACHMENT_CONTEXT_RESERVED_OUTPUT_TOKENS ?? 4_096,
        ),
        safetyRatio: Number(process.env.CHAT_ATTACHMENT_CONTEXT_SAFETY_RATIO ?? 0.9),
      });
      return {
        kind: 'ok' as const,
        contextBlock: r.contextBlock,
        consumedFileIds: r.consumedFileIds,
        failedFileIds: r.failedFileIds,
      };
    } catch (e) {
      if (e instanceof ContextOverflowError) {
        return {
          kind: 'overflow' as const,
          requiredTokens: e.requiredTokens,
          budgetTokens: e.budgetTokens,
        };
      }
      return {
        kind: 'error' as const,
        message: e instanceof Error ? e.message : 'attachment failed',
      };
    }
  },
  markAttachmentsConsumed: (ids) => markAttachmentsConsumed(ids),
  markAttachmentsFailed: (ids) => markAttachmentsFailed(ids),
});
const agentSubscribers = reg.collected.subscriberBuilders.map(({ builder }) =>
  builder({ mastra: agent.mastra }),
);

const rt = buildRuntime(env, {
  reg,
  pool: getPool('worker'),
  log: log.child({ subsystem: 'core.runtime' }),
  // The orchestration kernel's queued runner (production async path). The chat
  // harness uses assignmentOrchestration.runStream instead; same registries.
  extraJobs: {
    ...assignmentOrchestration.taskList,
  },
  extraSubscribers: [
    failedLoginAlertSubscriber({
      getMailer,
    }) as import('@seta/shared-types').SubscriberDef,
    revokeSessionsOnDeactivationSubscriber() as import('@seta/shared-types').SubscriberDef,
    refreshRoleOverlaySubscriber({ overlayStore }) as import('@seta/shared-types').SubscriberDef,
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
      overlayStore,
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
