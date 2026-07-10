import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { registerCredentialGate } from '../../src/routes/credential-gate.ts';

// FUT-540: the whole gate body sits inside try { ... } catch { /* fall through */ }.
// Before Fix 3, the core.tenants read reached coreDb() with no scoped() context open,
// so ExecutorContextError was swallowed by that catch — an SSO-only tenant would
// silently accept a password sign-in instead of getting turned away with 403. This is
// the security-regression guard: it must fail loudly if the gate stops running, not
// pass by accident.
describe('credential gate (FUT-540 security regression)', () => {
  it('rejects password sign-in with 403 when the discovered tenant has local passwords disabled', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        initPools({ databaseUrl });
        try {
          const tenantId = crypto.randomUUID();
          await pool.query(
            `INSERT INTO core.tenants (id, name, slug, local_password_disabled, email_domains)
             VALUES ($1, 'SSO Only Co', $2, true, $3)`,
            [tenantId, `sso-only-${tenantId.slice(0, 8)}`, ['ssotenant.test']],
          );
          await pool.query(
            `INSERT INTO identity.tenant_sso_providers (tenant_id, provider_id, enabled, config)
             VALUES ($1, 'microsoft-entra-id', true, '{}'::jsonb)`,
            [tenantId],
          );

          const app = new Hono();
          registerCredentialGate(app);
          // Stand-in for better-auth's handler further down the chain — proves the
          // gate stopped the request rather than merely happening to reach here too.
          app.post('/api/identity/v1/auth/sign-in/email', (c) => c.json({ signed_in: true }));

          const res = await app.request('/api/identity/v1/auth/sign-in/email', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ email: 'someone@ssotenant.test', password: 'irrelevant' }),
          });

          expect(res.status).toBe(403);
          const body = (await res.json()) as { code?: string };
          expect(body.code).toBe('LOCAL_PASSWORD_DISABLED');
        } finally {
          await closePools();
        }
      },
    );
  });
});
