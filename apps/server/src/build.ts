import {
  type CopilotHandle,
  registerCopilot,
  registerCopilotContributions,
} from '@seta/copilot/register';
import type { SessionLike } from '@seta/copilot-sdk';
import {
  buildHonoApp,
  type ContributionRegistry,
  createSessionMiddleware,
  type ErrorMapper,
  type SessionEnv,
  type StreamHubHandle,
} from '@seta/core';
import type { WorkerHandle } from '@seta/core/runtime';
import { listMyEffectivePermissions, listRoleGrants } from '@seta/identity';
import { auth } from '@seta/identity/auth';
import { registerKnowledgeRoutes, registerKnowledgeStreamRoutes } from '@seta/knowledge/http';
import type { KnowledgeStreamHub } from '@seta/knowledge/stream';
import { registerNotificationsRoutes } from '@seta/notifications/http';
import { NotificationStreamHub } from '@seta/notifications/stream';
import { getPool } from '@seta/shared-db';
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
   * Optional pre-built copilot engine. apps/server constructs it earlier so it
   * can hand the Mastra instance to subscriberBuilders before the dispatcher
   * starts. The smoke test omits this; buildServerApp then builds the engine
   * itself for a self-contained HTTP-only test.
   */
  copilot?: CopilotHandle;
  /** Structured logger (e.g. pino) passed down to route builders and the copilot engine. */
  log?: {
    error: (obj: unknown, msg?: string) => void;
    warn: (obj: unknown, msg?: string) => void;
  };
};

export type BuiltServerApp = {
  app: Hono<SessionEnv>;
  reg: ContributionRegistry;
};

// Bridges better-auth's session into the SessionLike shape that copilot routes
// consume (c.var.session). When there's no authenticated user, c.var.session is
// left unset and the copilot route returns 401 — except /health, which carries
// no session check. effective_permissions is computed via the identity public
// surface so both modules agree on the permission catalog.
type CopilotBridgeEnv = { Variables: { session: SessionLike } };

function createCopilotSessionBridge(deps: { listRoleGrants: typeof listRoleGrants }) {
  return createMiddleware<CopilotBridgeEnv>(async (c, next) => {
    const authSession = await auth.api.getSession({ headers: c.req.raw.headers });
    if (authSession?.user) {
      const { user } = authSession;
      const { tenant_id, grants } = await deps.listRoleGrants(user.id);
      const role_summary = {
        roles: Array.from(new Set(grants.map((g) => g.role_slug))).sort(),
        cross_tenant_read: grants.some((g) => g.role_slug === 'org.viewer'),
      };
      const perms = await listMyEffectivePermissions({ type: 'user', user_id: user.id });
      c.set('session', {
        tenant_id,
        user_id: user.id,
        effective_permissions: new Set(perms),
        role_summary,
      });
    }
    await next();
  });
}

export function registerAppContributions(reg: ContributionRegistry): void {
  // Caller owns core + identity registration; copilot is registered here so the
  // build helper stays self-contained for tests.
  registerCopilotContributions(reg);
}

export function buildServerApp(
  reg: ContributionRegistry,
  deps: BuildServerAppDeps,
): BuiltServerApp {
  const sessionMiddleware = createSessionMiddleware({
    getSession: ({ headers }) => auth.api.getSession({ headers }),
    signOut: ({ headers }) => auth.api.signOut({ headers }).then(() => undefined),
    listRoleGrants,
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

  // Copilot routes are mounted BEFORE the global session gate. Each protected
  // copilot route checks session itself via c.get('session') and returns 401 if
  // absent; /health intentionally has no check and stays public. The bridge
  // middleware below populates c.var.session from better-auth.
  const copilot =
    deps.copilot ??
    registerCopilot({ pool: deps.pool, databaseUrl: deps.databaseUrl, reg, log: deps.log });
  app.use('/api/copilot/*', createCopilotSessionBridge({ listRoleGrants }));
  copilot.attach(app as unknown as Hono);

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
