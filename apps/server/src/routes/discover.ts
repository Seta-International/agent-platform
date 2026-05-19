import type { Hono } from 'hono';
import { z } from 'zod';

const discoverSchema = z.object({ email: z.string().email() });

// biome-ignore lint/suspicious/noExplicitAny: accepts any Hono env so callers with richer envs (SessionEnv) can pass their app directly
export function registerDiscoverRoute(app: Hono<any>): void {
  app.post('/api/identity/v1/auth/discover', async (c) => {
    const parsed = discoverSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: 'invalid_email' }, 400);
    // A1 always returns 'credential'. A2 will check identity.tenant_sso_providers by email domain.
    return c.json({ provider_id: 'credential' });
  });
}
