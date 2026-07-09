import { scoped } from '@seta/shared-db';
import { createMiddleware } from 'hono/factory';
import { isIdleExpired } from '../session/idle.ts';
import {
  type ExpandOrgUnits,
  getSessionScope,
  type ListRoleAssignments,
  type ResolveGroupIds,
  type ResolvePermissions,
  type ResolveProductAccess,
  type ResolveWorkerId,
  type SessionScope,
} from '../session/scope.ts';

export type SessionEnv = { Variables: { user: SessionScope } };

export interface SessionMiddlewareDeps {
  getSession: (req: { headers: Headers }) => Promise<{
    session: { id: string };
    user: {
      id: string;
      email: string;
      name: string | null;
      tenant_id?: string;
      deactivated_at?: string | Date | null;
    };
  } | null>;
  /**
   * better-auth's session payload only carries the fields it manages itself; a
   * caller whose getSession doesn't also populate user.tenant_id (the common case
   * — see SessionMiddlewareDeps.getSession) needs a separate way to learn the
   * tenant before a scope can be opened. This must be a context-free lookup (e.g.
   * identityAuthDb()-backed) since it runs before any executor context exists.
   */
  getUserTenant: (
    userId: string,
  ) => Promise<{ tenant_id: string; deactivated_at?: string | Date | null } | null>;
  signOut: (req: { headers: Headers }) => Promise<void>;
  listRoleAssignments: ListRoleAssignments;
  resolvePermissions: ResolvePermissions;
  resolveGroupIds?: ResolveGroupIds;
  resolveProductAccess?: ResolveProductAccess;
  resolveWorkerId?: ResolveWorkerId;
  expandOrgUnits?: ExpandOrgUnits;
}

export function createSessionMiddleware(deps: SessionMiddlewareDeps) {
  return createMiddleware<SessionEnv>(async (c, next) => {
    const session = await deps.getSession({ headers: c.req.raw.headers });
    if (!session?.user) {
      if (c.req.path.startsWith('/api/')) return c.json({ error: 'unauthenticated' }, 401);
      return c.redirect('/login');
    }

    // Prefer tenant_id/deactivated_at straight off the session when a caller's
    // getSession already supplies them; otherwise resolve them via a context-free
    // identity.user lookup (the common path — see SessionMiddlewareDeps.getUserTenant).
    const profile = session.user.tenant_id
      ? { tenant_id: session.user.tenant_id, deactivated_at: session.user.deactivated_at ?? null }
      : await deps.getUserTenant(session.user.id);
    const userTenantId = profile?.tenant_id;
    const deactivatedAt = profile?.deactivated_at ?? null;

    if (deactivatedAt) {
      await deps.signOut({ headers: c.req.raw.headers });
      return c.json({ error: 'user_deactivated' }, 403);
    }

    if (userTenantId && (await isIdleExpired(session.session.id, userTenantId))) {
      await deps.signOut({ headers: c.req.raw.headers });
      if (c.req.path.startsWith('/api/')) return c.json({ error: 'session_expired' }, 401);
      return c.redirect('/login?reason=idle');
    }

    // getSessionScope() itself reads tenant-scoped tables on a cache miss (role
    // assignments, groups, product access), so the executor context must already
    // be open before it runs — open it the moment the tenant is known and keep
    // the downstream handler inside the same scope.
    const buildScopeAndProceed = async (): Promise<void> => {
      const scope = await getSessionScope(
        {
          listRoleAssignments: deps.listRoleAssignments,
          resolvePermissions: deps.resolvePermissions,
          resolveGroupIds: deps.resolveGroupIds,
          resolveProductAccess: deps.resolveProductAccess,
          resolveWorkerId: deps.resolveWorkerId,
          expandOrgUnits: deps.expandOrgUnits,
        },
        session.session.id,
        session.user.id,
        session.user.email,
        session.user.name ?? '',
      );
      c.set('user', scope);
      await next();
    };

    if (userTenantId) {
      await scoped(userTenantId, buildScopeAndProceed);
    } else {
      await buildScopeAndProceed();
    }
  });
}
