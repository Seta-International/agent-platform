import type { SessionEnv } from '@seta/core';
import { getUserProfile, searchSkills, updateUserProfile } from '@seta/identity';
import type { Hono } from 'hono';
import { z } from 'zod';

const patchSchema = z.object({
  display_name: z.string().min(1).max(120).optional(),
  availability_status: z.enum(['available', 'busy', 'ooo']).optional(),
  ooo_until: z.string().datetime().nullable().optional(),
  timezone: z.string().min(1).optional(),
  skills: z.array(z.string()).optional(),
});

export function registerProfileRoutes(app: Hono<SessionEnv>): void {
  app.get('/api/identity/v1/profile', async (c) => {
    const scope = c.get('user');
    const profile = await getUserProfile(scope.user_id);
    if (!profile) return c.json({ error: 'not_found' }, 404);
    return c.json(profile);
  });

  app.patch('/api/identity/v1/profile', async (c) => {
    const scope = c.get('user');
    const body = await c.req.json().catch(() => ({}));
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success)
      return c.json({ error: 'invalid_patch', details: parsed.error.flatten() }, 400);

    const patch = {
      ...parsed.data,
      ooo_until:
        parsed.data.ooo_until === undefined
          ? undefined
          : parsed.data.ooo_until
            ? new Date(parsed.data.ooo_until)
            : null,
    };
    const updated = await updateUserProfile(scope.user_id, patch, {
      type: 'user',
      user_id: scope.user_id,
      ip: c.req.header('x-forwarded-for')?.split(',')[0]?.trim(),
      user_agent: c.req.header('user-agent'),
    });
    return c.json(updated);
  });

  app.get('/api/identity/v1/skills', async (c) => {
    const scope = c.get('user');
    const prefix = c.req.query('prefix') ?? '';
    const limit = Math.min(parseInt(c.req.query('limit') ?? '20', 10), 50);
    const results = await searchSkills(scope.tenant_id, prefix, limit);
    return c.json({ results });
  });
}
