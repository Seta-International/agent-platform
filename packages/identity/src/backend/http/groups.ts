import type { SessionEnv } from '@seta/core';
import type { Context, Hono } from 'hono';
import { z } from 'zod';
import {
  addGroupMembers,
  listGroupMembers,
  listUserGroups,
  removeGroupMember,
} from '../domain/group-membership.ts';
import {
  createGroup,
  deleteGroup,
  listGroups,
  setGroupRoles,
  updateGroup,
} from '../domain/groups.ts';
import { IdentityError } from '../rbac.ts';

const createBody = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  kind: z.enum(['default', 'custom']).optional(),
  is_base: z.boolean().optional(),
});
const patchBody = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
});
const rolesBody = z.object({ role_slugs: z.array(z.string()) });
const membersBody = z.object({ user_ids: z.array(z.string().uuid()) });

function statusFor(code: string): 400 | 403 | 404 {
  if (code === 'FORBIDDEN') return 403;
  if (code === 'NOT_FOUND') return 404;
  return 400;
}

async function guard<T>(c: Context<SessionEnv>, fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof IdentityError)
      return c.json({ error: err.code, message: err.message }, statusFor(err.code));
    throw err;
  }
}

export function registerGroupRoutes(app: Hono<SessionEnv>): void {
  app.get('/api/identity/v1/groups', async (c) =>
    guard(c, async () => c.json({ groups: await listGroups(c.get('user')) })),
  );

  app.post('/api/identity/v1/groups', async (c) =>
    guard(c, async () => {
      const parsed = createBody.safeParse(await c.req.json().catch(() => ({})));
      if (!parsed.success)
        return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
      const b = parsed.data;
      const s = c.get('user');
      return c.json(
        await createGroup({ tenant_id: s.tenant_id, ...b }, { type: 'user', user_id: s.user_id }),
      );
    }),
  );

  app.patch('/api/identity/v1/groups/:id', async (c) =>
    guard(c, async () => {
      const parsed = patchBody.safeParse(await c.req.json().catch(() => ({})));
      if (!parsed.success)
        return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
      const b = parsed.data;
      const s = c.get('user');
      await updateGroup(
        {
          group_id: c.req.param('id'),
          tenant_id: s.tenant_id,
          name: b.name,
          description: b.description ?? undefined,
        },
        { type: 'user', user_id: s.user_id },
      );
      return c.body(null, 204);
    }),
  );

  app.delete('/api/identity/v1/groups/:id', async (c) =>
    guard(c, async () => {
      const s = c.get('user');
      await deleteGroup(
        { group_id: c.req.param('id'), tenant_id: s.tenant_id },
        { type: 'user', user_id: s.user_id },
      );
      return c.body(null, 204);
    }),
  );

  app.put('/api/identity/v1/groups/:id/roles', async (c) =>
    guard(c, async () => {
      const parsed = rolesBody.safeParse(await c.req.json().catch(() => ({})));
      if (!parsed.success)
        return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
      const b = parsed.data;
      const s = c.get('user');
      await setGroupRoles(
        { group_id: c.req.param('id'), tenant_id: s.tenant_id, role_slugs: b.role_slugs },
        { type: 'user', user_id: s.user_id },
      );
      return c.body(null, 204);
    }),
  );

  // Registered BEFORE /:id/members so the literal 'users' segment wins over `:id`.
  app.get('/api/identity/v1/groups/users/:userId/groups', async (c) =>
    guard(c, async () =>
      c.json({ groups: await listUserGroups(c.get('user'), c.req.param('userId')) }),
    ),
  );

  app.get('/api/identity/v1/groups/:id/members', async (c) =>
    guard(c, async () =>
      c.json({ members: await listGroupMembers(c.get('user'), c.req.param('id')) }),
    ),
  );

  app.post('/api/identity/v1/groups/:id/members', async (c) =>
    guard(c, async () => {
      const parsed = membersBody.safeParse(await c.req.json().catch(() => ({})));
      if (!parsed.success)
        return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
      const b = parsed.data;
      const s = c.get('user');
      await addGroupMembers(
        { group_id: c.req.param('id'), tenant_id: s.tenant_id, user_ids: b.user_ids },
        { type: 'user', user_id: s.user_id },
      );
      return c.body(null, 204);
    }),
  );

  app.delete('/api/identity/v1/groups/:id/members/:userId', async (c) =>
    guard(c, async () => {
      const s = c.get('user');
      await removeGroupMember(
        {
          group_id: c.req.param('id'),
          tenant_id: s.tenant_id,
          user_id: c.req.param('userId'),
        },
        { type: 'user', user_id: s.user_id },
      );
      return c.body(null, 204);
    }),
  );
}
