import type { SessionEnv } from '@seta/core';
import type { Hono } from 'hono';
import { z } from 'zod';
import { readMyProfile, setBio, setMySkills, setPresence } from '../../index.ts';

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const presenceBody = z.object({
  availability_status: z.enum(['available', 'busy', 'ooo']).optional(),
  ooo_until: z.string().datetime().nullable().optional(),
  timezone: z.string().min(1).optional(),
  working_hours: z
    .object({ start: z.string().regex(HHMM_RE), end: z.string().regex(HHMM_RE) })
    .nullable()
    .optional(),
});

const skillsBody = z.object({ skills: z.array(z.string()) });
const bioBody = z.object({ bio: z.string().max(500).nullable() });

// Self-service profile: every route resolves the caller's own person via the
// session (c.get('user')) — no worker/user id in the path.
export function registerPeopleMeRoutes(app: Hono<SessionEnv>): void {
  app.get('/api/people/v1/me/profile', async (c) => c.json(await readMyProfile(c.get('user'))));

  app.patch('/api/people/v1/me/presence', async (c) => {
    const parsed = presenceBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    const { ooo_until, ...rest } = parsed.data;
    await setPresence(c.get('user'), {
      ...rest,
      ooo_until:
        ooo_until === undefined ? undefined : ooo_until === null ? null : new Date(ooo_until),
    });
    return c.body(null, 204);
  });

  app.put('/api/people/v1/me/skills', async (c) => {
    const parsed = skillsBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    await setMySkills(c.get('user'), { skills: parsed.data.skills });
    return c.body(null, 204);
  });

  app.patch('/api/people/v1/me/bio', async (c) => {
    const parsed = bioBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    await setBio(c.get('user'), { bio: parsed.data.bio });
    return c.body(null, 204);
  });
}
