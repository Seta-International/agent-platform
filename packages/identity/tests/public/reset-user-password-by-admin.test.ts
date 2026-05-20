import { resetCoreDb } from '@seta/core/internal/test-support';
import { createUser, IdentityError, resetUserPasswordByAdmin } from '@seta/identity';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { argon2id } from '../../src/backend/password/argon2.ts';

const CLI_ACTOR = { type: 'cli' as const, user_id: null };

async function setupTenantAndAdmin(pool: import('pg').Pool): Promise<{
  tenantId: string;
  adminId: string;
}> {
  const tenantId = crypto.randomUUID();
  await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'T', $2)`, [
    tenantId,
    `t-${tenantId.slice(0, 8)}`,
  ]);
  const { user_id: adminId } = await createUser(
    {
      tenant_id: tenantId,
      email: 'admin@t.local',
      name: 'Admin',
      password: 'admin-password-1234',
      initial_role: { role_slug: 'org.admin', scope_type: 'tenant', scope_id: null },
    },
    CLI_ACTOR,
  );
  return { tenantId, adminId };
}

describe('@seta/identity resetUserPasswordByAdmin', () => {
  it('generates a new password and emits password_reset.by_admin', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const { tenantId, adminId } = await setupTenantAndAdmin(pool);
          const { user_id: subjectId } = await createUser(
            {
              tenant_id: tenantId,
              email: 'subject@t.local',
              name: 'Subject',
              password: 'subject-password-1234',
            },
            CLI_ACTOR,
          );

          const { password } = await resetUserPasswordByAdmin(
            { tenant_id: tenantId, user_id: subjectId },
            { type: 'user', user_id: adminId },
          );

          expect(password).toMatch(/^[A-Za-z0-9\-_]{24,}$/);

          const { rows } = await pool.query<{ password: string }>(
            `SELECT password FROM identity.account WHERE user_id = $1 AND provider_id = 'credential'`,
            [subjectId],
          );
          expect(await argon2id.verify(rows[0]!.password, password)).toBe(true);

          const { rows: events } = await pool.query<{ event_type: string; payload: unknown }>(
            `SELECT event_type, payload FROM core.events
             WHERE tenant_id = $1 AND event_type = 'identity.user.password_reset.by_admin'`,
            [tenantId],
          );
          expect(events).toHaveLength(1);
          const payload = events[0]!.payload as {
            user_id: string;
            tenant_id: string;
            actor: { user_id: string };
          };
          expect(payload.user_id).toBe(subjectId);
          expect(payload.tenant_id).toBe(tenantId);
          expect(payload.actor.user_id).toBe(adminId);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('refuses for users with no local credential account', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const { tenantId, adminId } = await setupTenantAndAdmin(pool);
          const { user_id: subjectId } = await createUser(
            {
              tenant_id: tenantId,
              email: 'sso@t.local',
              name: 'SSO Only',
              password: 'sso-password-1234',
            },
            CLI_ACTOR,
          );

          // Remove the credential account row to simulate SSO-only user.
          await pool.query(
            `DELETE FROM identity.account WHERE user_id = $1 AND provider_id = 'credential'`,
            [subjectId],
          );

          await expect(
            resetUserPasswordByAdmin(
              { tenant_id: tenantId, user_id: subjectId },
              { type: 'user', user_id: adminId },
            ),
          ).rejects.toThrow(IdentityError);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('refuses when caller lacks identity.user.write permission', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const tenantId = crypto.randomUUID();
          await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'T', $2)`, [
            tenantId,
            `t-${tenantId.slice(0, 8)}`,
          ]);

          // viewer has identity.viewer (read) but not identity.user.write
          const { user_id: viewerId } = await createUser(
            {
              tenant_id: tenantId,
              email: 'viewer@t.local',
              name: 'Viewer',
              password: 'viewer-password-1234',
              initial_role: { role_slug: 'identity.viewer', scope_type: 'tenant', scope_id: null },
            },
            CLI_ACTOR,
          );
          const { user_id: subjectId } = await createUser(
            {
              tenant_id: tenantId,
              email: 'subject@t.local',
              name: 'Subject',
              password: 'subject-password-1234',
            },
            CLI_ACTOR,
          );

          await expect(
            resetUserPasswordByAdmin(
              { tenant_id: tenantId, user_id: subjectId },
              { type: 'user', user_id: viewerId },
            ),
          ).rejects.toThrow(IdentityError);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
