import type { SessionEnv } from '@seta/core';
import { can } from '@seta/shared-rbac';
import type { Hono } from 'hono';
import { IdentityError, searchDirectory } from '../../index.ts';

/**
 * Read-only people directory used by assignee / mention pickers.
 *
 * FUT-54 root cause: the pickers searched users through the admin user-management
 * endpoint `GET /api/identity/v1/users`, which is gated by an admin role (`requireAdmin`)
 * and rejects everyone else with `identity.user.update required`. A Planner Contributor
 * has `planner.task.assign` but no identity admin role, so picking an assignee 403'd and
 * the UI showed "No users found."
 *
 * Fix: a *read* action (listing people to assign) belongs behind a *read* permission,
 * not the admin write gate. This separate endpoint is readable by any authenticated
 * tenant member (implicit `identity.user.read`) and returns a minimal projection
 * (id/name/email, active users only) — no roles/status/admin data. The admin `/users`
 * endpoint stays admin-only; do NOT point pickers back at it.
 */
export function registerDirectoryRoutes(app: Hono<SessionEnv>): void {
  app.get('/api/identity/v1/directory', async (c) => {
    const scope = c.get('user');
    if (!can(scope, 'identity.user.read')) {
      throw new IdentityError('FORBIDDEN', 'identity.user.read required');
    }
    const search = c.req.query('search') ?? undefined;
    const sign_in_method =
      (c.req.query('sign_in_method') as 'credential' | 'microsoft' | 'both' | undefined) ??
      undefined;
    const limit = Math.min(parseInt(c.req.query('limit') ?? '8', 10), 50);
    const offset = parseInt(c.req.query('offset') ?? '0', 10);
    const result = await searchDirectory(scope.tenant_id, {
      search,
      sign_in_method,
      limit,
      offset,
    });
    return c.json(result);
  });
}
