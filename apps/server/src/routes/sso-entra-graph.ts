import type { SessionEnv } from '@seta/core';
import { IdentityError, importUsersFromEntra, listEntraImportableUsers } from '@seta/identity';
import type { Context, Hono } from 'hono';
import { z } from 'zod';

const importSchema = z.object({
  selected_oids: z.array(z.string()).min(1).max(500),
});

function requireAdmin(c: Context<SessionEnv>): void {
  const scope = c.get('user');
  const roles = scope.role_summary.roles;
  if (!roles.includes('org.admin') && !roles.includes('identity.admin')) {
    throw new IdentityError('FORBIDDEN', 'identity.user.write required');
  }
}

export function registerSsoEntraGraphRoutes(app: Hono<SessionEnv>): void {
  app.get('/api/identity/v1/sso/entra/users', async (c) => {
    requireAdmin(c);
    const scope = c.get('user');
    const users = await listEntraImportableUsers(scope.tenant_id);
    return c.json({ users });
  });

  app.post('/api/identity/v1/sso/entra/users/import', async (c) => {
    requireAdmin(c);
    const scope = c.get('user');
    const parsed = importSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: 'invalid' }, 400);
    const result = await importUsersFromEntra(
      { tenant_id: scope.tenant_id, selected_oids: parsed.data.selected_oids },
      {
        type: 'user',
        user_id: scope.user_id,
        ip: c.req.header('x-forwarded-for')?.split(',')[0]?.trim(),
      },
    );
    return c.json(result);
  });
}
