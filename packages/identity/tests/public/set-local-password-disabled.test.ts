import { createContributionRegistry, runMigrations } from '@seta/core';
import { resetCoreDb } from '@seta/core/internal/test-support';
import { registerCoreContributions } from '@seta/core/register';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { IdentityError, setLocalPasswordDisabled } from '../../src/index.ts';
import { registerIdentityContributions } from '../../src/register.ts';

const CLI_ACTOR = { type: 'cli' as const, user_id: null };

describe('setLocalPasswordDisabled', () => {
  it('throws NO_SSO_PROVIDER when disabled=true and no enabled provider exists', async () => {
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
            `INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'LockTest', 'lock-test')`,
            [tenantId],
          );

          await expect(
            setLocalPasswordDisabled({ tenant_id: tenantId, disabled: true }, CLI_ACTOR),
          ).rejects.toSatisfy(
            (e: unknown) => e instanceof IdentityError && e.code === 'NO_SSO_PROVIDER',
          );
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('flips the flag and emits the event when an enabled SSO provider exists', async () => {
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
            `INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'LockTest2', 'lock-test-2')`,
            [tenantId],
          );

          // Seed an enabled SSO provider so the guard passes
          await pool.query(
            `INSERT INTO identity.tenant_sso_providers (tenant_id, provider_id, enabled, config, email_domains)
             VALUES ($1, 'microsoft-entra-id', true, $2::jsonb, $3)`,
            [
              tenantId,
              JSON.stringify({
                entra_tenant_id: '11111111-2222-3333-4444-555555555555',
                consent_granted_at: null,
                consent_granted_by_oid: null,
                consent_granted_by_email: null,
              }),
              ['acme.com'],
            ],
          );

          await setLocalPasswordDisabled({ tenant_id: tenantId, disabled: true }, CLI_ACTOR);

          // Verify the flag was flipped
          const { rows: tenantRows } = await pool.query<{ local_password_disabled: boolean }>(
            `SELECT local_password_disabled FROM core.tenants WHERE id = $1`,
            [tenantId],
          );
          expect(tenantRows[0]?.local_password_disabled).toBe(true);

          // Verify the event was emitted
          const { rows: events } = await pool.query<{ event_type: string; payload: unknown }>(
            `SELECT event_type, payload FROM core.events WHERE tenant_id = $1`,
            [tenantId],
          );
          expect(events).toHaveLength(1);
          expect(events[0]?.event_type).toBe('core.tenant.local_password_disabled.changed');
          expect((events[0]?.payload as { disabled?: boolean }).disabled).toBe(true);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
