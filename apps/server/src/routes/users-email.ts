import type { SessionEnv } from '@seta/core';
import { changeUserEmail, IdentityError } from '@seta/identity';
import type { Context, Hono } from 'hono';
import { z } from 'zod';

const patchSchema = z.object({ new_email: z.string().email() });

function requireAdmin(c: Context<SessionEnv>): void {
  const scope = c.get('user');
  const roles = scope.role_summary.roles;
  if (!roles.includes('org.admin') && !roles.includes('identity.admin')) {
    throw new IdentityError('FORBIDDEN', 'identity.user.email.change required');
  }
}

export function registerUsersEmailRoutes(app: Hono<SessionEnv>): void {
  app.patch('/api/identity/v1/users/:id/email', async (c) => {
    requireAdmin(c);
    const scope = c.get('user');
    const parsed = patchSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: 'invalid' }, 400);
    const out = await changeUserEmail(
      { user_id: c.req.param('id'), new_email: parsed.data.new_email, reason: 'admin' },
      { type: 'user', user_id: scope.user_id },
    );
    return c.json(out);
  });
}
