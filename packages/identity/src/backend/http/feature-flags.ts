import {
  FlagError,
  getFeatureFlagUsage,
  listFeatureFlags,
  type SessionEnv,
  setFeatureFlag,
} from '@seta/core';
import type { Context, Hono } from 'hono';
import { z } from 'zod';
import { getUserProfile } from '../domain/get-user-profile.ts';
import { listUsers } from '../domain/list-users.ts';

const strategyConfig = z.object({
  kind: z.string().min(1),
  config: z.record(z.string(), z.unknown()).optional(),
});
const setBody = z.object({ strategies: z.array(strategyConfig) });

function statusFor(code: FlagError['code']): 400 | 403 {
  return code === 'FORBIDDEN' ? 403 : 400;
}

async function guard<T>(c: Context<SessionEnv>, fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof FlagError)
      return c.json({ error: err.code, message: err.message }, statusFor(err.code));
    throw err;
  }
}

export function registerFeatureFlagsRoutes(app: Hono<SessionEnv>): void {
  app.get('/api/identity/v1/feature-flags', async (c) =>
    guard(c, async () => c.json({ flags: await listFeatureFlags(c.get('user')) })),
  );

  // Registered BEFORE /:key so the literal path wins over the param segment.
  app.get('/api/identity/v1/feature-flags/members', async (c) => {
    const scope = c.get('user');
    const ids = c.req.query('ids');
    if (ids) {
      const profiles = await Promise.all(ids.split(',').map((id) => getUserProfile(id)));
      return c.json({
        rows: profiles
          .filter((p): p is NonNullable<typeof p> => Boolean(p))
          .map((p) => ({ user_id: p.user_id, display_name: p.display_name, email: p.email })),
      });
    }
    const search = c.req.query('search') ?? undefined;
    const pageSize = Math.min(parseInt(c.req.query('pageSize') ?? '20', 10), 50);
    const result = await listUsers(scope.tenant_id, { search, limit: pageSize, offset: 0 });
    return c.json({
      rows: result.rows.map((u) => ({
        user_id: u.user_id,
        display_name: u.name,
        email: u.email,
      })),
    });
  });

  app.post('/api/identity/v1/feature-flags/:key', async (c) => {
    const parsed = setBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return guard(c, async () => {
      await setFeatureFlag(c.get('user'), {
        key: c.req.param('key'),
        strategies: parsed.data.strategies,
      });
      return c.json({ ok: true });
    });
  });

  app.get('/api/identity/v1/feature-flags/:key/usage', async (c) =>
    guard(c, async () => c.json(await getFeatureFlagUsage(c.get('user'), c.req.param('key')))),
  );
}
