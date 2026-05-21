import type { Client } from '@microsoft/microsoft-graph-client';
import type { SessionLike } from '@seta/copilot';
import { registerCopilot, registerCopilotContributions } from '@seta/copilot/register';
import {
  buildHonoApp,
  type ContributionRegistry,
  createSessionMiddleware,
  type SessionEnv,
} from '@seta/core';
import type { WorkerHandle } from '@seta/core/workers';
import { IdentityError, listMyEffectivePermissions, listRoleGrants } from '@seta/identity';
import { auth } from '@seta/identity/auth';
import type { m365 } from '@seta/integrations';
import { PlannerError } from '@seta/planner';
import { getPool } from '@seta/shared-db';
import type { Context, Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { Pool } from 'pg';
import type { BoardStreamHub } from './board-stream/hub.ts';
import { registerAdminAuditRoutes } from './routes/admin-audit.ts';
import { registerAdminUsersRoutes } from './routes/admin-users.ts';
import { registerCredentialGate } from './routes/credential-gate.ts';
import { registerDiscoverRoute } from './routes/discover.ts';
import { registerIntegrationsM365Routes } from './routes/integrations-m365.ts';
import { registerMeRoute } from './routes/me.ts';
import { registerPlannerBoardStreamRoutes } from './routes/planner-board-stream.ts';
import { registerPlannerBucketsRoutes } from './routes/planner-buckets.ts';
import { registerPlannerGroupsRoutes } from './routes/planner-groups.ts';
import { registerPlannerPlansRoutes } from './routes/planner-plans.ts';
import { registerPlannerTasksRoutes } from './routes/planner-tasks.ts';
import { registerProfileRoutes } from './routes/profile.ts';
import { registerSsoConsentRoutes } from './routes/sso-consent.ts';
import { registerSsoEntraGraphRoutes } from './routes/sso-entra-graph.ts';
import { registerSsoProvidersRoutes } from './routes/sso-providers.ts';
import { registerTenantSettingsRoutes } from './routes/tenant-settings.ts';
import { registerUsersEmailRoutes } from './routes/users-email.ts';

export type BuildServerAppDeps = {
  pool: Pool;
  databaseUrl: string;
  readinessSnapshot?: () => { lastTickAt: Date };
  boardStreamHub?: BoardStreamHub;
  m365GraphClientFor?: (tenantId: string) => Promise<Client>;
  m365Workers?: WorkerHandle;
  m365LinksRepo?: m365.M365GroupLinkRepo;
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

  const app = buildHonoApp(reg) as unknown as Hono<SessionEnv>;

  // /discover first so it matches before better-auth's wildcard catches the prefix
  registerDiscoverRoute(app);

  // Credential gate intercepts /sign-in/email before better-auth handles it.
  // Rejects the request when the tenant has local_password_disabled = true.
  registerCredentialGate(app);

  // better-auth handles all remaining /auth/* paths; must register before sessionMiddleware so its routes are public
  app.on(['GET', 'POST'], '/api/identity/v1/auth/*', (c) => auth.handler(c.req.raw));

  // Public routes — no session required
  app.get('/health/live', (c) => c.json({ ok: true }));
  if (deps.readinessSnapshot) {
    const snapshot = deps.readinessSnapshot;
    app.get('/health/ready', (c) => {
      const h = snapshot();
      const fresh = Date.now() - h.lastTickAt.getTime() < 30_000;
      return c.json({ ok: fresh, lastTickAt: h.lastTickAt, identity: 'wired' }, fresh ? 200 : 503);
    });
  }

  // Copilot routes are mounted BEFORE the global session gate. Each protected
  // copilot route checks session itself via c.get('session') and returns 401 if
  // absent; /health intentionally has no check and stays public. The bridge
  // middleware below populates c.var.session from better-auth.
  const copilot = registerCopilot({ pool: deps.pool, databaseUrl: deps.databaseUrl });
  app.use('/api/copilot/*', createCopilotSessionBridge({ listRoleGrants }));
  copilot.attach(app as unknown as Hono);

  // Session middleware gates everything registered after this point
  app.use('*', sessionMiddleware);

  // Protected routes
  registerMeRoute(app);
  registerProfileRoutes(app);
  registerAdminUsersRoutes(app);
  registerAdminAuditRoutes(app);
  registerUsersEmailRoutes(app);
  registerSsoConsentRoutes(app);
  registerSsoProvidersRoutes(app);
  registerSsoEntraGraphRoutes(app);
  registerTenantSettingsRoutes(app);
  registerPlannerGroupsRoutes(app);
  registerPlannerPlansRoutes(app);
  registerPlannerBucketsRoutes(app);
  registerPlannerTasksRoutes(app);
  if (deps.boardStreamHub) {
    registerPlannerBoardStreamRoutes(app, deps.boardStreamHub);
  }
  if (deps.m365GraphClientFor && deps.m365Workers && deps.m365LinksRepo) {
    registerIntegrationsM365Routes(app, {
      graphClientFor: deps.m365GraphClientFor,
      workers: deps.m365Workers,
      m365LinksRepo: deps.m365LinksRepo,
    });
  }

  app.onError(handleServerError);

  return { app, reg };
}

// Maps domain errors thrown out of any route to HTTP responses. Exported so
// tests can register the exact same handler when they assemble a minimal Hono
// app for session injection — keeping route-error behaviour single-sourced.
export function handleServerError(err: Error, c: Context): Response {
  if (err instanceof PlannerError) {
    const status: ContentfulStatusCode =
      err.code === 'FORBIDDEN'
        ? 403
        : err.code === 'NOT_FOUND'
          ? 404
          : err.code === 'CONFLICT'
            ? 409
            : err.code === 'CROSS_TENANT'
              ? 403
              : err.code === 'VALIDATION'
                ? 400
                : err.code === 'LINKED_GROUP_IMMUTABLE_MEMBERS'
                  ? 409
                  : err.code === 'LINKED_DUPLICATE'
                    ? 409
                    : err.code === 'DUPLICATE_REFERENCE'
                      ? 409
                      : err.code === 'RESERVED_FOR_SYSTEM_ACTOR'
                        ? 403
                        : 400;
    return c.json({ error: err.code, message: err.message, details: err.details }, status);
  }
  if (err instanceof IdentityError) {
    const status: ContentfulStatusCode =
      err.code === 'FORBIDDEN' ? 403 : err.code === 'USER_NOT_FOUND' ? 404 : 400;
    return c.json({ error: err.code, message: err.message }, status);
  }
  throw err;
}

// Re-export getPool so callers building the app from the entry point don't need
// to import @seta/shared-db separately just to fetch the worker pool.
export { getPool };
