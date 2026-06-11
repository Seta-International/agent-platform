import { type AgentHandle, registerAgent, registerAgentContributions } from '@seta/agent/register';
import type { SessionLike } from '@seta/agent-sdk';
import {
  buildHonoApp,
  type ContributionRegistry,
  createOverlayStore,
  createSessionMiddleware,
  type ErrorMapper,
  type OverlayStore,
  type SessionEnv,
  type StreamHubHandle,
} from '@seta/core';
import { makeRbacCheck, setRbacCheck } from '@seta/core/rpc';
import type { WorkerHandle } from '@seta/core/runtime';
import { listRoleGrants, listTenantRoleOverlays } from '@seta/identity';
import { auth } from '@seta/identity/auth';
import { registerKnowledgeRoutes, registerKnowledgeStreamRoutes } from '@seta/knowledge/http';
import type { KnowledgeStreamHub } from '@seta/knowledge/stream';
import { registerNotificationsRoutes } from '@seta/notifications/http';
import { NotificationStreamHub } from '@seta/notifications/stream';
import { getPool } from '@seta/shared-db';
import {
  buildRegistry,
  IMPLICIT_PERMISSIONS,
  INVENTORY,
  inventoryToManifests,
  resolvePermissions,
} from '@seta/shared-rbac';
import type { Context, Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { Pool } from 'pg';
import { registerCredentialGate } from './routes/credential-gate.ts';
import { registerDiscoverRoute } from './routes/discover.ts';
import { registerEnabledModulesRoute } from './routes/enabled-modules.ts';
import { registerMeRoute } from './routes/me.ts';
import { registerObservabilityRoutes } from './routes/observability.ts';

export type BuildServerAppDeps = {
  pool: Pool;
  databaseUrl: string;
  workers: WorkerHandle;
  readinessSnapshot?: () => Promise<{
    lastTickAt: Date;
    subscriptions: Array<{ subscription: string; deadLetterCount24h: number }>;
  }>;
  streams: ReadonlyMap<string, StreamHubHandle>;
  /** Origins the browser is allowed to make credentialed requests from. */
  corsOrigins?: string[];
  /**
   * Optional pre-built agent engine. apps/server constructs it earlier so it
   * can hand the Mastra instance to subscriberBuilders before the dispatcher
   * starts. The smoke test omits this; buildServerApp then builds the engine
   * itself for a self-contained HTTP-only test — with a stub chat runtime,
   * since only the composition root (index.ts) can bind staffing adapters.
   */
  agent?: AgentHandle;
  /**
   * Shared per-tenant role-permission overlay projection. The composition root
   * passes the same instance the RolePermissionsChanged subscriber refreshes so
   * edits take effect process-wide. Omitted by the smoke test, which builds its
   * own self-contained store.
   */
  overlayStore?: OverlayStore;
  /** Structured logger (e.g. pino) passed down to route builders and the agent engine. */
  log?: {
    error: (obj: unknown, msg?: string) => void;
    warn: (obj: unknown, msg?: string) => void;
  };
};

export type BuiltServerApp = {
  app: Hono<SessionEnv>;
  reg: ContributionRegistry;
};

// Chat runtime stand-in for engine instances built without the composition
// root (deps.agent omitted, e.g. the HTTP smoke test). Real wiring lives in
// index.ts: chatOrchestration: staffingOrchestration.runStream.
function stubChatRuntimeNotWired(): Promise<import('@seta/shared-orchestration').ChatStreamRun> {
  const message = 'Chat runtime is not configured on this server build.';
  const fullStream = new ReadableStream({
    start(controller) {
      controller.enqueue({ type: 'text-start', runId: 'r', from: 'AGENT', payload: { id: 't' } });
      controller.enqueue({
        type: 'text-delta',
        runId: 'r',
        from: 'AGENT',
        payload: { id: 't', text: message },
      });
      controller.enqueue({ type: 'text-end', runId: 'r', from: 'AGENT', payload: { id: 't' } });
      controller.enqueue({
        type: 'finish',
        runId: 'r',
        from: 'AGENT',
        payload: { stepResult: { reason: 'stop' }, output: { usage: {} } },
      });
      controller.close();
    },
  });
  return Promise.resolve({
    output: {
      fullStream,
    } as unknown as import('@seta/shared-orchestration').ChatStreamRun['output'],
    finalize: async () => ({
      result: { message },
      trust: { reasoningTrace: [], evidenceCitations: [], confidenceScore: 1 },
    }),
  });
}

// Bridges better-auth's session into the SessionLike shape that agent routes
// consume (c.var.session). When there's no authenticated user, c.var.session is
// left unset and the agent route returns 401 — except /health, which carries
// no session check. effective_permissions is resolved via the shared rbac
// registry so all callers use the same permission catalog.
type AgentBridgeEnv = { Variables: { session: SessionLike } };

function createAgentSessionBridge(deps: {
  listRoleGrants: typeof listRoleGrants;
  resolve: (roles: readonly string[], tenantId: string) => Promise<ReadonlySet<string>>;
}) {
  return createMiddleware<AgentBridgeEnv>(async (c, next) => {
    const authSession = await auth.api.getSession({ headers: c.req.raw.headers });
    if (authSession?.user) {
      const { user } = authSession;
      const { tenant_id, grants } = await deps.listRoleGrants(user.id);
      const role_summary = {
        roles: Array.from(new Set(grants.map((g) => g.role_slug))).sort(),
        cross_tenant_read: grants.some((g) => g.role_slug === 'org.viewer'),
      };
      c.set('session', {
        tenant_id,
        user_id: user.id,
        effective_permissions: await deps.resolve(role_summary.roles, tenant_id),
        role_summary,
      });
    }
    await next();
  });
}

export function registerAppContributions(reg: ContributionRegistry): void {
  // Caller owns core + identity registration; agent is registered here so the
  // build helper stays self-contained for tests.
  registerAgentContributions(reg);
}

export function buildServerApp(
  reg: ContributionRegistry,
  deps: BuildServerAppDeps,
): BuiltServerApp {
  const rbacRegistry = buildRegistry(inventoryToManifests(INVENTORY));
  const overlayStore = deps.overlayStore ?? createOverlayStore({ load: listTenantRoleOverlays });
  const resolve = async (
    roles: readonly string[],
    tenantId: string,
  ): Promise<ReadonlySet<string>> =>
    resolvePermissions(rbacRegistry, roles, IMPLICIT_PERMISSIONS, await overlayStore.get(tenantId));
  // Spec 2: RPC actor overlay deferred — agent-tool RPC checks resolve from seed roles only.
  setRbacCheck(makeRbacCheck(rbacRegistry, IMPLICIT_PERMISSIONS));

  const sessionMiddleware = createSessionMiddleware({
    getSession: ({ headers }) => auth.api.getSession({ headers }),
    signOut: ({ headers }) => auth.api.signOut({ headers }).then(() => undefined),
    listRoleGrants,
    resolvePermissions: resolve,
  });

  const app = buildHonoApp(reg, { corsOrigins: deps.corsOrigins }) as unknown as Hono<SessionEnv>;

  // /discover first so it matches before better-auth's wildcard catches the prefix
  registerDiscoverRoute(app);

  // Credential gate intercepts /sign-in/email before better-auth handles it.
  // Rejects the request when the tenant has local_password_disabled = true.
  registerCredentialGate(app);

  // better-auth handles all remaining /auth/* paths; must register before sessionMiddleware so its routes are public
  app.on(['GET', 'POST'], '/api/identity/v1/auth/*', (c) => auth.handler(c.req.raw));

  // Public routes — no session required
  app.get('/health/live', (c) => c.json({ ok: true }));
  registerObservabilityRoutes(app);
  if (deps.readinessSnapshot) {
    const snapshot = deps.readinessSnapshot;
    const dlqThreshold = Number(process.env.DLQ_ALERT_THRESHOLD ?? 100);
    app.get('/health/ready', async (c) => {
      const h = await snapshot();
      const fresh = Date.now() - h.lastTickAt.getTime() < 30_000;
      const overThreshold = h.subscriptions.some((s) => s.deadLetterCount24h > dlqThreshold);
      if (!fresh) {
        return c.json({ ok: false, lastTickAt: h.lastTickAt, reason: 'stale' }, 503);
      }
      if (overThreshold) {
        return c.json(
          {
            ok: false,
            lastTickAt: h.lastTickAt,
            reason: 'dlq_threshold',
            subscriptions: h.subscriptions,
          },
          503,
        );
      }
      return c.json({ ok: true, lastTickAt: h.lastTickAt, identity: 'wired' });
    });
  }

  // Agent routes are mounted BEFORE the global session gate. Each protected
  // agent route checks session itself via c.get('session') and returns 401 if
  // absent; /health intentionally has no check and stays public. The bridge
  // middleware below populates c.var.session from better-auth.
  const agent =
    deps.agent ??
    registerAgent({
      pool: deps.pool,
      databaseUrl: deps.databaseUrl,
      reg,
      log: deps.log,
      // Self-contained HTTP-only build (no composition root): the staffing
      // orchestration can't be wired here, so chat answers with an explicit
      // not-configured message instead of crashing the whole app.
      chatOrchestration: () => stubChatRuntimeNotWired(),
    });
  app.use('/api/agent/*', createAgentSessionBridge({ listRoleGrants, resolve }));
  agent.attach(app as unknown as Hono);

  // Session middleware gates everything registered after this point
  app.use('*', sessionMiddleware);

  // Cross-cutting protected routes that stay in apps/server.
  registerMeRoute(app);
  registerEnabledModulesRoute(app, reg);

  // Module-contributed routes. Each module's build factory mounts its absolute
  // paths inside a fresh Hono app; we attach that app at '/' so the inner paths
  // (e.g. /api/planner/v1/buckets) keep their public URLs.
  const streamsView: ReadonlyMap<string, unknown> = deps.streams;
  for (const route of reg.collected.routes) {
    const subApp = route.build({
      pool: deps.pool,
      workers: deps.workers,
      streams: streamsView,
      log: deps.log,
    });
    app.route(route.mountAt, subApp as unknown as Hono<SessionEnv>);
  }

  // Knowledge + notifications routes still hand-wired because they pull
  // module-internal deps (workers, presign override, stream hub) that the
  // contribution model exposes selectively rather than en bloc.
  const knowledgeStreamHandle = deps.streams.get('knowledge') as
    | { hub: KnowledgeStreamHub }
    | undefined;
  registerKnowledgeRoutes(app, { workers: deps.workers });
  if (knowledgeStreamHandle) {
    registerKnowledgeStreamRoutes(app, knowledgeStreamHandle.hub);
  }
  const notificationStreamHandle = deps.streams.get('notifications') as
    | { hub: NotificationStreamHub }
    | undefined;
  registerNotificationsRoutes(app, notificationStreamHandle?.hub ?? new NotificationStreamHub());

  app.onError(handleServerError(reg));

  return { app, reg };
}

// Maps domain errors thrown out of any route to HTTP responses. Iterates the
// per-module errorMapper contributions; the first non-null mapping wins. Falls
// through (rethrows) when no mapper claims the error so the default 500
// handling kicks in.
export function handleServerError(reg: ContributionRegistry): (err: Error, c: Context) => Response {
  return makeErrorHandler(...reg.collected.errorMappers.map((e) => e.mapper));
}

// Test-friendly variant: tests assemble a minimal Hono app around a single
// route family, so they pick the mappers they need directly without spinning
// up a full ContributionRegistry. Production code path stays handleServerError.
export function makeErrorHandler(...mappers: ErrorMapper[]): (err: Error, c: Context) => Response {
  return (err, c) => {
    for (const mapper of mappers) {
      const mapped = mapper(err);
      if (mapped) return c.json(mapped.body, mapped.status as ContentfulStatusCode);
    }
    throw err;
  };
}

// Re-export getPool so callers building the app from the entry point don't need
// to import @seta/shared-db separately just to fetch the worker pool.
export { getPool };
