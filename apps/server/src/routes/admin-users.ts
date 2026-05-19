import type { SessionEnv } from '@seta/core';
import {
  createUser,
  deactivateUser,
  getUserGrants,
  getUserProfile,
  grantRole,
  IdentityError,
  listUsers,
  reactivateUser,
  revokeRole,
  TENANT_ROLE_SLUGS,
} from '@seta/identity';
import type { Context, Hono } from 'hono';
import { z } from 'zod';

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120),
  password: z.string().min(12).max(128),
  initial_role: z.string().optional(),
});

const grantSchema = z.object({
  role_slug: z.string(),
  scope_type: z.enum(['tenant', 'group']).default('tenant'),
  scope_id: z.string().nullable().optional(),
});

function requireAdmin(c: Context<SessionEnv>): void {
  const scope = c.get('user');
  const isAdmin =
    scope.role_summary.roles.includes('org.admin') ||
    scope.role_summary.roles.includes('identity.admin');
  if (!isAdmin) throw new IdentityError('FORBIDDEN', 'identity.user.write required');
}

export function registerAdminUsersRoutes(app: Hono<SessionEnv>): void {
  app.get('/api/identity/v1/users', async (c) => {
    requireAdmin(c);
    const scope = c.get('user');
    const search = c.req.query('search') ?? undefined;
    const role_slug = c.req.query('role') ?? undefined;
    const status =
      (c.req.query('status') as 'active' | 'deactivated' | 'ooo' | undefined) ?? undefined;
    const limit = Math.min(parseInt(c.req.query('limit') ?? '25', 10), 100);
    const offset = parseInt(c.req.query('offset') ?? '0', 10);
    const result = await listUsers(scope.tenant_id, { search, role_slug, status, limit, offset });
    return c.json(result);
  });

  app.post('/api/identity/v1/users', async (c) => {
    requireAdmin(c);
    const scope = c.get('user');
    const parsed = createSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: 'invalid', details: parsed.error.flatten() }, 400);
    const { user_id } = await createUser(
      {
        tenant_id: scope.tenant_id,
        email: parsed.data.email,
        name: parsed.data.name,
        password: parsed.data.password,
        initial_role: parsed.data.initial_role
          ? { role_slug: parsed.data.initial_role, scope_type: 'tenant', scope_id: null }
          : undefined,
      },
      {
        type: 'user',
        user_id: scope.user_id,
        ip: c.req.header('x-forwarded-for')?.split(',')[0]?.trim(),
        user_agent: c.req.header('user-agent'),
      },
    );
    return c.json({ user_id });
  });

  app.get('/api/identity/v1/users/:id', async (c) => {
    requireAdmin(c);
    const userId = c.req.param('id');
    const profile = await getUserProfile(userId);
    if (!profile) return c.json({ error: 'not_found' }, 404);
    const grants = await getUserGrants(userId);
    return c.json({ profile, grants });
  });

  app.post('/api/identity/v1/users/:id/role-grants', async (c) => {
    requireAdmin(c);
    const scope = c.get('user');
    const userId = c.req.param('id');
    const parsed = grantSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: 'invalid' }, 400);
    if (parsed.data.scope_type === 'group')
      return c.json({ error: 'group_scope_ui_deferred' }, 400);
    if (!(TENANT_ROLE_SLUGS as readonly string[]).includes(parsed.data.role_slug))
      return c.json({ error: 'unknown_role' }, 400);
    const result = await grantRole(
      {
        user_id: userId,
        tenant_id: scope.tenant_id,
        role_slug: parsed.data.role_slug,
        scope_type: 'tenant',
        scope_id: null,
      },
      { type: 'user', user_id: scope.user_id },
    );
    return c.json(result);
  });

  app.delete('/api/identity/v1/role-grants/:id', async (c) => {
    requireAdmin(c);
    const scope = c.get('user');
    await revokeRole(c.req.param('id'), { type: 'user', user_id: scope.user_id });
    return c.json({ ok: true });
  });

  app.post('/api/identity/v1/users/:id/deactivate', async (c) => {
    requireAdmin(c);
    const scope = c.get('user');
    await deactivateUser(c.req.param('id'), { type: 'user', user_id: scope.user_id });
    return c.json({ ok: true });
  });

  app.post('/api/identity/v1/users/:id/reactivate', async (c) => {
    requireAdmin(c);
    const scope = c.get('user');
    await reactivateUser(c.req.param('id'), { type: 'user', user_id: scope.user_id });
    return c.json({ ok: true });
  });
}
