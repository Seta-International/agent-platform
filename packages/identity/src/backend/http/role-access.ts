import type { SessionEnv } from '@seta/core';
import type { Hono } from 'hono';
import { z } from 'zod';
import { getRoleAccessMatrix, resetRoleToDefaults, setRolePermission } from '../../index.ts';

const setSchema = z.object({ enabled: z.boolean() });

export function registerRoleAccessRoutes(app: Hono<SessionEnv>): void {
  app.get('/api/identity/v1/role-access', async (c) => {
    const scope = c.get('user');
    const module = c.req.query('module') ?? undefined;
    const roles = await getRoleAccessMatrix(scope, { module });
    return c.json({ roles });
  });

  app.put('/api/identity/v1/role-access/:role/:permission', async (c) => {
    const scope = c.get('user');
    const parsed = setSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: 'invalid' }, 400);
    await setRolePermission(scope, {
      role_slug: c.req.param('role'),
      permission_key: c.req.param('permission'),
      enabled: parsed.data.enabled,
    });
    return c.json({ ok: true });
  });

  app.post('/api/identity/v1/role-access/:role/reset', async (c) => {
    const scope = c.get('user');
    await resetRoleToDefaults(scope, { role_slug: c.req.param('role') });
    return c.json({ ok: true });
  });
}
