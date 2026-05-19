import { createContributionRegistry, runMigrations } from '@seta/core';
import { resetCoreDb } from '@seta/core/internal/test-support';
import { registerCoreContributions } from '@seta/core/register';
import { createUser } from '@seta/identity';
import { auth } from '@seta/identity/auth';
import { registerIdentityContributions } from '@seta/identity/register';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';

describe('better-auth round-trip (§A2)', () => {
  it('signs in a user we created and getSession returns them', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const reg = createContributionRegistry();
          registerCoreContributions(reg);
          registerIdentityContributions(reg);
          await runMigrations(reg, { pool });

          const tenantId = crypto.randomUUID();
          await pool.query(
            `INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'Demo', 'demo')`,
            [tenantId],
          );
          await createUser(
            {
              tenant_id: tenantId,
              email: 'a@d.local',
              name: 'A',
              password: 'sign-in-password-1234',
            },
            { type: 'cli', user_id: null },
          );

          const signIn = await auth.api.signInEmail({
            body: { email: 'a@d.local', password: 'sign-in-password-1234' },
            asResponse: true,
          });
          expect(signIn.status).toBe(200);

          const setCookies = signIn.headers.getSetCookie
            ? signIn.headers.getSetCookie()
            : [signIn.headers.get('set-cookie') ?? ''];
          const cookieHeader = setCookies.join('; ');
          expect(cookieHeader).toMatch(/seta/);

          const sessionCookies = setCookies
            .map((c) => c.split(';')[0])
            .filter(Boolean)
            .join('; ');

          const requestHeaders = new Headers();
          requestHeaders.set('cookie', sessionCookies);
          const session = await auth.api.getSession({ headers: requestHeaders });
          expect(session?.user.email).toBe('a@d.local');
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
