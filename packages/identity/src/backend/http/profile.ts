import type { SessionEnv } from '@seta/core';
import type { Hono } from 'hono';
import { z } from 'zod';
import { getUserProfile, updateUserProfile } from '../../index.ts';

// Identity self-profile = account only (display_name). Presence/skills/bio are
// owned by People and edited via /api/people/v1/me/*.
const patchSchema = z.object({
  display_name: z.string().min(1).max(120).optional(),
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

    const updated = await updateUserProfile(scope.user_id, parsed.data, {
      type: 'user',
      user_id: scope.user_id,
      ip: c.req.header('x-forwarded-for')?.split(',')[0]?.trim(),
      user_agent: c.req.header('user-agent'),
    });
    return c.json(updated);
  });
}
