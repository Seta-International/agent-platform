import { createMiddleware } from 'hono/factory';
import { isIdleExpired } from '../session/idle.ts';
import {
  type ExpandOrgUnits,
  getSessionScope,
  type ListRoleAssignments,
  type ResolveGroupIds,
  type ResolvePermissions,
  type ResolvePersonId,
  type ResolveProductAccess,
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
  signOut: (req: { headers: Headers }) => Promise<void>;
  listRoleAssignments: ListRoleAssignments;
  resolvePermissions: ResolvePermissions;
  resolveGroupIds?: ResolveGroupIds;
  resolveProductAccess?: ResolveProductAccess;
  resolvePersonId?: ResolvePersonId;
  expandOrgUnits?: ExpandOrgUnits;
}

export function createSessionMiddleware(deps: SessionMiddlewareDeps) {
  return createMiddleware<SessionEnv>(async (c, next) => {
    const session = await deps.getSession({ headers: c.req.raw.headers });
    if (!session?.user) {
      if (c.req.path.startsWith('/api/')) return c.json({ error: 'unauthenticated' }, 401);
      return c.redirect('/login');
    }

    const userTenantId = session.user.tenant_id;
    const deactivatedAt = session.user.deactivated_at ?? null;

    if (deactivatedAt) {
      await deps.signOut({ headers: c.req.raw.headers });
      return c.json({ error: 'user_deactivated' }, 403);
    }

    if (userTenantId && (await isIdleExpired(session.session.id, userTenantId))) {
      await deps.signOut({ headers: c.req.raw.headers });
      if (c.req.path.startsWith('/api/')) return c.json({ error: 'session_expired' }, 401);
      return c.redirect('/login?reason=idle');
    }

    const scope = await getSessionScope(
      {
        listRoleAssignments: deps.listRoleAssignments,
        resolvePermissions: deps.resolvePermissions,
        resolveGroupIds: deps.resolveGroupIds,
        resolveProductAccess: deps.resolveProductAccess,
        resolvePersonId: deps.resolvePersonId,
        expandOrgUnits: deps.expandOrgUnits,
      },
      session.session.id,
      session.user.id,
      session.user.email,
      session.user.name ?? '',
    );
    c.set('user', scope);
    await next();
  });
}
