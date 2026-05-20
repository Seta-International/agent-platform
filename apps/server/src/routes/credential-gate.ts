import { coreDb } from '@seta/core/db';
import { coreTenants } from '@seta/core/db/schema';
import { discoverProvider } from '@seta/identity';
import { eq } from 'drizzle-orm';
import type { Hono } from 'hono';

// biome-ignore lint/suspicious/noExplicitAny: accepts any Hono env so callers with richer envs (SessionEnv) can pass their app directly
export function registerCredentialGate(app: Hono<any>): void {
  app.post('/api/identity/v1/auth/sign-in/email', async (c, next) => {
    try {
      const cloned = c.req.raw.clone();
      const body = (await cloned.json().catch(() => ({}))) as { email?: string };
      const email = body.email ?? '';
      const disc = await discoverProvider(email);
      if (disc.tenant_id) {
        const [tenant] = await coreDb()
          .select({ local_password_disabled: coreTenants.local_password_disabled })
          .from(coreTenants)
          .where(eq(coreTenants.id, disc.tenant_id))
          .limit(1);
        if (tenant?.local_password_disabled) {
          return c.json(
            {
              code: 'LOCAL_PASSWORD_DISABLED',
              message: 'This tenant requires Microsoft Entra sign-in.',
            },
            403,
          );
        }
      }
    } catch {
      // If discovery fails for any reason, allow the request to fall through to better-auth.
    }
    await next();
  });
}
